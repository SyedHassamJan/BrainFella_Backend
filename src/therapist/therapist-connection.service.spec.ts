import { NotFoundException } from '@nestjs/common';
import { TherapistConnectionService } from './therapist-connection.service';

describe('TherapistConnectionService', () => {
  let row: any;
  let prisma: any;
  let notifications: { createNotification: jest.Mock };
  let service: TherapistConnectionService;

  beforeEach(() => {
    row = null;
    prisma = {
      therapistProfile: { findFirst: jest.fn().mockResolvedValue({ userId: 't1' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Aisha' }) },
      therapistConnection: {
        findUnique: jest.fn().mockImplementation(async () => row),
        upsert: jest.fn().mockImplementation(async ({ create, update }) => (row = row ? { ...row, ...update } : { ...create })),
      },
    };
    notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    service = new TherapistConnectionService(prisma, notifications as any);
  });

  it('a WhatsApp tap records the contact, grants no access, and tells the therapist only the first time', async () => {
    const first = await service.contact('p1', 'tp1');
    expect(first).toMatchObject({ sharing: false, sharedAt: null });
    expect(first.contactedAt).toBeInstanceOf(Date);
    await service.contact('p1', 'tp1');
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    expect(notifications.createNotification).toHaveBeenCalledWith('t1', expect.any(String), expect.stringContaining('stay private'), 'PATIENT_CONTACT', 'p1');
  });

  it('sharing can be switched on (therapist told once) and off again', async () => {
    expect((await service.setSharing('p1', 'tp1', true)).sharing).toBe(true);
    expect(notifications.createNotification).toHaveBeenLastCalledWith('t1', expect.any(String), expect.any(String), 'RECORDS_SHARED', 'p1');
    expect((await service.setSharing('p1', 'tp1', false))).toMatchObject({ sharing: false, sharedAt: null });
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
  });

  it('cannot contact or share with a therapist who is not approved', async () => {
    prisma.therapistProfile.findFirst.mockResolvedValue(null);
    await expect(service.contact('p1', 'tp-pending')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.setSharing('p1', 'tp-pending', true)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.therapistConnection.upsert).not.toHaveBeenCalled();
  });
});
