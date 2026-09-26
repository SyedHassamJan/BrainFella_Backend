import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateJournalDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}
