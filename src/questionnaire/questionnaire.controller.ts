import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { QuestionnaireType, Role } from 'src/types/enums';
import { QuestionnaireService } from './questionnaire.service';
import { SubmitQuestionnaireDto } from './dto/submit-questionnaire.dto';

// Static route segments (`history`) are declared before `:type` so they win.
@UseGuards(JwtAuthGuard)
@Controller('questionnaire')
export class QuestionnaireController {
  constructor(private readonly questionnaireService: QuestionnaireService) {}

  @Roles(Role.PATIENT)
  @UseGuards(RolesGuard)
  @Get('history')
  getMyHistory(
    @Request() req,
    @Query('type', new ParseEnumPipe(QuestionnaireType, { optional: true }))
    type?: QuestionnaireType,
  ) {
    return this.questionnaireService.getMyHistory(req.user.id, type);
  }

  @Roles(Role.THERAPIST)
  @UseGuards(RolesGuard)
  @Get('history/:userId')
  getPatientHistory(
    @Request() req,
    @Param('userId') userId: string,
    @Query('type', new ParseEnumPipe(QuestionnaireType, { optional: true }))
    type?: QuestionnaireType,
  ) {
    return this.questionnaireService.getPatientHistory(
      req.user.id,
      userId,
      type,
    );
  }

  @Get(':type')
  getDefinition(
    @Param('type', new ParseEnumPipe(QuestionnaireType))
    type: QuestionnaireType,
  ) {
    return this.questionnaireService.getDefinition(type);
  }

  @Roles(Role.PATIENT)
  @UseGuards(RolesGuard)
  @Post(':type/submit')
  submit(
    @Request() req,
    @Param('type', new ParseEnumPipe(QuestionnaireType))
    type: QuestionnaireType,
    @Body() dto: SubmitQuestionnaireDto,
  ) {
    return this.questionnaireService.submit(req.user.id, type, dto.answers);
  }
}
