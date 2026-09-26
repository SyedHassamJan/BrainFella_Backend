import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { FUSION } from './fusion/fusion.config';
import { SignalInput } from './fusion/fusion.service';
import { TextAnalysisResult } from './text-analysis.service';
import { VoiceResult, FaceResult } from './ml-service.client';

/**
 * Stores the DERIVED signals from screening inputs so the fusion layer can use
 * whichever modes the user has provided. Only numbers and labels are stored -
 * never the image, audio, transcript or typed text - and they are deleted
 * after FUSION.signalRetentionDays.
 *
 * Failing to store a signal must never fail the analysis the user asked for,
 * so every save logs (without content) and carries on.
 */
@Injectable()
export class SignalService {
  private readonly logger = new Logger(SignalService.name);

  constructor(private readonly prisma: PrismaService) {}

  saveFacial(userId: string, r: FaceResult) {
    return this.save(userId, 'FACIAL', {
      emotion: r.emotion,
      emotionScores: r.emotionScores,
      eyeContact: r.eyeContact,
      headPose: r.headPose,
    });
  }

  saveVoice(userId: string, r: VoiceResult) {
    // Timing only: the transcript is deliberately not stored.
    return this.save(userId, 'VOICE', {
      duration: r.duration,
      language: r.language,
      languageProbability: r.languageProbability,
      speakingRate: r.speakingRate,
      pauseCount: r.pauseCount,
    });
  }

  saveText(userId: string, r: TextAnalysisResult, source: 'typed' | 'voice') {
    // Nothing worth keeping if no model scored it and it wasn't a crisis.
    if (!r.available && !r.crisisFlag) return Promise.resolve();
    return this.save(userId, 'TEXT', {
      source,
      sentiment: r.sentiment,
      emotionalTone: r.emotionalTone ? { emotion: r.emotionalTone.emotion, score: r.emotionalTone.score } : null,
      depressionLanguageScore: r.depressionLanguageScore,
      anxietyLanguageScore: r.anxietyLanguageScore,
      stressLanguageScore: r.stressLanguageScore,
      crisisFlag: r.crisisFlag,
    });
  }

  private async save(userId: string, modality: 'FACIAL' | 'VOICE' | 'TEXT', payload: object) {
    try {
      await this.prisma.screeningSignal.create({ data: { userId, modality, payload } });
    } catch (e) {
      this.logger.warn(`could not store ${modality} signal: ${(e as Error).message}`);
    }
  }

  async getRecent(userId: string, since: Date): Promise<SignalInput[]> {
    const rows = await this.prisma.screeningSignal.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({ modality: r.modality, payload: r.payload, createdAt: r.createdAt }));
  }

  /** Data minimization: derived signals are kept for 30 days only. */
  @Cron('0 3 * * *', { name: 'screening-signal-purge' })
  async purgeExpired(now: Date = new Date()) {
    const cutoff = new Date(now.getTime() - FUSION.signalRetentionDays * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.screeningSignal.deleteMany({ where: { createdAt: { lt: cutoff } } });
    if (count) this.logger.log(`purged ${count} expired screening signal(s)`);
    return count;
  }
}
