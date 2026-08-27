import type {
  IIngredientRepository,
  IngredientDto,
} from '../../product/interfaces/product.repository.interface.js';

export class IngredientService {
  constructor(private readonly ingredientRepository: IIngredientRepository) {}

  list(): Promise<IngredientDto[]> {
    return this.ingredientRepository.findAll();
  }
}
