import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class AnalyzeVoiceDto {
  // Base64 audio (AAC/m4a, WAV, MP3...). ~10 MB decoded = ~14 MB of base64.
  @IsString()
  @IsNotEmpty()
  @MaxLength(14_000_000)
  audio: string;

  // Optional ISO 639-1 code to force the spoken language. Omit to auto-detect:
  // forcing the wrong language produces a garbled transcript.
  @IsOptional()
  @Matches(/^[a-z]{2,3}$/)
  language?: string;
}
