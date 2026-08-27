import type { Prisma, PrismaClient } from '@prisma/client';
import { generateSecureToken, slugify } from '../../../shared/utils/crypto.js';
import type {
  CreateProductInput,
  IProductRepository,
  MakeupTypeDto,
  ProductDto,
  ProductListFilter,
  UpdateProductInput,
} from '../interfaces/product.repository.interface.js';

function mapMakeupType(row: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  benefits: string[];
  concerns: string[];
}): MakeupTypeDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    benefits: row.benefits,
    concerns: row.concerns,
  };
}

type ProductRow = {
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
  isActive: boolean;
  ingredients: Array<{ ingredient: Parameters<typeof mapMakeupType>[0] }>;
};

function mapProduct(row: ProductRow): ProductDto {
  return {
    id: row.id,
    socoId: row.socoId,
    datasetId: row.datasetId,
    brand: row.brand,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.imageUrl,
    category: row.category,
    subcategory: row.subcategory,
    mainCategory: row.mainCategory,
    finish: row.finish,
    undertoneMatch: row.undertoneMatch,
    usage: row.usage,
    benefits: row.benefits,
    tags: row.tags,
    rating: row.rating,
    reviewCount: row.reviewCount,
    minPrice: row.minPrice,
    maxPrice: row.maxPrice,
    price: row.price,
    originalPrice: row.originalPrice,
    shade: row.shade,
    suitableSkinTones: row.suitableSkinTones,
    suitableUndertones: row.suitableUndertones,
    suitableSkinTypes: row.suitableSkinTypes,
    targetsConcerns: row.targetsConcerns,
    matchScoreWeight: row.matchScoreWeight,
    sourceUrl: row.sourceUrl,
    affiliateUrl: row.affiliateUrl,
    // Was previously omitted here even though the row carries it — the frontend's
    // Product.status ('Active' | 'Draft') read this field and silently fell back
    // to 'Draft' for every product. See CHANGELOG.md.
    isActive: row.isActive,
    makeupTypes: row.ingredients.map((link) => mapMakeupType(link.ingredient)),
  };
}

const productInclude = {
  ingredients: {
    include: { ingredient: true },
  },
} as const;

export class ProductRepository implements IProductRepository {
  constructor(private readonly db: PrismaClient) {}

