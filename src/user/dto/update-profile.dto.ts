import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsDateString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePatientProfileDto {
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conditions?: string[];
}

export class UpdateTherapistProfileDto {
  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializations?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  qualifications?: string[];

  @IsOptional()
  @IsNumber()
  experienceYears?: number;

  @IsOptional()
  @IsNumber()
  consultationFee?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availableDays?: string[];

  @IsOptional()
  @IsString()
  availableTimeFrom?: string;

  @IsOptional()
  @IsString()
  availableTimeTo?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  // ValidateNested is what makes the global whitelist/validation apply INSIDE this object. Without it,
  // any field (userId, isVerified, rating...) passed straight through into the database write.
  @ValidateNested()
  @Type(() => UpdatePatientProfileDto)
  patientProfile?: UpdatePatientProfileDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateTherapistProfileDto)
  therapistProfile?: UpdateTherapistProfileDto;
}
