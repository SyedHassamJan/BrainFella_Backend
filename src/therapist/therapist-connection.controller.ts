import { Body, Controller, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'src/types/enums';
import { TherapistConnectionService } from './therapist-connection.service';

export class ShareRecordsDto {
  @IsBoolean()
  share: boolean;
}

/** Patient-side: record a WhatsApp contact, and share / stop sharing records with a therapist. */
@Roles(Role.PATIENT)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('therapist')
export class TherapistConnectionController {
  constructor(private readonly connections: TherapistConnectionService) {}

  @Get('connections/me')
  mine(@Request() req) {
    return this.connections.listForPatient(req.user.id);
  }

  /** Called when the patient taps "Chat on WhatsApp". Grants no access to records. */
  @Post(':id/contact')
  contact(@Param('id') profileId: string, @Request() req) {
    return this.connections.contact(req.user.id, profileId);
  }

  @Put(':id/share')
  share(@Param('id') profileId: string, @Request() req, @Body() dto: ShareRecordsDto) {
    return this.connections.setSharing(req.user.id, profileId, dto.share);
  }
}
