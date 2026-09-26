import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateJournalDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  content?: string;
}
