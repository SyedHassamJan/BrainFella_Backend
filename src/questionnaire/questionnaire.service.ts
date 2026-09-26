import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationService } from 'src/notification/notification.service';
import { assertTherapistPatientLink } from 'src/common/patient-access';
import { QuestionnaireType } from 'src/types/enums';
import { INSTRUMENTS } from './instruments';
import { scoreQuestionnaire, validateAnswers } from './scoring';

const DISCLAIMER =
  'This is a screening result, not a medical diagnosis. Please speak with a qualified professional about your results.';
const CRISIS_MESSAGE =
  'Your answers suggest you may be having thoughts of self-harm. You are not alone — please reach out to the Umang helpline now: 0317-4288665, or book a session with a therapist on BrainHealth.';

@Injectable()
export class QuestionnaireService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  getDefinition(type: QuestionnaireType) {
    return INSTRUMENTS[type];
  }

  async submit(userId: string, type: QuestionnaireType, answers: number[]) {
    const error = validateAnswers(type, answers);
    if (error) throw new BadRequestException(error);

    const { score, severityLabel, subscores, crisisFlag } = scoreQuestionnaire(
      type,
      answers,
    );

    const record = await this.prisma.questionnaireResponse.create({
      data: {
        userId,
        type,
        answers,
        score,
        severityLabel,
        ...(subscores && { subscores: subscores as object }),
      },
    });

    if (crisisFlag) {
      // Same safety net as journal/chatbot crisis detection.
      await this.notificationService.createNotification(
        userId,
        'Support is available',
        'We noticed you may be going through a very difficult time. Please reach out to our helpline: Umang 0317-4288665 or book a session with a therapist.',
        'CRISIS_DETECTED',
      );
      await this.notificationService.notifyLinkedTherapistsOfCrisis(userId, 'questionnaire');
    }

    return {
      ...record,
      crisisFlag,
      ...(crisisFlag && { crisisSupport: CRISIS_MESSAGE }),
      disclaimer: DISCLAIMER,
    };
  }

  getMyHistory(userId: string, type?: QuestionnaireType) {
    return this.prisma.questionnaireResponse.findMany({
      where: { userId, ...(type && { type }) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPatientHistory(
    therapistId: string,
    patientId: string,
    type?: QuestionnaireType,
  ) {
    await assertTherapistPatientLink(this.prisma, therapistId, patientId);
    return this.getMyHistory(patientId, type);
  }
}
