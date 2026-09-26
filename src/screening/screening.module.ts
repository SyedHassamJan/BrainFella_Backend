import { Module } from '@nestjs/common';
import { ScreeningController } from './screening.controller';
import { ScreeningService } from './screening.service';
import { TextAnalysisService } from './text-analysis.service';
import { MlServiceClient } from './ml-service.client';
import { SignalService } from './signal.service';
import { AssessmentService } from './assessment.service';
import { FusionService } from './fusion/fusion.service';

@Module({
  controllers: [ScreeningController],
  providers: [
    ScreeningService,
    TextAnalysisService,
    MlServiceClient,
    SignalService,
    AssessmentService,
    FusionService,
  ],
  exports: [ScreeningService, TextAnalysisService, AssessmentService, FusionService],
})
export class ScreeningModule {}
