import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { TherapistService } from './therapist.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'src/types/enums';
import { CreateReviewDto } from './dto/create-review.dto';

@Controller('therapist')
export class TherapistController {
  constructor(private readonly therapistService: TherapistService) {}

  // Public — no auth required
  @Get()
  getAllVerified(@Query('specialization') specialization?: string) {
    return this.therapistService.getAllVerified(specialization);
  }

  // Public — no auth required
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.therapistService.getOne(id);
  }

  @Roles(Role.PATIENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('review/:therapistProfileId')
  submitReview(
    @Param('therapistProfileId') therapistProfileId: string,
    @Request() req,
    @Body() dto: CreateReviewDto,
  ) {
    return this.therapistService.submitReview(
      therapistProfileId,
      req.user.id,
      dto,
    );
  }

  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch('verify/:userId')
  verifyTherapist(@Param('userId') userId: string) {
    return this.therapistService.verifyTherapist(userId);
  }
}
