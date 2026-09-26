import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

export interface VoiceResult {
  transcript: string;
  duration: number;
  language: string;
  languageProbability: number;
  speakingRate: number;
  pauseCount: number;
  models: Record<string, string>;
  note: string;
}

const VOICE_ERRORS: Record<string, string> = {
  invalid_audio: 'The audio could not be read. Please record again (AAC/m4a or WAV).',
  audio_too_large: 'The recording is too large (10 MB maximum).',
  audio_too_long: 'The recording is too long (120 seconds maximum).',
  no_speech_detected: 'No speech was detected. Please try again in a quieter place.',
};

/**
 * Client for the internal ML service (brainhealth-ml-service). The mobile/web
 * clients never talk to it directly; only this API does, with a shared key.
 */
@Injectable()
export class MlServiceClient {
  private readonly logger = new Logger(MlServiceClient.name);

  async analyzeVoice(audio: string, language?: string): Promise<VoiceResult> {
    const key = process.env.ML_SERVICE_KEY;
    if (!key) {
      this.logger.error('ML_SERVICE_KEY is not set');
      throw new ServiceUnavailableException('Voice analysis is not configured');
    }
    const base = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8002';

    let res: Response;
    try {
      res = await fetch(`${base}/analyze-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Key': key },
        body: JSON.stringify({ audio, ...(language && { language }) }),
        // Whisper on CPU runs ~4-5x real time: a 120 s clip takes ~30 s.
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      throw new ServiceUnavailableException('Voice analysis is temporarily unavailable');
    }

    if (!res.ok) {
      this.logger.error(`ML service responded ${res.status}`);
      throw new ServiceUnavailableException('Voice analysis is temporarily unavailable');
    }
    const body = (await res.json()) as VoiceResult & { error?: string };
    if (body.error) {
      const message = VOICE_ERRORS[body.error];
      if (message) throw new UnprocessableEntityException(message);
      throw new ServiceUnavailableException('Voice analysis is temporarily unavailable');
    }
    return body;
  }
}
