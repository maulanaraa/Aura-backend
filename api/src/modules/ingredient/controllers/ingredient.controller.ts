import type { Request, Response } from 'express';
import { sendSuccess } from '../../../shared/utils/api-response.js';
import type { IngredientService } from '../services/ingredient.service.js';

export class IngredientController {
  constructor(private readonly ingredientService: IngredientService) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    const ingredients = await this.ingredientService.list();
    sendSuccess(res, ingredients);
  };
}
