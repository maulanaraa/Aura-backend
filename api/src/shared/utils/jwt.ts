import jwt from 'jsonwebtoken';
import { appConfig } from '../../config/index.js';
import type { RoleName } from '../../constants/index.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: RoleName;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  jti: string;
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, appConfig.jwt.secret, {
    expiresIn: appConfig.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'type'>,
): string {
  return jwt.sign({ ...payload, type: 'refresh' }, appConfig.jwt.secret, {
    expiresIn: appConfig.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, appConfig.jwt.secret) as AccessTokenPayload;
  if (decoded.type !== 'access') {
    throw new Error('Invalid token type');
  }
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, appConfig.jwt.secret) as RefreshTokenPayload;
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  return decoded;
}

export function getRefreshExpiryDate(): Date {
  const match = /^(\d+)([smhd])$/.exec(appConfig.jwt.refreshExpiresIn);
  const now = Date.now();
  if (!match) {
    return new Date(now + 7 * 24 * 60 * 60 * 1000);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return new Date(now + amount * (multipliers[unit] ?? 86_400_000));
}
