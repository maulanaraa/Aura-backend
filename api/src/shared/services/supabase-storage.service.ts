import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors/app-error.js';
import { ERROR_CODES, HTTP_STATUS } from '../../constants/index.js';
import type { IStorageService, UploadedImage } from './storage.service.js';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Stores scan selfies in a Supabase Storage bucket instead of local disk.
 * Local disk is unreliable for this data: most Supabase-paired hosts
 * (serverless functions, containers redeployed on every push) don't
 * guarantee a persistent filesystem, so anything written to `uploads/`
 * could vanish before it's ever read again.
 *
 * Uses the service-role key (server-side only, never exposed to the
 * frontend) so it can write to a private-by-default bucket without RLS
 * policies getting in the way.
 */
export class SupabaseStorageService implements IStorageService {
  private readonly client: SupabaseClient;

  constructor(
    supabaseUrl: string,
    serviceRoleKey: string,
    private readonly bucket: string,
  ) {
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async uploadScanImage(buffer: Buffer, mimetype: string): Promise<UploadedImage> {
    const ext = EXT_BY_MIME[mimetype] ?? 'jpg';
    const key = `scans/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;

    const { error } = await this.client.storage.from(this.bucket).upload(key, buffer, {
      contentType: mimetype,
      upsert: false,
    });

    if (error) {
      throw new AppError(`Failed to upload scan image: ${error.message}`, {
        code: ERROR_CODES.INTERNAL_ERROR,
        statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      });
    }

    const { data } = this.client.storage.from(this.bucket).getPublicUrl(key);

    return { key, publicUrl: data.publicUrl };
  }

  async uploadAvatarImage(buffer: Buffer, mimetype: string): Promise<UploadedImage> {
    const ext = EXT_BY_MIME[mimetype] ?? 'jpg';
    const key = `avatars/${randomUUID()}.${ext}`;

    const { error } = await this.client.storage.from(this.bucket).upload(key, buffer, {
      contentType: mimetype,
      upsert: false,
    });

    if (error) {
      throw new AppError(`Failed to upload avatar image: ${error.message}`, {
        code: ERROR_CODES.INTERNAL_ERROR,
        statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      });
    }

    const { data } = this.client.storage.from(this.bucket).getPublicUrl(key);

    return { key, publicUrl: data.publicUrl };
  }
}
