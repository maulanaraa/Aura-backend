import type { PrismaClient } from '@prisma/client';
import type {
  IIngredientRepository,
  IngredientDto,
} from '../../product/interfaces/product.repository.interface.js';

export class IngredientRepository implements IIngredientRepository {
  constructor(private readonly db: PrismaClient) {}

  async findAll(): Promise<IngredientDto[]> {
    const rows = await this.db.ingredient.findMany({ orderBy: { name: 'asc' } });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      benefits: row.benefits,
      concerns: row.concerns,
    }));
  }

  async findByNames(names: string[]): Promise<IngredientDto[]> {
    if (names.length === 0) return [];
    const rows = await this.db.ingredient.findMany({
      where: {
        OR: names.map((name) => ({
          name: { equals: name, mode: 'insensitive' as const },
        })),
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      benefits: row.benefits,
      concerns: row.concerns,
    }));
  }
}