  async findAllActive(filter: ProductListFilter = {}): Promise<ProductDto[]> {
    const where: Prisma.ProductWhereInput = { isActive: true };

    if (filter.category) {
      where.category = { equals: filter.category, mode: 'insensitive' };
    }
    if (filter.subcategory) {
      where.subcategory = { equals: filter.subcategory, mode: 'insensitive' };
    }
    if (filter.mainCategory) {
      where.mainCategory = { equals: filter.mainCategory, mode: 'insensitive' };
    }
    if (filter.brand) {
      where.brand = { equals: filter.brand, mode: 'insensitive' };
    }
    if (filter.finish) {
      where.finish = { equals: filter.finish, mode: 'insensitive' };
    }
    if (filter.minPrice != null || filter.maxPrice != null) {
      where.price = {
        ...(filter.minPrice != null ? { gte: filter.minPrice } : {}),
        ...(filter.maxPrice != null ? { lte: filter.maxPrice } : {}),
      };
    }
    if (filter.q) {
      where.OR = [
        { name: { contains: filter.q, mode: 'insensitive' } },
        { brand: { contains: filter.q, mode: 'insensitive' } },
        { subcategory: { contains: filter.q, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput[] = (() => {
      switch (filter.sort) {
        case 'price_asc':
          return [{ price: 'asc' }];
        case 'price_desc':
          return [{ price: 'desc' }];
        case 'rating':
          return [{ rating: 'desc' }];
        case 'reviewCount':
          return [{ reviewCount: 'desc' }];
        default:
          return [{ reviewCount: 'desc' }, { rating: 'desc' }, { brand: 'asc' }];
      }
    })();

    const pageSize = filter.pageSize ?? filter.limit ?? 1500;
    const skip = filter.page && filter.page > 1 ? (filter.page - 1) * pageSize : undefined;

    const rows = await this.db.product.findMany({
      where,
      include: productInclude,
      orderBy,
      take: pageSize,
      skip,
    });
    return rows.map(mapProduct);
  }

  async findById(id: string): Promise<ProductDto | null> {
    const row = await this.db.product.findFirst({
      where: { id, isActive: true },
      include: productInclude,
    });
    return row ? mapProduct(row) : null;
  }

  async findByMakeupTypes(makeupTypes: string[], limit = 40): Promise<ProductDto[]> {
    if (makeupTypes.length === 0) {
      return this.findCandidatesForRecommendation(limit);
    }

    const rows = await this.db.product.findMany({
      where: {
        isActive: true,
        OR: [
          { subcategory: { in: makeupTypes, mode: 'insensitive' } },
          { tags: { hasSome: makeupTypes } },
          {
            ingredients: {
              some: {
                ingredient: {
                  name: { in: makeupTypes, mode: 'insensitive' },
                },
              },
            },
          },
        ],
      },
      include: productInclude,
      orderBy: [{ reviewCount: 'desc' }, { rating: 'desc' }],
      take: limit,
    });

    return rows.map(mapProduct);
  }

  async findCandidatesForRecommendation(limit = 80): Promise<ProductDto[]> {
    const rows = await this.db.product.findMany({
      where: { isActive: true },
      include: productInclude,
      orderBy: [{ reviewCount: 'desc' }, { rating: 'desc' }],
      take: limit,
    });
    return rows.map(mapProduct);
  }

  async findByIds(ids: string[]): Promise<ProductDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.product.findMany({
      where: { id: { in: ids }, isActive: true },
      include: productInclude,
    });
    return rows.map(mapProduct);
  }

  async listCategories(): Promise<string[]> {
    const rows = await this.db.product.findMany({
      where: { isActive: true },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return rows.map((r) => r.category);
  }

  async listBrands(): Promise<string[]> {
    const rows = await this.db.product.findMany({
      where: { isActive: true },
      distinct: ['brand'],
      select: { brand: true },
      orderBy: { brand: 'asc' },
    });
    return rows.map((r) => r.brand);
  }

  async create(data: CreateProductInput): Promise<ProductDto> {
    const slug = `${slugify(`${data.brand}-${data.name}`)}-${generateSecureToken(3)}`;
    const description = `${data.brand} ${data.name}${data.shade ? ` — shade ${data.shade}` : ''}.`;

    const row = await this.db.product.create({
      data: {
        brand: data.brand,
        name: data.name,
        slug,
        description,
        category: data.category,
        mainCategory: data.mainCategory,
        price: data.price,
        originalPrice: data.originalPrice,
        imageUrl: data.imageUrl,
        affiliateUrl: data.affiliateUrl,
        shade: data.shade,
        suitableSkinTones: data.suitableSkinTones ?? [],
        suitableUndertones: data.suitableUndertones ?? [],
        suitableSkinTypes: data.suitableSkinTypes ?? [],
        targetsConcerns: data.targetsConcerns ?? [],
        matchScoreWeight: data.matchScoreWeight ?? 80,
        isActive: data.isActive ?? true,
      },
      include: productInclude,
    });
    return mapProduct(row);
  }

  async update(id: string, data: UpdateProductInput): Promise<ProductDto> {
    const row = await this.db.product.update({
      where: { id },
      data: {
        brand: data.brand,
        name: data.name,
        category: data.category,
        mainCategory: data.mainCategory,
        price: data.price,
        originalPrice: data.originalPrice,
        imageUrl: data.imageUrl,
        affiliateUrl: data.affiliateUrl,
        shade: data.shade,
        suitableSkinTones: data.suitableSkinTones,
        suitableUndertones: data.suitableUndertones,
        suitableSkinTypes: data.suitableSkinTypes,
        targetsConcerns: data.targetsConcerns,
        matchScoreWeight: data.matchScoreWeight,
        isActive: data.isActive,
      },
      include: productInclude,
    });
    return mapProduct(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.db.product.update({ where: { id }, data: { isActive: false } });
  }
}
