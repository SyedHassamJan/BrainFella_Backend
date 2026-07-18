import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JournalService } from './journal.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'src/types/enums';
import { CreateJournalDto } from './dto/create-journal.dto';
import { UpdateJournalDto } from './dto/update-journal.dto';
import { TherapistCommentDto } from './dto/therapist-comment.dto';

@UseGuards(JwtAuthGuard)
@Controller('journal')
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateJournalDto) {
    return this.journalService.create(req.user.id, dto);
  }

  @Get('my')
  getMyEntries(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.journalService.getMyEntries(
      req.user.id,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
    );
  }

  @Roles(Role.THERAPIST)
  @UseGuards(RolesGuard)
  @Get('patient/:patientId')
  getPatientEntries(
    @Param('patientId') patientId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.journalService.getPatientEntries(
      patientId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
    );
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Request() req) {
    return this.journalService.getOne(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UpdateJournalDto,
  ) {
    return this.journalService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Request() req) {
    return this.journalService.delete(id, req.user.id);
  }

  @Roles(Role.THERAPIST)
  @UseGuards(RolesGuard)
  @Patch(':id/comment')
  addComment(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: TherapistCommentDto,
  ) {
    return this.journalService.addTherapistComment(id, req.user.id, dto);
  }
}
