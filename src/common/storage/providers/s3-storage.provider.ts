import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { ImageProcessorService } from '../image-processor.service';
import {
  IStorageService,
  UploadResult,
  UploadOptions,
} from '../interfaces/storage.interface';

@Injectable()
export class S3StorageProvider implements IStorageService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlPrefix: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly imageProcessor: ImageProcessorService,
  ) {
    const region = this.configService.get<string>('AWS_REGION') ?? 'us-east-1';
    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') ?? '',
        secretAccessKey:
          this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ?? '',
      },
    });
    this.bucket =
      this.configService.get<string>('S3_BUCKET_NAME') ?? 'surespot-uploads';
    this.publicUrlPrefix =
      this.configService.get<string>('S3_PUBLIC_URL_PREFIX') ??
      `https://${this.bucket}.s3.${region}.amazonaws.com`;
  }

  async uploadImage(
    file: Express.Multer.File,
    options?: UploadOptions,
  ): Promise<UploadResult> {
    const processed = await this.imageProcessor.process(file);
    const folder = options?.folder ?? 'surespot';
    const safeName = file.originalname
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .slice(0, 100);
    const key = `${folder}/${uuidv4()}-${safeName}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: processed.buffer,
        ContentType: processed.mimetype,
      }),
    );

    const url = `${this.publicUrlPrefix.replace(/\/$/, '')}/${key}`;
    return {
      url,
      secure_url: url,
      key,
    };
  }
}
