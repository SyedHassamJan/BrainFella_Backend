import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hash } from 'argon2';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetGuardianDto } from './dto/set-guardian.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const { password, ...user } = createUserDto;
    const hashedPassword = password ? await hash(password) : undefined;
    return await this.prisma.user.create({
      data: {
        ...user,
        ...(hashedPassword ? { password: hashedPassword } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        profileImage: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async getAllUsers() {
    return await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        profileImage: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async findByEmail(email: string) {
    return await this.prisma.user.findUnique({ where: { email } });
  }

  async findOne(userId: string) {
    return await this.prisma.user.findUnique({ where: { id: userId } });
  }

  async updateHashedRefreshToken(userId: string, hashedRT: string | null) {
    return await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: hashedRT },
    });
  }

  async getProfile(userId: string) {
    return await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        profileImage: true,
        phone: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        patientProfile: true,
        therapistProfile: true,
        guardianLink: true,
      },
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const { patientProfile, therapistProfile, ...baseFields } = dto;

    return await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: baseFields,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          profileImage: true,
          phone: true,
          isActive: true,
          updatedAt: true,
        },
      });

      if (patientProfile) {
        await tx.patientProfile.upsert({
          where: { userId },
          create: { userId, ...patientProfile },
          update: patientProfile,
        });
      }

      if (therapistProfile) {
        await tx.therapistProfile.upsert({
          where: { userId },
          create: { userId, ...therapistProfile },
          update: therapistProfile,
        });
      }

      return user;
    });
  }

  async setGuardian(userId: string, dto: SetGuardianDto) {
    return await this.prisma.guardianLink.upsert({
      where: { patientId: userId },
      create: { patientId: userId, ...dto },
      update: dto,
    });
  }

  async getTherapistPatients(therapistId: string) {
    // Get all patients who have an appointment with this therapist
    const appointments = await this.prisma.appointment.findMany({
      where: { therapistId, status: { in: ['CONFIRMED', 'COMPLETED'] } },
      select: {
        patient: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImage: true,
            patientProfile: true,
          },
        },
      },
      distinct: ['patientId'],
    });
    return appointments.map((a) => a.patient);
  }
}
