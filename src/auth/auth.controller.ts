import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { LocalAuthGuard } from './guards/local-auth/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth/jwt-auth.guard';
import { RefreshAuthGuard } from './guards/refresh-auth/refresh-auth.guard';
import { GoogleAuthGuard } from './guards/goggle-auth/goggle-auth.guard';
import type { Response } from 'express';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles/roles.guard';
import { Role } from 'src/types/enums';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  registerUser(@Body() createUserDto: CreateUserDto) {
    return this.authService.registerUser(createUserDto);
  }

  /** Patients, therapists and guardians. Admins must use the separate admin sign-in. */
  @UseGuards(LocalAuthGuard)
  @Post('signin')
  login(@Request() req) {
    if (req.user.role === Role.ADMIN) {
      throw new ForbiddenException('Administrators sign in on the admin login page.');
    }
    return this.authService.login(req.user.id, req.user.name, req.user.role);
  }

  /** The admin login page's endpoint: only ADMIN accounts get tokens here. */
  @UseGuards(LocalAuthGuard)
  @Post('admin/signin')
  adminLogin(@Request() req) {
    if (req.user.role !== Role.ADMIN) {
      throw new ForbiddenException('This sign-in is for administrators only.');
    }
    return this.authService.login(req.user.id, req.user.name, req.user.role);
  }

  @Roles(Role.ADMIN, Role.THERAPIST)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('protected')
  getAll(@Request() req) {
    return {
      message: `Now you can access this protected API. User ID: ${req.user.id}, Role: ${req.user.role}`,
    };
  }

  @UseGuards(RefreshAuthGuard)
  @Post('refresh')
  refreshToken(@Request() req) {
    return this.authService.refreshToken(
      req.user.id,
      req.user.name,
      req.user.role,
    );
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google/login')
  googleLogin() {}

  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(@Request() req, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    // Admins only sign in with a password on the admin login page.
    if (req.user.role === Role.ADMIN) {
      return res.redirect(`${frontendUrl}/admin/login?error=google`);
    }
    const response = await this.authService.login(
      req.user.id,
      req.user.name,
      req.user.role,
    );
    res.redirect(
      `${frontendUrl}/callback?userId=${response.id}&name=${response.name}&accessToken=${response.accessToken}&refreshToken=${response.refreshToken}&role=${response.role}`,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('signout')
  signOut(@Req() req) {
    return this.authService.signOut(req.user.id);
  }
}