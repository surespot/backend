import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { ImageProcessorService } from './image-processor.service';
import { IStorageService } from './interfaces/storage.interface';
import { CloudinaryStorageProvider } from './providers/cloudinary-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { STORAGE_SERVICE } from './storage.constants';

export { STORAGE_SERVICE };

@Global()
@Module({})
export class StorageModule {
  static forRoot(): DynamicModule {
    return {
      module: StorageModule,
      imports: [ConfigModule, CloudinaryModule],
      providers: [
        ImageProcessorService,
        CloudinaryStorageProvider,
        S3StorageProvider,
        {
          provide: STORAGE_SERVICE,
          useFactory: (
            config: ConfigService,
            cloudinary: CloudinaryStorageProvider,
            s3: S3StorageProvider,
          ): IStorageService => {
            const provider =
              config.get<'cloudinary' | 's3'>('STORAGE_PROVIDER') ?? 'cloudinary';
            return provider === 's3' ? s3 : cloudinary;
          },
          inject: [ConfigService, CloudinaryStorageProvider, S3StorageProvider],
        },
      ],
      exports: [STORAGE_SERVICE],
    };
  }
}
