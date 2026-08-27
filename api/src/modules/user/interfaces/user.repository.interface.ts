export interface UserDto {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export interface IUserRepository {
  findById(id: string): Promise<{
    id: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
  } | null>;
}
