import { IsString, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  sessionId: string;

  @IsString()
  @MinLength(1)
  content: string;
}
