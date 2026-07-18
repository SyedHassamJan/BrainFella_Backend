import { IsOptional, IsString } from 'class-validator';

export class CompleteAppointmentDto {
  @IsOptional()
  @IsString()
  therapistNotes?: string;

  @IsOptional()
  @IsString()
  meetingLink?: string;
}
