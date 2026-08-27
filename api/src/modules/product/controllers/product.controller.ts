import type { Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/app-error.js';
import { sendCreated, sendSuccess } from '../../../shared/utils/api-response.js';
import type { ProductService } from '../services/product.service.js';

export const createProductSchema = z.object({
  brand: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(80),
  mainCategory: z.enum(['Lips', 'Face & Shade']).optional(),
  price: z.coerce.number().int().min(0),
  originalPrice: z.coerce.number().int().min(0).optional(),
  imageUrl: z.string().url().optional(),
  affiliateUrl: z.string().url().optional(),
  shade: z.string().max(200).optional(),
  suitableSkinTones: z.array(z.string()).optional(),
  suitableUndertones: z.array(z.string()).optional(),
  suitableSkinTypes: z.array(z.string()).optional(),
  targetsConcerns: z.array(z.string()).optional(),
  matchScoreWeight: z.coerce.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const productQuerySchema = z.object({
  category: z.string().min(1).max(80).optional(),
  subcategory: z.string().min(1).max(80).optional(),
  mainCategory: z.string().min(1).max(40).optional(),
  brand: z.string().min(1).max(80).optional(),
  finish: z.string().min(1).max(40).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  q: z.string().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(2000).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'rating', 'reviewCount']).optional(),
});

export class ProductController {
  constructor(private readonly productService: ProductService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const parsed = productQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query parameters', {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    const products = await this.productService.list(parsed.data);
    sendSuccess(res, products, 200, { count: products.length });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const product = await this.productService.getById(String(req.params.id));
    sendSuccess(res, product);
  };

  categories = async (_req: Request, res: Response): Promise<void> => {
    const categories = await this.productService.listCategories();
    sendSuccess(res, categories);
  };

  brands = async (_req: Request, res: Response): Promise<void> => {
    const brands = await this.productService.listBrands();
    sendSuccess(res, brands);
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const product = await this.productService.create(req.body);
    sendCreated(res, product);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const product = await this.productService.update(String(req.params.id), req.body);
    sendSuccess(res, product);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.productService.remove(String(req.params.id));
    sendSuccess(res, { message: 'Product deactivated' });
  };
}
