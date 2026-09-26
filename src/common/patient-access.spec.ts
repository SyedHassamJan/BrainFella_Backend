import { ForbiddenException } from '@nestjs/common';
import { assertTherapistPatientLink } from './patient-access';

describe('assertTherapistPatientLink', () => {
  it('passes when a confirmed/completed appointment links them', async () => {
    const prisma: any = { appointment: { findFirst: jest.fn().mockResolvedValue({ id: 'a' }) } };
    await expect(assertTherapistPatientLink(prisma, 't', 'p')).resolves.toBeUndefined();
    expect(prisma.appointment.findFirst.mock.calls[0][0].where).toEqual({
      therapistId: 't',
      patientId: 'p',
      status: { in: ['CONFIRMED', 'COMPLETED'] },
    });
  });

  it('throws 403 when there is no such appointment (e.g. only PENDING or CANCELLED)', async () => {
    const prisma: any = { appointment: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(assertTherapistPatientLink(prisma, 't', 'p')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
