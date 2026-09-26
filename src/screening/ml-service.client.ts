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

export interface FaceResult {
  emotion: string;
  emotionScores: Record<string, number>;
  eyeContact: boolean;
  blinkRate: number | null;
  headPose: { yaw: number; pitch: number; roll: number };
  models: Record<string, string>;
  note: string;
}

// Expected failures from the ML service, as readable messages for the client.
const ML_ERRORS: Record<string, string> = {
  invalid_audio: 'The audio could not be read. Please record again (AAC/m4a or WAV).',
  audio_too_large: 'The recording is too large (10 MB maximum).',
  audio_too_long: 'The recording is too long (120 seconds maximum).',
  no_speech_detected: 'No speech was detected. Please try again in a quieter place.',
  invalid_image: 'The image could not be read. Please take the photo again.',
  image_too_large: 'The image is too large (5 MB maximum).',
  no_face_detected: 'No face was detected. Please face the camera in good light and try again.',
};

/**
 * Client for the internal ML service (brainhealth-ml-service). The mobile/web
 * clients never talk to it directly; only this API does, with a shared key.
 */
@Injectable()
export class MlServiceClient {
  private readonly logger = new Logger(MlServiceClient.name);

  analyzeVoice(audio: string, language?: string): Promise<VoiceResult> {
    // Whisper on CPU runs ~4-5x real time: a 120 s clip takes ~30 s.
    return this.post<VoiceResult>('/analyze-voice', { audio, ...(language && { language }) }, 90_000, 'Voice');
  }

  analyzeFace(image: string): Promise<FaceResult> {
    return this.post<FaceResult>('/analyze-face', { image }, 60_000, 'Face');
  }

  private async post<T>(path: string, body: object, timeoutMs: number, what: string): Promise<T> {
    const unavailable = () => new ServiceUnavailableException(`${what} analysis is temporarily unavailable`);
    const key = process.env.ML_SERVICE_KEY;
    if (!key) {
      this.logger.error('ML_SERVICE_KEY is not set');
      throw new ServiceUnavailableException(`${what} analysis is not configured`);
    }
    const base = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8002';

    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw unavailable();
    }

    if (!res.ok) {
      this.logger.error(`ML service ${path} responded ${res.status}`);
      throw unavailable();
    }
    const data = (await res.json()) as T & { error?: string };
    if (data.error) {
      const message = ML_ERRORS[data.error];
      if (message) throw new UnprocessableEntityException(message);
      throw unavailable();
    }
    return data;
  }
}
