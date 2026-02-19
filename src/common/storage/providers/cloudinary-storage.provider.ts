import { Injectable } from '@nestjs/common';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { ImageProcessorService } from '../image-processor.service';
import {
  IStorageService,
  UploadResult,
  UploadOptions,
} from '../interfaces/storage.interface';

@Injectable()
export class CloudinaryStorageProvider implements IStorageService {
  constructor(
    private readonly cloudinaryService: CloudinaryService,
    private readonly imageProcessor: ImageProcessorService,
  ) {}

  async uploadImage(
    file: Express.Multer.File,
    options?: UploadOptions,
  ): Promise<UploadResult> {
    const processed = await this.imageProcessor.process(file);
    const fileToUpload = { ...file, buffer: processed.buffer };
    const result = await this.cloudinaryService.uploadImage(fileToUpload);
    const secure_url = (result as { secure_url?: string }).secure_url ?? '';
    return {
      url: secure_url,
      secure_url,
    };
  }
}
