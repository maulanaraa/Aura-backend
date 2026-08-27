import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IStorageService, UploadedImage } from './storage.service.js';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Local-disk fallback storage — used when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * are not configured (local development, CI, tests). Not recommended for
 * production: most hosts don't persist local disk across deploys/restarts.
 *
 * Files are served back out via `express.static` mounted at `/uploads`
 * (see app/create-app.ts), so `publicUrl` is a real, fetchable URL here too.
 */
export class LocalStorageService implements IStorageService {
  private readonly root: string;

  constructor(
    uploadDir: string,
    private readonly publicBaseUrl: string,
  ) {
    this.root = path.resolve(process.cwd(), uploadDir);
    if (!fs.existsSync(this.root)) {
      fs.mkdirSync(this.root, { recursive: true });
    }
  }

  async uploadScanImage(buffer: Buffer, mimetype: string): Promise<UploadedImage> {
    const ext = EXT_BY_MIME[mimetype] ?? 'jpg';
    const filename = `${randomUUID()}.${ext}`;
    const key = `scans/${filename}`;
    const destDir = path.join(this.root, 'scans');
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    await fsp.writeFile(path.join(destDir, filename), buffer);

    return { key, publicUrl: `${this.publicBaseUrl.replace(/\/$/, '')}/${key}` };
  }

  async uploadAvatarImage(buffer: Buffer, mimetype: string): Promise<UploadedImage> {
    const ext = EXT_BY_MIME[mimetype] ?? 'jpg';
    const filename = `${randomUUID()}.${ext}`;
    const key = `avatars/${filename}`;
    const destDir = path.join(this.root, 'avatars');
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    await fsp.writeFile(path.join(destDir, filename), buffer);

    return { key, publicUrl: `${this.publicBaseUrl.replace(/\/$/, '')}/${key}` };
  }
}
