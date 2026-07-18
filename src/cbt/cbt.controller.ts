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
import { CbtService } from './cbt.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'src/types/enums';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { CompleteExerciseDto } from './dto/complete-exercise.dto';

@UseGuards(JwtAuthGuard)
@Controller('cbt')
export class CbtController {
  constructor(private readonly cbtService: CbtService) {}

  @Get()
  getAll(
    @Query('category') category?: string,
    @Query('difficulty') difficulty?: string,
  ) {
    return this.cbtService.getAll(category, difficulty);
  }

  @Get('completions/my')
  getMyCompletions(@Request() req) {
    return this.cbtService.getMyCompletions(req.user.id);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.cbtService.getOne(id);
  }

  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  @Post()
  create(@Body() dto: CreateExerciseDto) {
    return this.cbtService.create(dto);
  }

  @Roles(Role.PATIENT)
  @UseGuards(RolesGuard)
  @Post(':id/complete')
  complete(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: CompleteExerciseDto,
  ) {
    return this.cbtService.complete(id, req.user.id, dto);
  }
}
