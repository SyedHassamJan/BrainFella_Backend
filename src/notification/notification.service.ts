import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService, escapeHtml } from 'src/common/mail.service';

/** Where a crisis signal came from (used only to word the alert; no content is shared). */
export type CrisisSource = 'journal' | 'chat' | 'screening' | 'questionnaire';

const SOURCE_LABEL: Record<CrisisSource, string> = {
  journal: 'a journal entry',
  chat: 'a chat message',
  screening: 'a screening input',
  questionnaire: 'a questionnaire answer',
};

/**
 * A linked therapist is alerted at most once per patient in this window, so a
 * distressed patient writing several times does not flood them; the first alert
 * already tells them to check in.
 */
export const THERAPIST_ALERT_WINDOW_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async createNotification(
    userId: string,
    title: string,
    message: string,
    type: string,
    relatedUserId?: string,
  ) {
    return this.prisma.notification.create({
      data: { userId, title, message, type, ...(relatedUserId && { relatedUserId }) },
    });
  }

  /**
   * When a patient's journal, chat, screening text or PHQ-9 answer raises a
   * crisis flag, also tell the therapists who are actually working with them
   * (a CONFIRMED or COMPLETED appointment: the same link used everywhere else).
   *
   * Privacy: the alert names the patient and the kind of input, never what
   * they wrote; the therapist reads the record through the normal, access-
   * checked endpoints. It must never break the patient's own request, so any
   * failure is logged and swallowed. Returns how many therapists were alerted.
   */
  async notifyLinkedTherapistsOfCrisis(patientId: string, source: CrisisSource, now: Date = new Date()): Promise<number> {
    try {
      const links = await this.prisma.appointment.findMany({
        where: { patientId, status: { in: ['CONFIRMED', 'COMPLETED'] } },
        select: { therapistId: true },
        distinct: ['therapistId'],
      });
      if (links.length === 0) return 0;

      const patient = await this.prisma.user.findUnique({ where: { id: patientId }, select: { name: true } });
      const name = patient?.name?.trim() || 'One of your patients';
      const since = new Date(now.getTime() - THERAPIST_ALERT_WINDOW_MS);
      const therapists = await this.prisma.user.findMany({
        where: { id: { in: links.map((l) => l.therapistId) } },
        select: { id: true, name: true, email: true },
      });
      const byId = new Map(therapists.map((t) => [t.id, t]));

      let alerted = 0;
      for (const { therapistId } of links) {
        const recent = await this.prisma.notification.findFirst({
          where: { userId: therapistId, type: 'CRISIS_ALERT', relatedUserId: patientId, createdAt: { gte: since } },
          select: { id: true },
        });
        if (recent) continue;
        await this.createNotification(
          therapistId,
          'A patient may need support',
          `${name} may be going through a very difficult time (flagged from ${SOURCE_LABEL[source]}). Please consider checking in with them.`,
          'CRISIS_ALERT',
          patientId,
        );
        alerted += 1;
        // Email too, because a therapist may not open the app for hours. Fire-and-forget:
        // the patient's own request never waits on (or fails because of) an email.
        const therapist = byId.get(therapistId);
        if (therapist?.email && process.env.CRISIS_EMAIL_ALERTS !== 'false') {
          void this.emailTherapist(therapist, name, source, now);
        }
      }
      return alerted;
    } catch (e) {
      this.logger.error(`could not alert therapists for patient ${patientId}: ${(e as Error).message}`);
      return 0;
    }
  }

  /**
   * The email version of a crisis alert. Minimal on purpose: the patient's name
   * and the KIND of input, never what they wrote; no name in the subject (it
   * can show on a lock screen). Never throws. Names are HTML-escaped.
   */
  async emailTherapist(
    therapist: { name: string; email: string },
    patientName: string,
    source: CrisisSource,
    when: Date = new Date(),
  ): Promise<boolean> {
    const link = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/notifications`;
    const kind = SOURCE_LABEL[source];
    const time = when.toUTCString();
    const text = [
      `Hello ${therapist.name},`,
      '',
      `${patientName}, a patient you are working with, may be going through a very difficult time (flagged from ${kind}, ${time}).`,
      'Please consider checking in with them directly.',
      '',
      'This alert does not include what they wrote. You can see it in BrainHealth:',
      link,
      '',
      'If they need urgent support, the Umang helpline is 0317-4288665.',
      '',
      'This message was generated automatically by BrainHealth. Please do not reply to it.',
    ].join('\n');
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; background: #f9f9f9; border-radius: 12px;">
        <h2 style="color: #92400e;">A patient may need support</h2>
        <p>Hello ${escapeHtml(therapist.name)},</p>
        <p><strong>${escapeHtml(patientName)}</strong>, a patient you are working with, may be going through a very difficult time
        (flagged from ${escapeHtml(kind)}, ${escapeHtml(time)}). Please consider checking in with them directly.</p>
        <p>This alert does not include what they wrote. You can see it in BrainHealth:
        <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
        <p>If they need urgent support, the Umang helpline is <strong>0317-4288665</strong>.</p>
        <p style="margin-top:24px; color:#6b7280; font-size:13px;">This message was generated automatically by BrainHealth. Please do not reply to it.</p>
      </div>`;
    try {
      const sent = await this.mail.send({ to: therapist.email, subject: 'BrainHealth: a patient may need support', html, text });
      // Log that it happened, never who it went to or what it said.
      if (sent) this.logger.log('crisis alert email sent to a linked therapist');
      return sent;
    } catch (e) {
      // This runs unawaited, so nothing may escape as an unhandled rejection.
      this.logger.error(`crisis alert email failed: ${(e as Error).message}`);
      return false;
    }
  }

  async getMyNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }
}
