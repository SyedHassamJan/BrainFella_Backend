import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AnalyzeFaceDto {
  // Base64 image (JPEG/PNG/WebP). 5 MB decoded = ~7 MB of base64.
  @IsString()
  @IsNotEmpty()
  @MaxLength(7_500_000)
  image: string;
}
