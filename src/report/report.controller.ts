import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'src/types/enums';

@UseGuards(JwtAuthGuard)
@Controller('report')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('my')
  getMyReports(@Request() req) {
    return this.reportService.getMyReports(req.user.id);
  }

  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  @Get('all')
  getAllReports() {
    return this.reportService.getAllReports();
  }

  @Roles(Role.THERAPIST)
  @UseGuards(RolesGuard)
  @Get('patient/:patientId')
  getPatientReports(@Param('patientId') patientId: string) {
    return this.reportService.getPatientReports(patientId);
  }
}
