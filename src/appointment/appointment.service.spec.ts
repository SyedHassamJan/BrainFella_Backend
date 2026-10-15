import { NotFoundException } from '@nestjs/common';
import { AppointmentService } from './appointment.service';

describe('AppointmentService.create', () => {
  const dto = { therapistId: 't1', scheduledAt: '2026-11-01T10:00:00.000Z' } as any;
  let prisma: any;
  let service: AppointmentService;

  beforeEach(() => {
    prisma = {
      therapistProfile: { findFirst: jest.fn() },
      appointment: { create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'a1', ...data })) },
    };
    service = new AppointmentService(prisma, {} as any);
  });

  it('books an approved, active therapist', async () => {
    prisma.therapistProfile.findFirst.mockResolvedValue({ id: 'tp1' });
    const appt = await service.create('p1', dto);
    expect(appt).toMatchObject({ patientId: 'p1', therapistId: 't1' });
    expect(prisma.therapistProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 't1', isVerified: true }) }),
    );
  });

  it('refuses a therapist who is pending, rejected, inactive or not a therapist at all', async () => {
    prisma.therapistProfile.findFirst.mockResolvedValue(null);
    await expect(service.create('p1', dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });
});
