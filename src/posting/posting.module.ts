import { Module } from '@nestjs/common';
import { MastersModule } from '../masters/masters.module.js';
import { PostingService } from './posting.service.js';

@Module({
  imports: [MastersModule],
  providers: [PostingService],
  exports: [PostingService],
})
export class PostingModule {}