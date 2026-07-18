import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { SendMessageDto } from './dto/send-message.dto';

@UseGuards(JwtAuthGuard)
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('session')
  startSession(@Request() req) {
    return this.chatbotService.startSession(req.user.id);
  }

  @Get('sessions')
  getMySessions(@Request() req) {
    return this.chatbotService.getMySessions(req.user.id);
  }

  @Get('session/:sessionId')
  getSession(@Param('sessionId') sessionId: string, @Request() req) {
    return this.chatbotService.getSession(sessionId, req.user.id);
  }

  @Delete('session/:sessionId')
  deleteSession(@Param('sessionId') sessionId: string, @Request() req) {
    return this.chatbotService.deleteSession(sessionId, req.user.id);
  }

  @Post('message')
  sendMessage(@Request() req, @Body() dto: SendMessageDto) {
    return this.chatbotService.sendMessage(req.user.id, dto);
  }
}
