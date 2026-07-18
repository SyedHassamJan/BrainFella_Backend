import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'src/types/enums';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { CompleteAppointmentDto } from './dto/complete-appointment.dto';

@UseGuards(JwtAuthGuard)
@Controller('appointment')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Roles(Role.PATIENT)
  @UseGuards(RolesGuard)
  @Post()
  create(@Request() req, @Body() dto: CreateAppointmentDto) {
    return this.appointmentService.create(req.user.id, dto);
  }

  @Get('my')
  getMyAppointments(@Request() req) {
    return this.appointmentService.getMyAppointments(req.user.id, req.user.role);
  }

  @Roles(Role.THERAPIST)
  @UseGuards(RolesGuard)
  @Patch(':id/confirm')
  confirm(@Param('id') id: string, @Request() req) {
    return this.appointmentService.confirm(id, req.user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Request() req) {
    return this.appointmentService.cancel(id, req.user.id, req.user.role);
  }

  @Roles(Role.THERAPIST)
  @UseGuards(RolesGuard)
  @Patch(':id/complete')
  complete(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: CompleteAppointmentDto,
  ) {
    return this.appointmentService.complete(id, req.user.id, dto);
  }
}
