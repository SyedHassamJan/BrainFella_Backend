import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'src/types/enums';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetGuardianDto } from './dto/set-guardian.dto';

@UseGuards(JwtAuthGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  getProfile(@Request() req) {
    return this.userService.getProfile(req.user.id);
  }

  @Patch('profile')
  updateProfile(@Request() req, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(req.user.id, dto);
  }

  @Roles(Role.PATIENT)
  @UseGuards(RolesGuard)
  @Post('guardian')
  setGuardian(@Request() req, @Body() dto: SetGuardianDto) {
    return this.userService.setGuardian(req.user.id, dto);
  }

  @Roles(Role.THERAPIST)
  @UseGuards(RolesGuard)
  @Get('patients')
  getPatients(@Request() req) {
    return this.userService.getTherapistPatients(req.user.id);
  }

  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  @Get('all')
  getAllUsers() {
    return this.userService.getAllUsers();
  }
}