import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class SubmitQuestionnaireDto {
  // Per-type length and value range are checked in QuestionnaireService,
  // since they depend on the :type route param.
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  answers: number[];
}
