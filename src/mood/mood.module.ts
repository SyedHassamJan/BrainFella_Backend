import { Module } from '@nestjs/common';
import { MoodService } from './mood.service';
import { MoodController } from './mood.controller';

@Module({
  controllers: [MoodController],
  providers: [MoodService],
})
export class MoodModule {}
