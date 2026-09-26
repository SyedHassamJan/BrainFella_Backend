import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'src/types/enums';
import { ScreeningService } from './screening.service';
import { AssessmentService } from './assessment.service';
import { AnalyzeTextDto } from './dto/analyze-text.dto';
import { AnalyzeVoiceDto } from './dto/analyze-voice.dto';
import { AnalyzeFaceDto } from './dto/analyze-face.dto';

// JwtAuthGuard must run before RolesGuard, so both go in one decorator, in order.
// Patients by default; a method-level @Roles overrides the class-level one.
@Roles(Role.PATIENT)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('screening')
export class ScreeningController {
  constructor(
    private readonly screeningService: ScreeningService,
    private readonly assessmentService: AssessmentService,
  ) {}

  @Post('analyze-text')
  analyzeText(@Request() req, @Body() dto: AnalyzeTextDto) {
    return this.screeningService.analyzeText(req.user.id, dto.text);
  }

  // Large base64 bodies (voice and face): see the route-specific limits in main.ts.
  @Post('analyze-voice')
  analyzeVoice(@Request() req, @Body() dto: AnalyzeVoiceDto) {
    return this.screeningService.analyzeVoice(req.user.id, dto.audio, dto.language);
  }

  @Post('analyze-face')
  analyzeFace(@Request() req, @Body() dto: AnalyzeFaceDto) {
    return this.screeningService.analyzeFace(req.user.id, dto.image);
  }

  /** Fuse the user's recent questionnaires and screening signals into a risk indicator. */
  @Post('assess')
  assess(@Request() req) {
    return this.assessmentService.assess(req.user.id);
  }

  /** Past risk-indicator assessments, oldest first (for the progress chart). */
  @Get('history')
  getMyHistory(@Request() req) {
    return this.assessmentService.getMyHistory(req.user.id);
  }

  @Roles(Role.THERAPIST)
  @Get('history/:userId')
  getPatientHistory(@Request() req, @Param('userId') userId: string) {
    return this.assessmentService.getPatientHistory(req.user.id, userId);
  }
}
