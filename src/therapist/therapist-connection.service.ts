import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationService } from 'src/notification/notification.service';

/**
 * A patient's connection to a therapist outside a booking:
 *  - contact(): they tapped "Chat on WhatsApp". The therapist sees them in a
 *    "contacted you" list by name only; this grants NO access to records.
 *  - setSharing(): they chose to share (or stop sharing) their records. While
 *    shared, the therapist is linked like a confirmed appointment.
 */
@Injectable()
export class TherapistConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  /** Approved therapists only, addressed by their public profile id. */
  private async approvedTherapist(profileId: string) {
    const profile = await this.prisma.therapistProfile.findFirst({
      where: { id: profileId, isVerified: true, user: { isActive: true } },
      select: { userId: true },
    });
    if (!profile) throw new NotFoundException('Therapist not found');
    return profile.userId;
  }

  private async patientName(patientId: string) {
    const p = await this.prisma.user.findUnique({ where: { id: patientId }, select: { name: true } });
    return p?.name?.trim() || 'A patient';
  }

  async contact(patientId: string, profileId: string) {
    const therapistId = await this.approvedTherapist(profileId);
    const existing = await this.prisma.therapistConnection.findUnique({
      where: { patientId_therapistId: { patientId, therapistId } },
      select: { contactedAt: true },
    });
    const connection = await this.prisma.therapistConnection.upsert({
      where: { patientId_therapistId: { patientId, therapistId } },
      create: { patientId, therapistId, contactedAt: new Date() },
      update: { contactedAt: new Date() },
    });
    // Tell the therapist the first time only (a patient may tap the button often).
    if (!existing?.contactedAt) {
      await this.notifications.createNotification(
        therapistId,
        'A patient reached out',
        `${await this.patientName(patientId)} opened a WhatsApp chat with you from BrainHealth. Their records stay private unless they choose to share them.`,
        'PATIENT_CONTACT',
        patientId,
      );
    }
    return this.view(connection);
  }

  async setSharing(patientId: string, profileId: string, share: boolean) {
    const therapistId = await this.approvedTherapist(profileId);
    const existing = await this.prisma.therapistConnection.findUnique({
      where: { patientId_therapistId: { patientId, therapistId } },
      select: { sharedAt: true },
    });
    const sharedAt = share ? (existing?.sharedAt ?? new Date()) : null;
    const connection = await this.prisma.therapistConnection.upsert({
      where: { patientId_therapistId: { patientId, therapistId } },
      create: { patientId, therapistId, sharedAt },
      update: { sharedAt },
    });
    if (share && !existing?.sharedAt) {
      await this.notifications.createNotification(
        therapistId,
        'A patient shared their records with you',
        `${await this.patientName(patientId)} has shared their journal, check-ins and screening results with you. You can see them under Patients.`,
        'RECORDS_SHARED',
        patientId,
      );
    }
    return this.view(connection);
  }

  /** The patient's own connections, with the therapist's public details. */
  async listForPatient(patientId: string) {
    const rows = await this.prisma.therapistConnection.findMany({
      where: { patientId },
      orderBy: { updatedAt: 'desc' },
      select: {
        contactedAt: true,
        sharedAt: true,
        therapist: {
          select: {
            name: true,
            therapistProfile: {
              select: { id: true, isVerified: true, specializations: true, documents: { where: { kind: 'PHOTO' }, select: { id: true } } },
            },
          },
        },
      },
    });
    return rows
      .filter((r) => r.therapist.therapistProfile?.isVerified)
      .map((r) => {
        const profile = r.therapist.therapistProfile!;
        return {
          therapistProfileId: profile.id,
          name: r.therapist.name,
          specializations: profile.specializations,
          photoUrl: profile.documents.length ? `/therapist/${profile.id}/photo` : null,
          contactedAt: r.contactedAt,
          sharedAt: r.sharedAt,
        };
      });
  }

  private view(c: { contactedAt?: Date | null; sharedAt?: Date | null }) {
    return { contactedAt: c.contactedAt ?? null, sharedAt: c.sharedAt ?? null, sharing: !!c.sharedAt };
  }
}
