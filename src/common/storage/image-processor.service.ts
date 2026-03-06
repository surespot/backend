import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';

const IMAGE_MIMETYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export interface ProcessedImage {
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class ImageProcessorService {
  private readonly maxWidth: number;
  private readonly maxHeight: number;
  private readonly quality: number;

  constructor(private readonly configService: ConfigService) {
    this.maxWidth = Number(
      this.configService.get<number>('IMAGE_MAX_WIDTH') ?? 1920,
    );
    this.maxHeight = Number(
      this.configService.get<number>('IMAGE_MAX_HEIGHT') ?? 1920,
    );
    this.quality = Number(
      this.configService.get<number>('IMAGE_QUALITY') ?? 85,
    );
  }

  /**
   * Resize image if it's a supported image type. Non-image files (e.g. PDFs) are returned unchanged.
   */
  async process(file: Express.Multer.File): Promise<ProcessedImage> {
    const mimetype = (file.mimetype ?? '').toLowerCase();
    if (!IMAGE_MIMETYPES.includes(mimetype)) {
      return {
        buffer: file.buffer,
        mimetype: file.mimetype ?? 'application/octet-stream',
      };
    }

    try {
      const pipeline = sharp(file.buffer).resize(
        this.maxWidth,
        this.maxHeight,
        {
          fit: 'inside',
          withoutEnlargement: true,
        },
      );

      let outputBuffer: Buffer;
      let outputMimetype: string;

      if (mimetype === 'image/png') {
        outputBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
        outputMimetype = 'image/png';
      } else if (mimetype === 'image/webp') {
        outputBuffer = await pipeline
          .webp({ quality: this.quality })
          .toBuffer();
        outputMimetype = 'image/webp';
      } else {
        outputBuffer = await pipeline
          .jpeg({ quality: this.quality })
          .toBuffer();
        outputMimetype = 'image/jpeg';
      }

      return { buffer: outputBuffer, mimetype: outputMimetype };
    } catch (err) {
      throw new Error(
        `Image processing failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
