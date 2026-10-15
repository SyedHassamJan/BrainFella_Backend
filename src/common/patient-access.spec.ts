import { ForbiddenException } from '@nestjs/common';
import { assertTherapistPatientLink, linkedTherapistIds } from './patient-access';

const prismaWith = (appointment: unknown, shared: unknown) => ({
  appointment: { findFirst: jest.fn().mockResolvedValue(appointment) },
  therapistConnection: { findFirst: jest.fn().mockResolvedValue(shared) },
});

describe('assertTherapistPatientLink', () => {
  it('passes when a confirmed/completed appointment links them', async () => {
    const prisma: any = prismaWith({ id: 'a' }, null);
    await expect(assertTherapistPatientLink(prisma, 't', 'p')).resolves.toBeUndefined();
    expect(prisma.appointment.findFirst.mock.calls[0][0].where).toEqual({
      therapistId: 't',
      patientId: 'p',
      status: { in: ['CONFIRMED', 'COMPLETED'] },
    });
  });

  it('passes when the patient chose to share their records (no appointment needed)', async () => {
    const prisma: any = prismaWith(null, { id: 'c' });
    await expect(assertTherapistPatientLink(prisma, 't', 'p')).resolves.toBeUndefined();
    expect(prisma.therapistConnection.findFirst.mock.calls[0][0].where).toEqual({ therapistId: 't', patientId: 'p', sharedAt: { not: null } });
  });

  it('throws 403 with neither (e.g. only a PENDING booking, or only a WhatsApp tap)', async () => {
    const prisma: any = prismaWith(null, null);
    await expect(assertTherapistPatientLink(prisma, 't', 'p')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('linkedTherapistIds', () => {
  it('merges both routes without duplicates', async () => {
    const prisma: any = {
      appointment: { findMany: jest.fn().mockResolvedValue([{ therapistId: 't1' }, { therapistId: 't2' }]) },
      therapistConnection: { findMany: jest.fn().mockResolvedValue([{ therapistId: 't2' }, { therapistId: 't3' }]) },
    };
    expect((await linkedTherapistIds(prisma, 'p')).sort()).toEqual(['t1', 't2', 't3']);
  });
});
