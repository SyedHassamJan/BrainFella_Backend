import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { EmotionLabel } from 'src/types/enums';

export class CreateMoodDto {
  @IsEnum(EmotionLabel)
  mood: EmotionLabel;

  @IsInt()
  @Min(1)
  @Max(10)
  intensity: number;

  @IsOptional()
  @IsString()
  note?: string;
}
