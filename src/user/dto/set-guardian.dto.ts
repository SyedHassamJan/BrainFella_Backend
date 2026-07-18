import { IsEmail, IsOptional, IsString } from 'class-validator';

export class SetGuardianDto {
  @IsEmail()
  guardianEmail: string;

  @IsOptional()
  @IsString()
  guardianName?: string;

  @IsOptional()
  @IsString()
  guardianPhone?: string;

  @IsOptional()
  @IsString()
  relationship?: string;
}
