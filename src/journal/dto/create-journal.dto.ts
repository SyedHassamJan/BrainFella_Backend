import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateJournalDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @MinLength(10)
  content: string;
}
