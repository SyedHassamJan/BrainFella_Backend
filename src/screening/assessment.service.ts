import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { assertTherapistPatientLink } from 'src/common/patient-access';
import { FUSION } from './fusion/fusion.config';
import { FusionService } from './fusion/fusion.service';
import { SignalService } from './signal.service';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Builds a risk-indicator assessment from a user's recent stored inputs
 * (questionnaires + derived screening signals) and keeps the history for the
 * follow-up comparison view. The result is a screening result, not a diagnosis.
 */
@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fusion: FusionService,
    private readonly signals: SignalService,
  ) {}

  async assess(userId: string) {
    const now = new Date();
    const longest = Math.max(...Object.values(FUSION.windowMs));
    const [questionnaires, signals] = await Promise.all([
      this.prisma.questionnaireResponse.findMany({
        where: { userId, createdAt: { gte: new Date(now.getTime() - longest) } },
        orderBy: { createdAt: 'desc' },
      }),
      this.signals.getRecent(userId, new Date(now.getTime() - FUSION.windowMs.signals)),
    ]);

    const result = this.fusion.computeRiskIndicator(
      {
        questionnaires: questionnaires.map((q) => ({
          type: q.type,
          score: q.score,
          answers: q.answers,
          subscores: q.subscores,
          createdAt: q.createdAt,
        })),
        signals,
      },
      now,
    );

    const anyRisk = [result.depressionRisk, result.anxietyRisk, result.stressRisk, result.ocdRisk].some((r) => r !== null);
    if (!anyRisk && !result.crisisFlag) {
      throw new UnprocessableEntityException(
        'No recent screening data to assess. Complete a questionnaire, or record text, voice or a face capture first.',
      );
    }

    const row = await this.prisma.riskAssessment.create({
      data: {
        userId,
        depressionRisk: result.depressionRisk,
        anxietyRisk: result.anxietyRisk,
        stressRisk: result.stressRisk,
        ocdRisk: result.ocdRisk,
        crisisFlag: result.crisisFlag,
        confidence: result.confidence,
        inputsUsed: result.inputsUsed,
        breakdown: result.breakdown as object,
        computedAt: now,
      },
    });

    return { id: row.id, ...result };
  }

  /** Oldest first, so a client can chart progress over time directly. */
  getMyHistory(userId: string) {
    return this.prisma.riskAssessment.findMany({
      where: { userId },
      orderBy: { computedAt: 'asc' },
    });
  }

  async getPatientHistory(therapistId: string, patientId: string) {
    await assertTherapistPatientLink(this.prisma, therapistId, patientId);
    return this.getMyHistory(patientId);
  }
}
