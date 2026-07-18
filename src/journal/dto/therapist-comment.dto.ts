import { IsString, MinLength } from 'class-validator';

export class TherapistCommentDto {
  @IsString()
  @MinLength(5)
  therapistComment: string;
}
