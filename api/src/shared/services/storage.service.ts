/**
 * Storage abstraction for user-uploaded scan images.
 *
 * Separation of concerns: no module outside `shared/services` knows or
 * cares whether images end up in Supabase Storage or on local disk. Swap
 * the implementation wired in `app/container.ts` and nothing else in the
 * codebase changes.
 */
export interface UploadedImage {
  /** Storage-internal key/path (what we persist in Scan.imagePath). */
  key: string;
  /** Publicly reachable URL (what we persist in CustomerLead.selfieUrl). */
  publicUrl: string;
}

export interface IStorageService {
  uploadScanImage(buffer: Buffer, mimetype: string): Promise<UploadedImage>;
  uploadAvatarImage(buffer: Buffer, mimetype: string): Promise<UploadedImage>;
}
