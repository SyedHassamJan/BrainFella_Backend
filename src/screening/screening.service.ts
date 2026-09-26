import { Injectable } from '@nestjs/common';
import { MlServiceClient } from './ml-service.client';
import { TextAnalysisService } from './text-analysis.service';

/**
 * Orchestrates the screening inputs. Nothing is stored here: typed text,
 * transcripts and audio are returned to the caller and never persisted.
 * (Storing derived signals for the fusion layer is a separate step.)
 */
@Injectable()
export class ScreeningService {
  constructor(
    private readonly textAnalysis: TextAnalysisService,
    private readonly mlService: MlServiceClient,
  ) {}

  analyzeText(userId: string, text: string) {
    return this.textAnalysis.analyze(userId, text);
  }

  /**
   * Voice -> Whisper transcript (ML service) -> the same text analysis as typed
   * text. The detected language is passed along, never forced: non-English
   * speech is transcribed but not emotion-scored.
   */
  async analyzeVoice(userId: string, audio: string, language?: string) {
    const voice = await this.mlService.analyzeVoice(audio, language);
    const textAnalysis = await this.textAnalysis.analyze(userId, voice.transcript, voice.language);
    return { ...voice, textAnalysis };
  }
}
