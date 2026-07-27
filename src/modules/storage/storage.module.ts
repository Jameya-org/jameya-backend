import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { CloudinaryProvider } from './cloudinary.provider';

@Module({
  controllers: [StorageController],
  providers: [CloudinaryProvider, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
