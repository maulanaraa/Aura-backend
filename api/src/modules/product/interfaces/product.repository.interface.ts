export interface MakeupTypeDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  benefits: string[];
  concerns: string[];
}

export type IngredientDto = MakeupTypeDto;

export interface ProductDto {
  id: string;
  socoId: string | null;
  datasetId: string | null;
  brand: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  category: string;
  subcategory: string | null;
  mainCategory: string | null;
  finish: string | null;
  undertoneMatch: string | null;
  usage: string | null;
  benefits: string[];
  tags: string[];
  rating: number | null;
  reviewCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  price: number;
  originalPrice: number | null;
  shade: string | null;
  suitableSkinTones: string[];
  suitableUndertones: string[];
  suitableSkinTypes: string[];
  targetsConcerns: string[];
  matchScoreWeight: number;
  sourceUrl: string | null;
  affiliateUrl: string | null;
  /** Master-catalog status the frontend maps to Product.status ('Active' | 'Draft'). Was previously dropped from the response — see CHANGELOG. */
  isActive: boolean;
  makeupTypes: MakeupTypeDto[];
}

export interface ProductListFilter {
  category?: string;
  subcategory?: string;
  mainCategory?: string;
  brand?: string;
  finish?: string;
  minPrice?: number;
  maxPrice?: number;
  q?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
  sort?: 'price_asc' | 'price_desc' | 'rating' | 'reviewCount';
}

export interface CreateProductInput {
  brand: string;
  name: string;
  category: string;
  mainCategory?: string;
  price: number;
  originalPrice?: number;
  imageUrl?: string;
  affiliateUrl?: string;
  shade?: string;
  suitableSkinTones?: string[];
  suitableUndertones?: string[];
  suitableSkinTypes?: string[];
  targetsConcerns?: string[];
  matchScoreWeight?: number;
  isActive?: boolean;
}

export type UpdateProductInput = Partial<CreateProductInput> & { isActive?: boolean };

export interface IProductRepository {
  findAllActive(filter?: ProductListFilter): Promise<ProductDto[]>;
  findById(id: string): Promise<ProductDto | null>;
  findByMakeupTypes(makeupTypes: string[], limit?: number): Promise<ProductDto[]>;
  findCandidatesForRecommendation(limit?: number): Promise<ProductDto[]>;
  findByIds(ids: string[]): Promise<ProductDto[]>;
  listCategories(): Promise<string[]>;
  listBrands(): Promise<string[]>;
  create(data: CreateProductInput): Promise<ProductDto>;
  update(id: string, data: UpdateProductInput): Promise<ProductDto>;
  softDelete(id: string): Promise<void>;
}

export interface IIngredientRepository {
  findAll(): Promise<MakeupTypeDto[]>;
  findByNames(names: string[]): Promise<MakeupTypeDto[]>;
}
