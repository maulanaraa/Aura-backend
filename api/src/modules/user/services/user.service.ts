import { NotFoundError } from '../../../shared/errors/app-error.js';
import type { UserDto } from '../interfaces/user.repository.interface.js';
import type { IUserRepository } from '../interfaces/user.repository.interface.js';

export class UserService {
  constructor(private readonly userRepository: IUserRepository) {}

  async getMe(userId: string): Promise<UserDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
