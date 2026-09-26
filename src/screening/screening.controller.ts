import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'src/types/enums';
import { ScreeningService } from './screening.service';
import { AnalyzeTextDto } from './dto/analyze-text.dto';
import { AnalyzeVoiceDto } from './dto/analyze-voice.dto';

// JwtAuthGuard must run before RolesGuard, so both go in one decorator, in order.
@Roles(Role.PATIENT)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('screening')
export class ScreeningController {
  constructor(private readonly screeningService: ScreeningService) {}

  @Post('analyze-text')
  analyzeText(@Request() req, @Body() dto: AnalyzeTextDto) {
    return this.screeningService.analyzeText(req.user.id, dto.text);
  }

  // Large base64 body: see the route-specific body limit in main.ts.
  @Post('analyze-voice')
  analyzeVoice(@Request() req, @Body() dto: AnalyzeVoiceDto) {
    return this.screeningService.analyzeVoice(req.user.id, dto.audio, dto.language);
  }
}
