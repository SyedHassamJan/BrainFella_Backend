import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationService } from 'src/notification/notification.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { CompleteAppointmentDto } from './dto/complete-appointment.dto';
import { Role } from 'src/types/enums';

@Injectable()
export class AppointmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(patientId: string, dto: CreateAppointmentDto) {
    return this.prisma.appointment.create({
      data: {
        patientId,
        therapistId: dto.therapistId,
        scheduledAt: new Date(dto.scheduledAt),
        duration: dto.duration ?? 60,
        sessionType: dto.sessionType ?? 'ONLINE',
        notes: dto.notes,
      },
    });
  }

  async getMyAppointments(userId: string, role: Role) {
    if (role === Role.THERAPIST) {
      return this.prisma.appointment.findMany({
        where: { therapistId: userId },
        include: {
          patient: {
            select: { id: true, name: true, email: true, profileImage: true },
          },
        },
        orderBy: { scheduledAt: 'desc' },
      });
    }
    return this.prisma.appointment.findMany({
      where: { patientId: userId },
      include: {
        therapist: {
          select: { id: true, name: true, email: true, profileImage: true },
        },
      },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async confirm(appointmentId: string, therapistId: string) {
    const appointment = await this.findAndVerifyTherapist(
      appointmentId,
      therapistId,
    );
    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CONFIRMED' },
    });
    await this.notificationService.createNotification(
      appointment.patientId,
      'Appointment Confirmed',
      `Your appointment on ${appointment.scheduledAt.toLocaleDateString()} has been confirmed.`,
      'APPOINTMENT_CONFIRMED',
    );
    return updated;
  }

  async cancel(appointmentId: string, userId: string, role: Role) {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        OR: [{ patientId: userId }, { therapistId: userId }],
      },
    });
    if (!appointment) throw new ForbiddenException('Access denied or appointment not found');
    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED' },
    });
    const notifyUserId =
      role === Role.THERAPIST ? appointment.patientId : appointment.therapistId;
    await this.notificationService.createNotification(
      notifyUserId,
      'Appointment Cancelled',
      `An appointment scheduled for ${appointment.scheduledAt.toLocaleDateString()} has been cancelled.`,
      'APPOINTMENT_CANCELLED',
    );
    return updated;
  }

  async complete(
    appointmentId: string,
    therapistId: string,
    dto: CompleteAppointmentDto,
  ) {
    await this.findAndVerifyTherapist(appointmentId, therapistId);
    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'COMPLETED', ...dto },
    });
  }

  private async findAndVerifyTherapist(
    appointmentId: string,
    therapistId: string,
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.therapistId !== therapistId)
      throw new ForbiddenException('You are not the therapist for this appointment');
    return appointment;
  }
}
