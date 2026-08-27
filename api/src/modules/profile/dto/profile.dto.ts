export interface ProfileDto {
  id: string;
  userId: string;
  name: string | null;
  gender: string | null;
  age: number | null;
  budgetMax: number | null;
  favoriteBrands: string[];
  occasion: string | null;
  finishPreference: string | null;
  preferredCategories: string[];
  allergies: string[];
  currentProducts: string[];
  createdAt: string;
  updatedAt: string;
}
