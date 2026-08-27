import { NotFoundError } from '../../../shared/errors/app-error.js';
import type {
  CreateProductInput,
  IProductRepository,
  ProductDto,
  ProductListFilter,
  UpdateProductInput,
} from '../interfaces/product.repository.interface.js';

export class ProductService {
  constructor(private readonly productRepository: IProductRepository) {}

  list(filter?: ProductListFilter): Promise<ProductDto[]> {
    return this.productRepository.findAllActive(filter);
  }

  async getById(id: string): Promise<ProductDto> {
    const product = await this.productRepository.findById(id);
    if (!product) throw new NotFoundError('Product not found');
    return product;
  }

  listCategories(): Promise<string[]> {
    return this.productRepository.listCategories();
  }

  listBrands(): Promise<string[]> {
    return this.productRepository.listBrands();
  }

  create(data: CreateProductInput): Promise<ProductDto> {
    return this.productRepository.create(data);
  }

  async update(id: string, data: UpdateProductInput): Promise<ProductDto> {
    await this.getById(id);
    return this.productRepository.update(id, data);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.productRepository.softDelete(id);
  }
}
