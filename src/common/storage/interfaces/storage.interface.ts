export interface UploadResult {
  url: string;
  /** Alias for url, for backward compatibility with Cloudinary-style consumers */
  secure_url: string;
  key?: string;
}

export interface UploadOptions {
  folder?: string;
}

export interface IStorageService {
  uploadImage(
    file: Express.Multer.File,
    options?: UploadOptions,
  ): Promise<UploadResult>;
}
