import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMoodDto } from './dto/create-mood.dto';

@Injectable()
export class MoodService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateMoodDto) {
    return this.prisma.moodLog.create({
      data: { userId, ...dto },
    });
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

  async getPatientLogs(patientId: string) {
    return this.prisma.moodLog.findMany({
      where: { userId: patientId },
      orderBy: { loggedAt: 'desc' },
    });
  }
}
