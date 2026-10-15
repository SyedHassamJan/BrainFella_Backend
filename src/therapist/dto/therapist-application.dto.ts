import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class UploadedFileDto {
  @IsString()
  @MaxLength(200)
  fileName: string;

  /** File contents as base64 (a `data:` URL is accepted too). The real type is checked server-side. */
  @IsString()
  @IsNotEmpty()
  data: string;
}

/** What a therapist sends for review. Files are optional on a resubmission if already uploaded. */
export class SubmitTherapistApplicationDto {
  @IsString()
  @MinLength(30, { message: 'Please write at least a few sentences about yourself (30+ characters).' })
  @MaxLength(2000)
  bio: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  specializations: string[];

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  qualifications: string[];

  @IsInt()
  @Min(0)
  @Max(70)
  experienceYears: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  consultationFee?: number;

  /** Normalised server-side to international digits, e.g. 923001234567. */
  @IsString()
  @MaxLength(25)
  whatsappNumber: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UploadedFileDto)
  cv?: UploadedFileDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UploadedFileDto)
  photo?: UploadedFileDto;
}

export class RejectTherapistApplicationDto {
  @IsString()
  @MinLength(5, { message: 'Please give the therapist a short reason.' })
  @MaxLength(1000)
  reason: string;
}
