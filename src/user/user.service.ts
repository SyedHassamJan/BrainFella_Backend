import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { hash } from 'argon2';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetGuardianDto } from './dto/set-guardian.dto';
import { assertRealisticEmail } from 'src/common/email-check';
import { normalizeWhatsappNumber } from 'src/therapist/therapist-files';

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
        // A therapist gets an (unverified) profile straight away so they can apply for review.
        ...(user.role === 'THERAPIST' ? { therapistProfile: { create: {} } } : {}),
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
        onboardingCompletedAt: true,
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
    if (therapistProfile?.whatsappNumber !== undefined) {
      const normalized = normalizeWhatsappNumber(therapistProfile.whatsappNumber);
      if (!normalized) {
        throw new BadRequestException('Please enter a valid WhatsApp number with country code, e.g. +92 300 1234567.');
      }
      therapistProfile.whatsappNumber = normalized;
    }

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
        // The DTO accepts an ISO date string (including a bare "2003-05-21"), but
        // Prisma's DateTime needs a Date: passing the string through made it throw (500).
        const { dateOfBirth, ...rest } = patientProfile;
        const data = { ...rest, ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}) };
        await tx.patientProfile.upsert({
          where: { userId },
          create: { userId, ...data },
          update: data,
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
    await assertRealisticEmail(dto.guardianEmail);
    return await this.prisma.guardianLink.upsert({
      where: { patientId: userId },
      create: { patientId: userId, ...dto },
      update: dto,
    });
  }

  /**
   * The therapist's patients. `access: true` (records readable) when linked by a
   * CONFIRMED/COMPLETED appointment or because the patient shares with them.
   * Patients who only tapped "Chat on WhatsApp" are listed with `access: false`
   * and their name only: no email, profile or records.
   */
  async getTherapistPatients(therapistId: string) {
    const [appointments, connections] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { therapistId, status: { in: ['CONFIRMED', 'COMPLETED'] } },
        select: { patientId: true, scheduledAt: true },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.therapistConnection.findMany({
        where: { therapistId },
        select: { patientId: true, contactedAt: true, sharedAt: true },
      }),
    ]);

    type Row = { lastSessionAt: Date | null; contactedAt: Date | null; sharedAt: Date | null; viaAppointment: boolean };
    const rows = new Map<string, Row>();
    const row = (id: string) => rows.get(id) ?? rows.set(id, { lastSessionAt: null, contactedAt: null, sharedAt: null, viaAppointment: false }).get(id)!;
    for (const a of appointments) {
      const r = row(a.patientId);
      r.viaAppointment = true;
      r.lastSessionAt ??= a.scheduledAt; // newest first
    }
    for (const c of connections) Object.assign(row(c.patientId), { contactedAt: c.contactedAt, sharedAt: c.sharedAt });

    const patients = await this.prisma.user.findMany({
      where: { id: { in: [...rows.keys()] }, isActive: true },
      select: { id: true, name: true, email: true, profileImage: true, patientProfile: true },
    });
    return patients
      .map((p) => {
        const r = rows.get(p.id)!;
        const access = r.viaAppointment || !!r.sharedAt;
        return {
          ...(access ? p : { id: p.id, name: p.name }),
          access,
          viaAppointment: r.viaAppointment,
          sharedAt: r.sharedAt,
          contactedAt: r.contactedAt,
          lastSessionAt: r.lastSessionAt,
        };
      })
      .sort((a, b) => Number(b.access) - Number(a.access) || a.name.localeCompare(b.name));
  }

  /** The mobile guided tour is shown until this is set (finished or skipped). */
  async completeOnboarding(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompletedAt: new Date() },
      select: { onboardingCompletedAt: true },
    });
    return user;
  }
}
