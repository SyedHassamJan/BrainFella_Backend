import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationService } from 'src/notification/notification.service';
import { CreateJournalDto } from './dto/create-journal.dto';
import { UpdateJournalDto } from './dto/update-journal.dto';
import { TherapistCommentDto } from './dto/therapist-comment.dto';
import { EmotionLabel } from 'src/types/enums';
import { containsCrisisKeywords } from 'src/common/crisis';
import {
  DEFAULT_EMOTION_MODEL,
  hfModelUrl,
  parseClassification,
} from 'src/common/huggingface';

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  // FIX 4 — Hardened HuggingFace emotion detection with 503 + response.ok checks
  async detectEmotion(
    text: string,
  ): Promise<{ emotion: EmotionLabel; score: number }> {
    try {
      const response = await fetch(
        hfModelUrl(process.env.HF_EMOTION_MODEL || DEFAULT_EMOTION_MODEL),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: text }),
        },
      );

      // Handle HuggingFace cold start (503 = model loading)
      if (response.status === 503) {
        console.warn('HuggingFace model is loading, using fallback emotion');
        return { emotion: EmotionLabel.neutral, score: 0.5 };
      }

      if (!response.ok) {
        console.error(`HuggingFace API error: ${response.status}`);
        return { emotion: EmotionLabel.neutral, score: 0.5 };
      }

      // Accepts both [[{label, score}, ...]] and [{label, score}, ...]
      const top = parseClassification(await response.json())[0];
      if (!top) {
        return { emotion: EmotionLabel.neutral, score: 0.5 };
      }

      const emotionLabel = top.label.toLowerCase() as EmotionLabel;

      // Validate label is a known enum value
      const validEmotions = Object.values(EmotionLabel) as string[];
      const safeEmotion = validEmotions.includes(emotionLabel)
        ? emotionLabel
        : EmotionLabel.neutral;

      return { emotion: safeEmotion, score: top.score };
    } catch {
      // HuggingFace completely unreachable — don't crash
      return { emotion: EmotionLabel.neutral, score: 0 };
    }
  }

  checkCrisis(text: string): boolean {
    return containsCrisisKeywords(text);
  }

  async create(userId: string, dto: CreateJournalDto) {
    const { emotion, score } = await this.detectEmotion(dto.content);
    const isCrisis = this.checkCrisis(dto.content);

    const entry = await this.prisma.journalEntry.create({
      data: {
        userId,
        title: dto.title,
        content: dto.content,
        detectedEmotion: emotion,
        emotionScore: score,
        isCrisis,
      },
    });

    if (isCrisis) {
      await this.notificationService.createNotification(
        userId,
        'Crisis Detected',
        'We noticed you may be going through a very difficult time. Please reach out to our helpline: Umang 0317-4288665 or book a session with a therapist.',
        'CRISIS_DETECTED',
      );
      await this.notificationService.notifyLinkedTherapistsOfCrisis(userId, 'journal');
    }

    return entry;
  }

  async getMyEntries(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [entries, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.journalEntry.count({ where: { userId } }),
    ]);
    return { entries, total, page, totalPages: Math.ceil(total / limit) };
  }

  // FIX 1 — Use findFirst with combined id+userId to prevent cross-user reads
  async getOne(id: string, userId: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, userId },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }

  // FIX 1 — Use findFirst with combined id+userId to prevent cross-user deletes
  async delete(id: string, userId: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, userId },
    });
    if (!entry) throw new ForbiddenException('Access denied or entry not found');
    return this.prisma.journalEntry.delete({ where: { id } });
  }

  async update(id: string, userId: string, dto: UpdateJournalDto) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, userId },
    });
    if (!entry) throw new ForbiddenException('Access denied or entry not found');
    return this.prisma.journalEntry.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.content !== undefined && { content: dto.content }),
      },
    });
  }

  async getPatientEntries(patientId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [entries, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where: { userId: patientId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.journalEntry.count({ where: { userId: patientId } }),
    ]);
    return { entries, total, page, totalPages: Math.ceil(total / limit) };
  }

  async addTherapistComment(
    id: string,
    therapistId: string,
    dto: TherapistCommentDto,
  ) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return this.prisma.journalEntry.update({
      where: { id },
      data: {
        therapistComment: dto.therapistComment,
        isReviewed: true,
      },
    });
  }
}
