import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MoodService } from './mood.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'src/types/enums';
import { CreateMoodDto } from './dto/create-mood.dto';

@UseGuards(JwtAuthGuard)
@Controller('mood')
export class MoodController {
  constructor(private readonly moodService: MoodService) {}

  @Roles(Role.PATIENT)
  @UseGuards(RolesGuard)
  @Post()
  create(@Request() req, @Body() dto: CreateMoodDto) {
    return this.moodService.create(req.user.id, dto);
  }

  @Get('my')
  getMyLogs(
    @Request() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.moodService.getMyLogs(req.user.id, from, to);
  }

  @Get('insights')
  getInsights(@Request() req) {
    return this.moodService.getInsights(req.user.id);
  }

  @Roles(Role.THERAPIST)
  @UseGuards(RolesGuard)
  @Get('patient/:patientId')
  getPatientLogs(@Param('patientId') patientId: string) {
    return this.moodService.getPatientLogs(patientId);
  }
}
