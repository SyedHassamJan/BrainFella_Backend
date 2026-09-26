import { Injectable } from '@nestjs/common';
import { MlServiceClient } from './ml-service.client';
import { SignalService } from './signal.service';
import { TextAnalysisService } from './text-analysis.service';

/**
 * Orchestrates the screening inputs. The raw input (typed text, transcript,
 * audio, image) is returned to the caller and never persisted; only derived
 * signals are stored (SignalService) for the fusion layer.
 */
@Injectable()
export class ScreeningService {
  constructor(
    private readonly textAnalysis: TextAnalysisService,
    private readonly mlService: MlServiceClient,
    private readonly signals: SignalService,
  ) {}

  async analyzeText(userId: string, text: string) {
    const result = await this.textAnalysis.analyze(userId, text);
    await this.signals.saveText(userId, result, 'typed');
    return result;
  }

  /**
   * Voice -> Whisper transcript (ML service) -> the same text analysis as typed
   * text. The detected language is passed along, never forced: non-English
   * speech is transcribed but not emotion-scored.
   */
  async analyzeVoice(userId: string, audio: string, language?: string) {
    const voice = await this.mlService.analyzeVoice(audio, language);
    const textAnalysis = await this.textAnalysis.analyze(userId, voice.transcript, voice.language);
    await Promise.all([
      this.signals.saveVoice(userId, voice),
      this.signals.saveText(userId, textAnalysis, 'voice'),
    ]);
    return { ...voice, textAnalysis };
  }

  async analyzeFace(userId: string, image: string) {
    const face = await this.mlService.analyzeFace(image);
    await this.signals.saveFacial(userId, face);
    return face;
  }
}
