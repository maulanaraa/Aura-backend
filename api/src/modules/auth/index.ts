import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { validateRequest } from '../../middlewares/validate.js';
import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';
import type { IAuthRepository } from './interfaces/auth.repository.interface.js';
import type { IEmailService } from '../../shared/services/email.service.js';
import {
  forgotPasswordSchema,
  googleLoginSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  enable2faSchema,
  verify2faSchema,
} from './validators/auth.validator.js';

export interface AuthModuleDeps {
  authRepository: IAuthRepository;
  emailService: IEmailService;
}

export function createAuthModule(deps: AuthModuleDeps): Router {
  const service = new AuthService(deps.authRepository, deps.emailService);
  const controller = new AuthController(service);
  const router = Router();

  /**
   * @openapi
   * /auth/register:
   *   post:
   *     tags: [Auth]
   *     summary: Register a new user
   */
  router.post(
    '/register',
    validateRequest(registerSchema),
    asyncHandler(controller.register),
  );

  router.post('/login', validateRequest(loginSchema), asyncHandler(controller.login));
  router.post('/google', validateRequest(googleLoginSchema), asyncHandler(controller.google));
  router.post('/refresh', validateRequest(refreshTokenSchema), asyncHandler(controller.refresh));
  router.post('/logout', validateRequest(logoutSchema), asyncHandler(controller.logout));
  router.post(
    '/forgot-password',
    validateRequest(forgotPasswordSchema),
    asyncHandler(controller.forgotPassword),
  );
  router.post(
    '/reset-password',
    validateRequest(resetPasswordSchema),
    asyncHandler(controller.resetPassword),
  );
  router.post(
    '/verify-email',
    validateRequest(verifyEmailSchema),
    asyncHandler(controller.verifyEmail),
  );
  router.post(
    '/resend-verification',
    validateRequest(resendVerificationSchema),
    asyncHandler(controller.resendVerification),
  );

  router.post('/2fa/generate', authenticate, asyncHandler(controller.generate2FA));
  router.post('/2fa/enable', authenticate, validateRequest(enable2faSchema), asyncHandler(controller.enable2FA));
  router.post('/2fa/verify', validateRequest(verify2faSchema), asyncHandler(controller.verify2FA));
  router.post('/2fa/disable', authenticate, asyncHandler(controller.disable2FA));

  return router;
}
