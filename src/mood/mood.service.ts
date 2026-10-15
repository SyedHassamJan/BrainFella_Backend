import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationService } from 'src/notification/notification.service';
import { containsCrisisKeywords } from 'src/common/crisis';
import { detectTextEmotion } from 'src/common/huggingface';
import { assertTherapistPatientLink } from 'src/common/patient-access';
import { CreateMoodDto } from './dto/create-mood.dto';

export const MOOD_CRISIS_SUPPORT =
  'We noticed you may be going through a very difficult time. You are not alone — please reach out to the Umang helpline now: 0317-4288665, or book a session with a therapist on BrainHealth.';

@Injectable()
export class MoodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Saves a check-in. The optional note goes through the same crisis check as
   * journal and chat (the chosen mood is not a reason to skip it: someone can
   * tap "Calm" and still write something alarming), and the emotion model reads
   * its tone. The tone is stored and shown next to the chosen mood; it never
   * replaces what the person picked. If the model is down the tone is null.
   */
  async create(userId: string, dto: CreateMoodDto) {
    const note = dto.note?.trim();
    const isCrisis = !!note && containsCrisisKeywords(note);
    const tone = note ? await detectTextEmotion(note) : null;
    const log = await this.prisma.moodLog.create({
      data: {
        userId,
        ...dto,
        isCrisis,
        detectedEmotion: tone?.emotion ?? null,
        emotionScore: tone?.score ?? null,
      },
    });

    if (!isCrisis) return log;

    await this.notificationService.createNotification(
      userId,
      'Crisis Detected',
      'We noticed you may be going through a very difficult time. Please reach out to our helpline: Umang 0317-4288665 or book a session with a therapist.',
      'CRISIS_DETECTED',
    );
    await this.notificationService.notifyLinkedTherapistsOfCrisis(userId, 'mood');
    return { ...log, crisisSupport: MOOD_CRISIS_SUPPORT };
  }

  async getMyLogs(userId: string, from?: string, to?: string) {
    return this.prisma.moodLog.findMany({
      where: {
        userId,
        ...(from || to
          ? {
              loggedAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { loggedAt: 'desc' },
    });
  }

  // FIX 7 — Full aggregation with dailyAverages for chart rendering
  async getInsights(userId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const logs = await this.prisma.moodLog.findMany({
      where: { userId, loggedAt: { gte: sevenDaysAgo } },
      orderBy: { loggedAt: 'asc' },
    });

    if (!logs.length) {
      return {
        message: 'No mood data for the past 7 days',
        totalLogs: 0,
        dominantEmotion: null,
        averageIntensity: null,
        emotionBreakdown: {},
        dailyAverages: [],
      };
    }

    // Emotion breakdown counts
    const emotionCounts: Record<string, number> = {};
    logs.forEach((l) => {
      emotionCounts[l.mood] = (emotionCounts[l.mood] ?? 0) + 1;
    });

    // Dominant emotion
    const dominantEmotion = Object.entries(emotionCounts).sort(
      ([, a], [, b]) => b - a,
    )[0][0];

    // Average intensity
    const averageIntensity =
      logs.reduce((sum, l) => sum + l.intensity, 0) / logs.length;

    // Daily averages (for line/bar chart)
    const dailyMap: Record<string, { total: number; count: number }> = {};
    logs.forEach((log) => {
      const day = log.loggedAt.toISOString().split('T')[0]; // YYYY-MM-DD
      if (!dailyMap[day]) dailyMap[day] = { total: 0, count: 0 };
      dailyMap[day].total += log.intensity;
      dailyMap[day].count += 1;
    });

    const dailyAverages = Object.entries(dailyMap).map(([date, data]) => ({
      date,
      averageIntensity: parseFloat((data.total / data.count).toFixed(1)),
      logCount: data.count,
    }));

    return {
      totalLogs: logs.length,
      dominantEmotion,
      averageIntensity: parseFloat(averageIntensity.toFixed(1)),
      emotionBreakdown: emotionCounts,
      dailyAverages,
    };
  }

  /** A linked therapist only (confirmed/completed appointment, or the patient shares with them). */
  async getPatientLogs(therapistId: string, patientId: string) {
    await assertTherapistPatientLink(this.prisma, therapistId, patientId);
    return this.prisma.moodLog.findMany({
      where: { userId: patientId },
      orderBy: { loggedAt: 'desc' },
    });
  }
}
