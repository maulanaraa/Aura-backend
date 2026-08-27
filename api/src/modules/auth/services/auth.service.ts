import { randomUUID } from 'node:crypto';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { OAuth2Client } from 'google-auth-library';
import { appConfig } from '../../../config/index.js';
import {
  ConflictError,
  EmailNotVerifiedError,
  UnauthorizedError,
  ValidationError,
} from '../../../shared/errors/app-error.js';
import { generateSecureToken, sha256, slugify } from '../../../shared/utils/crypto.js';
import {
  getRefreshExpiryDate,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../../shared/utils/jwt.js';
import { comparePassword, hashPassword } from '../../../shared/utils/password.js';
import { logger } from '../../../shared/utils/logger.js';
import type { IAuthRepository } from '../interfaces/auth.repository.interface.js';
import type { IEmailService } from '../../../shared/services/email.service.js';
import type {
  AuthResponseDto,
  AuthTokensDto,
  ForgotPasswordResponseDto,
  MessageResponseDto,
} from '../dto/auth.dto.js';
import type {
  ForgotPasswordInput,
  LoginInput,
  LogoutInput,
  RefreshTokenInput,
  RegisterInput,
  ResetPasswordInput,
} from '../validators/auth.validator.js';

/** Minimum wait between verification emails for the same account — keep in sync with the frontend's hardcoded copy in AuthPages.tsx. */
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

export class AuthService {
  private googleClient?: OAuth2Client;

  constructor(
    private readonly authRepository: IAuthRepository,
    private readonly emailService: IEmailService,
  ) {}

  private async issueEmailVerification(userId: string, email: string): Promise<void> {
    const rawToken = generateSecureToken();
    await this.authRepository.createEmailVerificationToken({
      userId,
      tokenHash: sha256(rawToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const verifyUrl = `${appConfig.frontendUrl}/verify-email?token=${rawToken}`;
    await this.emailService.sendVerificationEmail(email, verifyUrl);
  }

  /**
   * Enforces the resend cooldown, then issues+sends a new verification email
   * if allowed. Returns how many seconds remain either way, so the caller
   * (and ultimately the frontend) always knows when the button unlocks next.
   */
  private async issueEmailVerificationWithCooldown(
    userId: string,
    email: string,
  ): Promise<{ sent: boolean; retryAfterSeconds: number }> {
    const latest = await this.authRepository.findLatestEmailVerificationForUser(userId);
    if (latest) {
      const elapsedMs = Date.now() - latest.createdAt.getTime();
      if (elapsedMs < RESEND_COOLDOWN_MS) {
        return {
          sent: false,
          retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000),
        };
      }
    }

    await this.issueEmailVerification(userId, email);
    return { sent: true, retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000) };
  }

  async register(input: RegisterInput): Promise<AuthResponseDto> {
    const existing = await this.authRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('Email is already registered');
    }

    const passwordHash = await hashPassword(input.password);
    const isAffiliator = input.accountType === 'AFFILIATOR';
    const user = await this.authRepository.createUser({
      email: input.email,
      passwordHash,
      name: input.name,
      role: isAffiliator ? 'AFFILIATOR' : 'USER',
      affiliator: isAffiliator
        ? {
            handle: `${slugify(input.email.split('@')[0] ?? 'affiliator')}-${randomUUID().slice(0, 6)}`,
            apiKey: `aura_live_${generateSecureToken(24)}`,
          }
        : undefined,
    });

    const { retryAfterSeconds } = await this.issueEmailVerificationWithCooldown(user.id, user.email);
    logger.info('User registered, verification email sent', { userId: user.id });

    return {
      requiresEmailVerification: true,
      email: user.email,
      retryAfterSeconds,
    };
  }

  async login(input: LoginInput): Promise<AuthResponseDto> {
    const user = await this.authRepository.findByEmail(input.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const valid = await comparePassword(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Special treatment: exempt admin and demo accounts from email verification & 2FA
    const isExempted = ['admin@auraai.local', 'kate@auraai.local'].includes(user.email.toLowerCase());

    if (!user.isEmailVerified && !isExempted) {
      throw new EmailNotVerifiedError();
    }

    if (user.isTwoFactorEnabled && !isExempted) {
      return { requires2FA: true, userId: user.id };
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    logger.info('User logged in', { userId: user.id });

    return {
      user: { id: user.id, email: user.email, role: user.role },
      tokens,
    };
  }

  /**
   * "Sign in with Google" (Google Identity Services). The frontend obtains a
   * signed ID token directly from Google and hands it to us here — we verify
   * it against Google's public keys (no client secret involved), then find
   * or silently create a matching AFFILIATOR account by verified email.
   */
  async loginWithGoogle(idToken: string): Promise<AuthResponseDto> {
    if (!appConfig.googleClientId) {
      throw new ValidationError('Google sign-in is not configured on this server');
    }

    this.googleClient ??= new OAuth2Client(appConfig.googleClientId);

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: appConfig.googleClientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedError('Invalid Google credential');
    }

    if (!payload?.email || !payload.email_verified) {
      throw new UnauthorizedError('Google account email is not verified');
    }

    let user = await this.authRepository.findByEmail(payload.email);

    if (!user) {
      // Google-created accounts have no usable password — a random hash locks out email/password login
      // until the user explicitly sets one via "forgot password".
      const passwordHash = await hashPassword(generateSecureToken(32));
      user = await this.authRepository.createUser({
        email: payload.email,
        passwordHash,
        name: payload.name,
        role: 'AFFILIATOR',
        isEmailVerified: true,
        affiliator: {
          handle: `${slugify(payload.email.split('@')[0] ?? 'affiliator')}-${randomUUID().slice(0, 6)}`,
          apiKey: `aura_live_${generateSecureToken(24)}`,
        },
      });
      logger.info('User registered via Google', { userId: user.id });
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is disabled');
    }

    if (user.isTwoFactorEnabled) {
      return { requires2FA: true, userId: user.id };
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    logger.info('User logged in via Google', { userId: user.id });

    return {
      user: { id: user.id, email: user.email, role: user.role },
      tokens,
    };
  }

  async refresh(input: RefreshTokenInput): Promise<AuthTokensDto> {
    let payload;
    try {
      payload = verifyRefreshToken(input.refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const tokenHash = sha256(input.refreshToken);
    const stored = await this.authRepository.findRefreshTokenByHash(tokenHash);

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token revoked or expired');
    }

    if (stored.userId !== payload.sub || !stored.user.isActive) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Rotate refresh tokens (Stripe-like session hygiene)
    await this.authRepository.revokeRefreshToken(stored.id);
    return this.issueTokens(stored.user.id, stored.user.email, stored.user.role);
  }

  async logout(input: LogoutInput): Promise<void> {
    const tokenHash = sha256(input.refreshToken);
    const stored = await this.authRepository.findRefreshTokenByHash(tokenHash);
    if (stored && !stored.revokedAt) {
      await this.authRepository.revokeRefreshToken(stored.id);
    }
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<ForgotPasswordResponseDto> {
    const user = await this.authRepository.findByEmail(input.email);
    // Always return success to avoid email enumeration
    const message = 'If that email exists, a reset link has been issued';

    if (!user) {
      return { message };
    }

    const rawToken = generateSecureToken();
    await this.authRepository.createPasswordResetToken({
      userId: user.id,
      tokenHash: sha256(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    logger.info('Password reset token created', { userId: user.id });

    return {
      message,
      ...(appConfig.isProduction ? {} : { resetToken: rawToken }),
    };
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const stored = await this.authRepository.findPasswordResetByHash(sha256(input.token));
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new ValidationError('Invalid or expired reset token');
    }

    const passwordHash = await hashPassword(input.password);
    await this.authRepository.updatePassword(stored.userId, passwordHash);
    await this.authRepository.markPasswordResetUsed(stored.id);
    await this.authRepository.revokeAllRefreshTokens(stored.userId);
    logger.info('Password reset completed', { userId: stored.userId });
  }

  async verifyEmail(token: string): Promise<void> {
    const stored = await this.authRepository.findEmailVerificationByHash(sha256(token));
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new ValidationError('Invalid or expired verification link');
    }

    await this.authRepository.updateUser(stored.userId, {
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    });
    await this.authRepository.markEmailVerificationUsed(stored.id);
    await this.authRepository.autoCreateAIPage(stored.userId).catch((err) => {
      logger.error('Failed to auto-create AI Page on email verification', { error: err });
    });
    logger.info('Email verified', { userId: stored.userId });
  }

  async resendVerificationEmail(email: string): Promise<MessageResponseDto> {
    // Message text stays identical across every branch below — only
    // `retryAfterSeconds` varies — so the response never confirms whether
    // the address is registered (same anti-enumeration intent as forgotPassword).
    const message = 'If that email exists and is unverified, a new verification link has been sent';
    const user = await this.authRepository.findByEmail(email);

    if (!user || user.isEmailVerified) {
      return { message, retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000) };
    }

    const { sent, retryAfterSeconds } = await this.issueEmailVerificationWithCooldown(user.id, user.email);
    if (sent) {
      logger.info('Verification email resent', { userId: user.id });
    }

    return { message, retryAfterSeconds };
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: string,
  ): Promise<AuthTokensDto> {
    const jti = randomUUID();
    const accessToken = signAccessToken({
      sub: userId,
      email,
      role: role as 'USER' | 'ADMIN' | 'AFFILIATOR',
    });
    const refreshToken = signRefreshToken({ sub: userId, jti });

    await this.authRepository.createRefreshToken({
      userId,
      tokenHash: sha256(refreshToken),
      expiresAt: getRefreshExpiryDate(),
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: appConfig.jwt.accessExpiresIn,
      tokenType: 'Bearer',
    };
  }
  async generate2FA(userId: string, email: string): Promise<{ secret: string; qrCodeDataUrl: string }> {
    const user = await this.authRepository.findById(userId);
    if (!user) throw new UnauthorizedError('User not found');
    if (user.isTwoFactorEnabled) {
      throw new ConflictError('2FA is already enabled. Disable it before setting up a new device.');
    }

    const secret = speakeasy.generateSecret({ name: `KADA-Capstone (${email})` });
    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url!);

    await this.authRepository.updateUser(userId, { twoFactorSecret: secret.base32 });

    return { secret: secret.base32, qrCodeDataUrl };
  }

  async enable2FA(userId: string, token: string): Promise<void> {
    const user = await this.authRepository.findById(userId);
    if (!user || !user.twoFactorSecret) throw new UnauthorizedError('2FA not configured');

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1,
    });
    if (!isValid) throw new ValidationError('Invalid 2FA code');

    await this.authRepository.updateUser(userId, { isTwoFactorEnabled: true });
  }

  async verify2FA(userId: string, token: string): Promise<AuthResponseDto> {
    const user = await this.authRepository.findById(userId);
    if (!user || !user.twoFactorSecret || !user.isTwoFactorEnabled) {
      throw new UnauthorizedError('2FA not enabled for this user');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1,
    });
    if (!isValid) throw new UnauthorizedError('Invalid 2FA code');

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    logger.info('User logged in with 2FA', { userId: user.id });

    return {
      user: { id: user.id, email: user.email, role: user.role },
      tokens,
    };
  }

  async disable2FA(userId: string): Promise<void> {
    const user = await this.authRepository.findById(userId);
    if (!user) throw new UnauthorizedError('User not found');

    await this.authRepository.updateUser(userId, { 
      isTwoFactorEnabled: false, 
      twoFactorSecret: null 
    });
  }
}
