import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

/** Admin review details are not for patients. */
const PUBLIC_OMIT = { reviewNote: true, submittedAt: true, reviewedAt: true } as const;

/** Public responses never include document bytes: only whether a photo exists, as a URL path. */
const PHOTO_FLAG = { documents: { where: { kind: 'PHOTO' as const }, select: { id: true } } };

type WithPhotoFlag = { id: string; documents?: { id: string }[] };
const withPhotoUrl = <T extends WithPhotoFlag>({ documents, ...rest }: T) => ({
  ...rest,
  photoUrl: documents?.length ? `/therapist/${rest.id}/photo` : null,
});

@Injectable()
export class TherapistService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllVerified(specialization?: string) {
    const profiles = await this.prisma.therapistProfile.findMany({
      omit: PUBLIC_OMIT,
      where: {
        isVerified: true,
        ...(specialization
          ? { specializations: { has: specialization } }
          : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImage: true,
          },
        },
        ...PHOTO_FLAG,
      },
      orderBy: { rating: 'desc' },
    });
    return profiles.map(withPhotoUrl);
  }

  async getOne(id: string) {
    // Only approved therapists are public; a pending or rejected profile is not found.
    const profile = await this.prisma.therapistProfile.findFirst({
      omit: PUBLIC_OMIT,
      where: { id, isVerified: true },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImage: true,
          },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        ...PHOTO_FLAG,
      },
    });
    if (!profile) throw new NotFoundException('Therapist not found');
    return withPhotoUrl(profile);
  }

  async getVerifiedPhoto(therapistProfileId: string) {
    const photo = await this.prisma.therapistDocument.findFirst({
      where: { therapistProfileId, kind: 'PHOTO', therapistProfile: { isVerified: true } },
    });
    if (!photo) throw new NotFoundException('Photo not found');
    return photo;
  }

  async submitReview(
    therapistProfileId: string,
    patientId: string,
    dto: CreateReviewDto,
  ) {
    const profile = await this.prisma.therapistProfile.findUnique({
      where: { id: therapistProfileId },
    });
    if (!profile) throw new NotFoundException('Therapist not found');

    // Check patient has a completed appointment with this therapist
    const completedAppointment = await this.prisma.appointment.findFirst({
      where: {
        patientId,
        therapistId: profile.userId,
        status: 'COMPLETED',
      },
    });
    if (!completedAppointment)
      throw new BadRequestException(
        'You can only review a therapist after a completed session',
      );

    const review = await this.prisma.therapistReview.create({
      data: { therapistProfileId, patientId, ...dto },
    });

    // Recalculate average rating
    const all = await this.prisma.therapistReview.aggregate({
      where: { therapistProfileId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await this.prisma.therapistProfile.update({
      where: { id: therapistProfileId },
      data: {
        rating: all._avg.rating ?? 0,
        totalReviews: all._count.rating,
      },
    });

    return review;
  }

  async verifyTherapist(userId: string) {
    const profile = await this.prisma.therapistProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Therapist profile not found');
    return this.prisma.therapistProfile.update({
      where: { userId },
      data: { isVerified: true, verificationStatus: 'APPROVED', reviewedAt: new Date() },
    });
  }
}
