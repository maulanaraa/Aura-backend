import bcrypt from 'bcrypt';
import { appConfig } from '../../config/index.js';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, appConfig.bcryptRounds);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
