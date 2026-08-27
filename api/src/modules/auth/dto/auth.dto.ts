export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  tokenType: 'Bearer';
}

export interface AuthUserDto {
  id: string;
  email: string;
  role: string;
}

export interface AuthResponseDto {
  user?: AuthUserDto;
  tokens?: AuthTokensDto;
  requires2FA?: boolean;
  userId?: string;
  /** Set on register(): no tokens are issued until the user verifies their email. */
  requiresEmailVerification?: boolean;
  email?: string;
  /** How long until another verification email may be requested for this address. */
  retryAfterSeconds?: number;
}

export interface ForgotPasswordResponseDto {
  message: string;
  /** Present only in non-production for local testing */
  resetToken?: string;
}

export interface MessageResponseDto {
  message: string;
  /** How long until another verification email may be requested for this address. */
  retryAfterSeconds?: number;
}
