import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'src/types/enums';
import { ApplicationStatusFilter, TherapistApplicationService } from './therapist-application.service';
import { RejectTherapistApplicationDto, SubmitTherapistApplicationDto } from './dto/therapist-application.dto';

/** The therapist's own application (profile + CV + photo for admin review). */
@Roles(Role.THERAPIST)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('therapist/application')
export class TherapistApplicationController {
  constructor(private readonly applications: TherapistApplicationService) {}

  @Get('me')
  getMine(@Request() req) {
    return this.applications.getMine(req.user.id);
  }

  @Put()
  submit(@Request() req, @Body() dto: SubmitTherapistApplicationDto) {
    return this.applications.submit(req.user.id, dto);
  }
}

const STATUSES: ApplicationStatusFilter[] = ['PENDING', 'APPROVED', 'REJECTED', 'NOT_SUBMITTED'];

/** Admin review of therapist applications. */
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/therapist-applications')
export class AdminTherapistApplicationController {
  constructor(private readonly applications: TherapistApplicationService) {}

  @Get()
  list(@Query('status') status?: string) {
    if (status && !STATUSES.includes(status as ApplicationStatusFilter)) {
      throw new BadRequestException(`status must be one of ${STATUSES.join(', ')}`);
    }
    return this.applications.list(status as ApplicationStatusFilter | undefined);
  }

  /** Streams one uploaded file (CV or photo) so the admin can view it in the browser. */
  @Get('documents/:documentId')
  async document(@Param('documentId') documentId: string, @Res() res: Response) {
    const doc = await this.applications.getDocument(documentId);
    res.set({
      'Content-Type': doc.mimeType,
      'Content-Length': String(doc.size),
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.fileName)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(Buffer.from(doc.data));
  }

  @Get(':userId')
  getOne(@Param('userId') userId: string) {
    return this.applications.getForAdmin(userId);
  }

  @Patch(':userId/approve')
  approve(@Param('userId') userId: string) {
    return this.applications.approve(userId);
  }

  @Patch(':userId/reject')
  reject(@Param('userId') userId: string, @Body() dto: RejectTherapistApplicationDto) {
    return this.applications.reject(userId, dto.reason);
  }
}
