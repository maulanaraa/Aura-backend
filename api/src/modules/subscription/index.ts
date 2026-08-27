import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validateRequest } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { MidtransService } from '../../shared/services/midtrans.service.js';
import { SubscriptionService, SUBSCRIPTION_PLANS } from './services/subscription.service.js';
import { SubscriptionController, checkoutSchema, confirmSchema } from './controllers/subscription.controller.js';
import { resolveAffiliatorId } from '../../middlewares/resolve-affiliator.js';
import { sendSuccess } from '../../shared/utils/api-response.js';

export interface SubscriptionModuleDeps {
  db: PrismaClient;
}

export function createSubscriptionModule(deps: SubscriptionModuleDeps): Router {
  const midtransService = new MidtransService();
  const service = new SubscriptionService(deps.db, midtransService);
  const controller = new SubscriptionController(service);
  const router = Router();

  // Public webhook notification from Midtrans
  router.post('/webhook', asyncHandler(controller.webhook));

  // Public/all plans info
  router.get('/plans', (_req, res) => {
    sendSuccess(res, Object.values(SUBSCRIPTION_PLANS));
  });

  // Authenticated affiliator checkout route
  router.post(
    '/checkout',
    authenticate,
    authorize('AFFILIATOR'),
    resolveAffiliatorId(deps.db),
    validateRequest(checkoutSchema),
    asyncHandler(controller.checkout),
  );

  // Authenticated affiliator confirm payment (e.g. from frontend Snap onSuccess callback)
  router.post(
    '/confirm',
    authenticate,
    authorize('AFFILIATOR'),
    resolveAffiliatorId(deps.db),
    validateRequest(confirmSchema),
    asyncHandler(controller.confirm),
  );

  // Authenticated affiliator cancel active subscription (return to Starter)
  router.post(
    '/cancel',
    authenticate,
    authorize('AFFILIATOR'),
    resolveAffiliatorId(deps.db),
    asyncHandler(controller.cancel),
  );

  return router;
}

export { SubscriptionService, SUBSCRIPTION_PLANS };
