import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationService } from 'src/notification/notification.service';
import { escapeHtml } from 'src/common/mail.service';
import * as nodemailer from 'nodemailer';
import { EmotionLabel } from 'src/types/enums';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  // ── Cron: Every Sunday at midnight ──────────────────────────────────────
  @Cron('0 0 * * 0', { name: 'weekly-report-generation' })
  async generateWeeklyReports() {
    this.logger.log('⏰ Starting weekly report generation...');

    const weekEndDate = new Date();
    const weekStartDate = new Date();
    weekStartDate.setDate(weekStartDate.getDate() - 7);

    // Get all patients who have a guardian link
    const patientsWithGuardian = await this.prisma.user.findMany({
      where: { role: 'PATIENT', isActive: true, guardianLink: { isNot: null } },
      include: { guardianLink: true },
    });

    for (const patient of patientsWithGuardian) {
      try {
        await this.generateAndSendReport(
          patient.id,
          patient.guardianLink!,
          weekStartDate,
          weekEndDate,
        );
      } catch (err) {
        this.logger.error(
          `Failed to generate report for patient ${patient.id}: ${err}`,
        );
      }
    }

    this.logger.log(
      `✅ Weekly reports generated for ${patientsWithGuardian.length} patients`,
    );
  }

  private async generateAndSendReport(
    patientId: string,
    guardianLink: { guardianEmail: string; guardianName?: string | null },
    weekStartDate: Date,
    weekEndDate: Date,
  ) {
    const [moodLogs, journalEntries, chatSessions, completions, appointments] =
      await Promise.all([
        this.prisma.moodLog.findMany({
          where: {
            userId: patientId,
            loggedAt: { gte: weekStartDate, lte: weekEndDate },
          },
        }),
        this.prisma.journalEntry.findMany({
          where: {
            userId: patientId,
            createdAt: { gte: weekStartDate, lte: weekEndDate },
          },
        }),
        this.prisma.chatSession.findMany({
          where: {
            userId: patientId,
            createdAt: { gte: weekStartDate, lte: weekEndDate },
          },
        }),
        this.prisma.exerciseCompletion.findMany({
          where: {
            userId: patientId,
            completedAt: { gte: weekStartDate, lte: weekEndDate },
          },
        }),
        this.prisma.appointment.findMany({
          where: {
            patientId,
            status: 'COMPLETED',
            scheduledAt: { gte: weekStartDate, lte: weekEndDate },
          },
        }),
      ]);

    const crisisEvents = [
      ...journalEntries.filter((j) => j.isCrisis),
      ...(
        await this.prisma.chatMessage.findMany({
          where: {
            isCrisis: true,
            createdAt: { gte: weekStartDate, lte: weekEndDate },
            session: { userId: patientId },
          },
        })
      ),
    ];

    // Calculate dominant emotion from mood logs
    let dominantEmotion: EmotionLabel | null = null;
    if (moodLogs.length) {
      const counts: Record<string, number> = {};
      moodLogs.forEach((l) => {
        counts[l.mood] = (counts[l.mood] ?? 0) + 1;
      });
      dominantEmotion = Object.entries(counts).sort(
        (a, b) => b[1] - a[1],
      )[0][0] as EmotionLabel;
    }

    const avgMood = moodLogs.length
      ? moodLogs.reduce((s, l) => s + l.intensity, 0) / moodLogs.length
      : null;

    // Save report to DB
    const report = await this.prisma.weeklyReport.create({
      data: {
        patientId,
        guardianEmail: guardianLink.guardianEmail,
        weekStartDate,
        weekEndDate,
        dominantEmotion,
        averageMoodScore: avgMood,
        totalMoodLogs: moodLogs.length,
        totalJournalEntries: journalEntries.length,
        crisisEventsCount: crisisEvents.length,
        totalChatSessions: chatSessions.length,
        exercisesCompleted: completions.length,
        appointmentsHeld: appointments.length,
        status: 'GENERATED',
      },
    });

    // FIX 6 — Email failure must NOT crash the per-patient report loop.
    // The DB record is always saved; email is a best-effort step.
    try {
      await this.sendReportEmail(report, guardianLink, patientId);
      await this.prisma.weeklyReport.update({
        where: { id: report.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      await this.notificationService.createNotification(
        patientId,
        'Weekly Report Sent',
        `Your weekly wellness report has been sent to ${guardianLink.guardianEmail}.`,
        'REPORT_SENT',
      );
    } catch (emailErr) {
      this.logger.error(
        `Email send failed for patient ${patientId}: ${emailErr}`,
      );
      // Report stays as GENERATED status — no re-throw so the loop continues
    }
  }

  private async sendReportEmail(
    report: any,
    guardianLink: { guardianEmail: string; guardianName?: string | null },
    patientId: string,
  ) {
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.MAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    const patient = await this.prisma.user.findUnique({
      where: { id: patientId },
      select: { name: true },
    });

    const guardianName = guardianLink.guardianName || 'Guardian';
    const patientName = patient?.name || 'Patient';
    const weekRange = `${report.weekStartDate.toLocaleDateString()} – ${report.weekEndDate.toLocaleDateString()}`;
    // Names are typed by users and end up inside an HTML email, so they are escaped
    // (otherwise a patient could put markup or a link in their own name). A subject
    // is a header, so it just must not contain line breaks.
    const safeGuardian = escapeHtml(guardianName);
    const safePatient = escapeHtml(patientName);
    const safeWeek = escapeHtml(weekRange);
    const safeEmotion = escapeHtml(String(report.dominantEmotion ?? 'N/A'));
    const subjectName = patientName.replace(/[\r\n]+/g, ' ');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; background: #f9f9f9; border-radius: 12px;">
        <h2 style="color: #4f46e5;">🧠 BrainHealth Weekly Wellness Report</h2>
        <p>Dear <strong>${safeGuardian}</strong>,</p>
        <p>Here is the weekly mental wellness summary for <strong>${safePatient}</strong> (${safeWeek}).</p>
        <table style="width:100%; border-collapse: collapse; margin-top: 16px;">
          <tr style="background:#e0e7ff;"><td style="padding:8px;"><strong>Mood Logs</strong></td><td style="padding:8px;">${report.totalMoodLogs}</td></tr>
          <tr><td style="padding:8px;"><strong>Dominant Emotion</strong></td><td style="padding:8px;">${safeEmotion}</td></tr>
          <tr style="background:#e0e7ff;"><td style="padding:8px;"><strong>Avg Mood Intensity</strong></td><td style="padding:8px;">${report.averageMoodScore ? report.averageMoodScore.toFixed(1) + '/10' : 'N/A'}</td></tr>
          <tr><td style="padding:8px;"><strong>Journal Entries</strong></td><td style="padding:8px;">${report.totalJournalEntries}</td></tr>
          <tr style="background:#e0e7ff;"><td style="padding:8px;"><strong>Chat Sessions</strong></td><td style="padding:8px;">${report.totalChatSessions}</td></tr>
          <tr><td style="padding:8px;"><strong>CBT Exercises Done</strong></td><td style="padding:8px;">${report.exercisesCompleted}</td></tr>
          <tr style="background:#e0e7ff;"><td style="padding:8px;"><strong>Therapist Sessions</strong></td><td style="padding:8px;">${report.appointmentsHeld}</td></tr>
          <tr ${report.crisisEventsCount > 0 ? 'style="background:#fee2e2;"' : ''}><td style="padding:8px;"><strong>⚠️ Crisis Events</strong></td><td style="padding:8px;">${report.crisisEventsCount}</td></tr>
        </table>
        ${report.crisisEventsCount > 0 ? `<p style="color:#dc2626; margin-top:16px;"><strong>⚠️ Crisis Alert:</strong> ${safePatient} showed signs of distress this week. Please check in with them directly. If you need urgent help, call Umang: <strong>0317-4288665</strong>.</p>` : ''}
        <p style="margin-top:24px; color:#6b7280; font-size:13px;">This report was automatically generated by BrainHealth. Please do not reply to this email.</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"BrainHealth" <${process.env.MAIL_USER}>`,
      to: guardianLink.guardianEmail,
      subject: `BrainHealth Weekly Report — ${subjectName} (${weekRange})`,
      html,
    });
  }

  // ── Query methods ────────────────────────────────────────────────────────

  async getMyReports(patientId: string) {
    return this.prisma.weeklyReport.findMany({
      where: { patientId },
      orderBy: { weekStartDate: 'desc' },
    });
  }

  async getPatientReports(patientId: string) {
    return this.prisma.weeklyReport.findMany({
      where: { patientId },
      orderBy: { weekStartDate: 'desc' },
    });
  }

  async getAllReports() {
    return this.prisma.weeklyReport.findMany({
      include: {
        patient: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
