import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from 'src/types/enums';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllUsers(role?: Role, isActive?: boolean) {
    return this.prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        profileImage: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDashboard() {
    const [
      totalUsers,
      totalPatients,
      totalTherapists,
      totalSessions,
      totalJournals,
      crisisJournals,
      crisisMessages,
      totalAppointments,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'PATIENT' } }),
      this.prisma.user.count({ where: { role: 'THERAPIST' } }),
      this.prisma.chatSession.count(),
      this.prisma.journalEntry.count(),
      this.prisma.journalEntry.count({ where: { isCrisis: true } }),
      this.prisma.chatMessage.count({ where: { isCrisis: true } }),
      this.prisma.appointment.count(),
    ]);

    return {
      totalUsers,
      totalPatients,
      totalTherapists,
      totalSessions,
      totalJournals,
      crisisEventsCount: crisisJournals + crisisMessages,
      totalAppointments,
    };
  }

  async deactivateUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: { id: true, name: true, isActive: true },
    });
  }

  async getCrisisEvents() {
    const [crisisJournals, crisisMessages] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where: { isCrisis: true },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.chatMessage.findMany({
        where: { isCrisis: true },
        include: {
          session: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { crisisJournals, crisisMessages };
  }
}
