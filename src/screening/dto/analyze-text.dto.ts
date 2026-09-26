import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnalyzeTextDto {
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  text: string;
}
