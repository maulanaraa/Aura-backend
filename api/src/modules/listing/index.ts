import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { resolveAffiliatorId } from '../../middlewares/resolve-affiliator.js';
import { validateRequest } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import {
  ListingController,
  autoFillSchema,
  createListingSchema,
  idParamSchema,
  updateListingSchema,
} from './controllers/listing.controller.js';
import type { IListingRepository } from './interfaces/listing.repository.interface.js';
import { ListingService } from './services/listing.service.js';

export interface ListingModuleDeps {
  db: PrismaClient;
  listingRepository: IListingRepository;
}

export function createListingModule(deps: ListingModuleDeps): Router {
  const service = new ListingService(deps.listingRepository);
  const controller = new ListingController(service);
  const router = Router();

  router.use(authenticate, authorize('AFFILIATOR'), resolveAffiliatorId(deps.db));

  router.get('/', asyncHandler(controller.list));
  router.post('/', validateRequest(createListingSchema), asyncHandler(controller.create));
  router.post('/auto-fill', validateRequest(autoFillSchema), asyncHandler(controller.autoFill));
  router.patch(
    '/:id',
    validateRequest(idParamSchema, 'params'),
    validateRequest(updateListingSchema),
    asyncHandler(controller.update),
  );
  router.delete('/:id', validateRequest(idParamSchema, 'params'), asyncHandler(controller.delete));

  return router;
}
