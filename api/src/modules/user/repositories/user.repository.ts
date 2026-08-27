import type { PrismaClient } from '@prisma/client';
import type { IUserRepository } from '../interfaces/user.repository.interface.js';

export class UserRepository implements IUserRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string) {
    return this.db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }
}
