import { Module } from '@nestjs/common';
import { ScreeningController } from './screening.controller';
import { ScreeningService } from './screening.service';
import { TextAnalysisService } from './text-analysis.service';
import { MlServiceClient } from './ml-service.client';

@Module({
  controllers: [ScreeningController],
  providers: [ScreeningService, TextAnalysisService, MlServiceClient],
  exports: [ScreeningService, TextAnalysisService], // used by the fusion layer
})
export class ScreeningModule {}
