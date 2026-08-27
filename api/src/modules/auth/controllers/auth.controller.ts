import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../../constants/index.js';
import { sendCreated, sendSuccess } from '../../../shared/utils/api-response.js';
import type { AuthService } from '../services/auth.service.js';
import type {
  ForgotPasswordInput,
  GoogleLoginInput,
  LoginInput,
  LogoutInput,
  RefreshTokenInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
  Enable2FAInput,
  Verify2FAInput,
} from '../validators/auth.validator.js';

/**
 * Auth HTTP adapter — no business logic.
 */
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const result = await this.authService.register(req.body as RegisterInput);
    sendCreated(res, result);
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const result = await this.authService.login(req.body as LoginInput);
    sendSuccess(res, result);
  };

  google = async (req: Request, res: Response): Promise<void> => {
    const { idToken } = req.body as GoogleLoginInput;
    const result = await this.authService.loginWithGoogle(idToken);
    sendSuccess(res, result);
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const tokens = await this.authService.refresh(req.body as RefreshTokenInput);
    sendSuccess(res, tokens);
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.authService.logout(req.body as LogoutInput);
    sendSuccess(res, { message: 'Logged out' }, HTTP_STATUS.OK);
  };

  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    const result = await this.authService.forgotPassword(req.body as ForgotPasswordInput);
    sendSuccess(res, result);
  };

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    await this.authService.resetPassword(req.body as ResetPasswordInput);
    sendSuccess(res, { message: 'Password updated' });
  };

  verifyEmail = async (req: Request, res: Response): Promise<void> => {
    const { token } = req.body as VerifyEmailInput;
    await this.authService.verifyEmail(token);
    sendSuccess(res, { message: 'Email verified successfully' });
  };

  resendVerification = async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as ResendVerificationInput;
    const result = await this.authService.resendVerificationEmail(email);
    sendSuccess(res, result);
  };

  generate2FA = async (req: Request, res: Response): Promise<void> => {
    const result = await this.authService.generate2FA(req.user!.id, req.user!.email);
    sendSuccess(res, result);
  };

  enable2FA = async (req: Request, res: Response): Promise<void> => {
    const { token } = req.body as Enable2FAInput;
    await this.authService.enable2FA(req.user!.id, token);
    sendSuccess(res, { message: '2FA enabled successfully' });
  };

  verify2FA = async (req: Request, res: Response): Promise<void> => {
    const { userId, token } = req.body as Verify2FAInput;
    const result = await this.authService.verify2FA(userId, token);
    sendSuccess(res, result);
  };

  disable2FA = async (req: Request, res: Response): Promise<void> => {
    await this.authService.disable2FA(req.user!.id);
    sendSuccess(res, { message: '2FA disabled successfully' });
  };
}
