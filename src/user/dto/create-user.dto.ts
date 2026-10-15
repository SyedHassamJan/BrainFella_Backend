import { IsString, IsEmail, IsOptional, IsIn } from 'class-validator';
import { Role } from 'src/types/enums';

/** Roles anyone may sign up as. Admins and guardians are never self-registered. */
export const SELF_SIGNUP_ROLES = [Role.PATIENT, Role.THERAPIST] as const;

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  password?: string;

  /** Defaults to PATIENT. A THERAPIST starts unverified until an admin approves their application. */
  @IsOptional()
  @IsIn(SELF_SIGNUP_ROLES)
  role?: (typeof SELF_SIGNUP_ROLES)[number];
}
