import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateJournalDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  content?: string;
}
