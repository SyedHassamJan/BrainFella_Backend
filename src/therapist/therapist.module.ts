import { Module } from '@nestjs/common';
import { TherapistService } from './therapist.service';
import { TherapistController } from './therapist.controller';

@Module({
  controllers: [TherapistController],
  providers: [TherapistService],
})
export class TherapistModule {}
