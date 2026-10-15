import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationService } from 'src/notification/notification.service';
import { SubmitTherapistApplicationDto } from './dto/therapist-application.dto';
import { decodeTherapistFile, normalizeWhatsappNumber, TherapistFileKind } from './therapist-files';

/** Document metadata only: the bytes are fetched separately, one file at a time. */
const DOCUMENT_META = { id: true, kind: true, fileName: true, mimeType: true, size: true, createdAt: true } as const;

const APPLICATION_SELECT = {
  id: true,
  userId: true,
  bio: true,
  specializations: true,
  qualifications: true,
  experienceYears: true,
  consultationFee: true,
  whatsappNumber: true,
  isVerified: true,
  verificationStatus: true,
  submittedAt: true,
  reviewedAt: true,
  reviewNote: true,
  createdAt: true,
  documents: { select: DOCUMENT_META },
} as const;

export type ApplicationStatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_SUBMITTED';

/**
 * A therapist applies (profile + CV + photo), an admin reviews and approves or
 * rejects. Only APPROVED therapists are listed to patients (isVerified is kept
 * in sync, so existing listing code needs no change).
 */
@Injectable()
export class TherapistApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  // ── Therapist side ───────────────────────────────────────────

  async getMine(userId: string) {
    const profile = await this.prisma.therapistProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: APPLICATION_SELECT,
    });
    return profile;
  }

  async submit(userId: string, dto: SubmitTherapistApplicationDto) {
    const current = await this.getMine(userId);
    if (current.verificationStatus === 'APPROVED') {
      throw new ConflictException('Your profile is already approved. Update your details from your profile settings.');
    }
    // A PENDING or REJECTED therapist may resubmit (fix details, replace files); it goes back to PENDING.

    const whatsappNumber = normalizeWhatsappNumber(dto.whatsappNumber);
    if (!whatsappNumber) {
      throw new BadRequestException('Please enter a valid WhatsApp number with country code, e.g. +92 300 1234567.');
    }

    // Decode first so nothing is written if a file is invalid.
    const uploads: { kind: TherapistFileKind; fileName: string; data: Buffer; mimeType: string }[] = [];
    if (dto.cv) uploads.push({ kind: 'CV', fileName: dto.cv.fileName, ...decodeTherapistFile('CV', dto.cv.data) });
    if (dto.photo) uploads.push({ kind: 'PHOTO', fileName: dto.photo.fileName, ...decodeTherapistFile('PHOTO', dto.photo.data) });

    const has = (kind: TherapistFileKind) => uploads.some((u) => u.kind === kind) || current.documents.some((d) => d.kind === kind);
    if (!has('CV')) throw new BadRequestException('Please upload your CV.');
    if (!has('PHOTO')) throw new BadRequestException('Please upload a profile photo.');

    const clean = (list: string[]) => [...new Set(list.map((s) => s.trim()).filter(Boolean))];

    await this.prisma.$transaction([
      ...uploads.map((u) =>
        this.prisma.therapistDocument.upsert({
          where: { therapistProfileId_kind: { therapistProfileId: current.id, kind: u.kind } },
          create: { therapistProfileId: current.id, kind: u.kind, fileName: u.fileName, mimeType: u.mimeType, size: u.data.length, data: u.data },
          update: { fileName: u.fileName, mimeType: u.mimeType, size: u.data.length, data: u.data, createdAt: new Date() },
        }),
      ),
      this.prisma.therapistProfile.update({
        where: { id: current.id },
        data: {
          bio: dto.bio.trim(),
          specializations: clean(dto.specializations),
          qualifications: clean(dto.qualifications),
          experienceYears: dto.experienceYears,
          consultationFee: dto.consultationFee ?? null,
          whatsappNumber,
          verificationStatus: 'PENDING',
          isVerified: false,
          submittedAt: new Date(),
          reviewedAt: null,
          reviewNote: null,
        },
      }),
    ]);

    await this.notifyAdmins(userId);
    return this.getMine(userId);
  }

  private async notifyAdmins(therapistUserId: string) {
    const [therapist, admins] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: therapistUserId }, select: { name: true } }),
      this.prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } }),
    ]);
    await Promise.all(
      admins.map((a) =>
        this.notifications.createNotification(
          a.id,
          'New therapist application',
          `${therapist?.name ?? 'A therapist'} has submitted their profile and CV for review.`,
          'THERAPIST_APPLICATION',
          therapistUserId,
        ),
      ),
    );
  }

  // ── Admin side ───────────────────────────────────────────────

  async list(status?: ApplicationStatusFilter) {
    return this.prisma.therapistProfile.findMany({
      where: status ? { verificationStatus: status } : { verificationStatus: { not: 'NOT_SUBMITTED' } },
      select: {
        ...APPLICATION_SELECT,
        user: { select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true } },
      },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getForAdmin(userId: string) {
    const profile = await this.prisma.therapistProfile.findUnique({
      where: { userId },
      select: {
        ...APPLICATION_SELECT,
        user: { select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true } },
      },
    });
    if (!profile) throw new NotFoundException('Therapist application not found');
    return profile;
  }

  async getDocument(documentId: string) {
    const doc = await this.prisma.therapistDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async approve(userId: string) {
    const profile = await this.getForAdmin(userId);
    if (profile.verificationStatus === 'NOT_SUBMITTED') {
      throw new BadRequestException('This therapist has not submitted an application yet.');
    }
    await this.prisma.therapistProfile.update({
      where: { userId },
      data: { verificationStatus: 'APPROVED', isVerified: true, reviewedAt: new Date(), reviewNote: null },
    });
    await this.notifications.createNotification(
      userId,
      'Your profile is approved',
      'Welcome to BrainHealth. Your profile is now visible to patients, who can book sessions and message you on WhatsApp.',
      'THERAPIST_APPROVED',
    );
    return this.getForAdmin(userId);
  }

  async reject(userId: string, reason: string) {
    const profile = await this.getForAdmin(userId);
    if (profile.verificationStatus === 'NOT_SUBMITTED') {
      throw new BadRequestException('This therapist has not submitted an application yet.');
    }
    await this.prisma.therapistProfile.update({
      where: { userId },
      data: { verificationStatus: 'REJECTED', isVerified: false, reviewedAt: new Date(), reviewNote: reason.trim() },
    });
    await this.notifications.createNotification(
      userId,
      'Your application needs changes',
      `Your therapist application was not approved yet. Reason: "${reason.trim()}". You can update it and submit again.`,
      'THERAPIST_REJECTED',
    );
    return this.getForAdmin(userId);
  }
}
