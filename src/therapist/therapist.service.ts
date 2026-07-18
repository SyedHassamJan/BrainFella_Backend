import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class TherapistService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllVerified(specialization?: string) {
    return this.prisma.therapistProfile.findMany({
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
      },
      orderBy: { rating: 'desc' },
    });
  }

  async getOne(id: string) {
    const profile = await this.prisma.therapistProfile.findUnique({
      where: { id },
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
      },
    });
    if (!profile) throw new NotFoundException('Therapist not found');
    return profile;
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
      data: { isVerified: true },
    });
  }
}
