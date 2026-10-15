import { BadRequestException, ConflictException } from '@nestjs/common';
import { TherapistApplicationService } from './therapist-application.service';

const PDF_B64 = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(50)]).toString('base64');
const PNG_B64 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]).toString('base64');

const baseDto = {
  bio: 'Clinical psychologist working with students on anxiety and exam stress.',
  specializations: ['Anxiety', ' Anxiety ', 'Depression'],
  qualifications: ['MS Clinical Psychology'],
  experienceYears: 5,
  whatsappNumber: '0300 1234567',
};

describe('TherapistApplicationService', () => {
  let profile: any;
  let prisma: any;
  let notifications: { createNotification: jest.Mock };
  let service: TherapistApplicationService;

  beforeEach(() => {
    profile = { id: 'tp1', userId: 't1', verificationStatus: 'NOT_SUBMITTED', isVerified: false, documents: [] };
    prisma = {
      therapistProfile: {
        upsert: jest.fn().mockImplementation(async () => profile),
        update: jest.fn().mockImplementation(async ({ data }) => Object.assign(profile, data)),
        findUnique: jest.fn().mockImplementation(async () => profile),
      },
      therapistDocument: {
        upsert: jest.fn().mockImplementation(async ({ create }) => {
          profile.documents = [...profile.documents.filter((d: any) => d.kind !== create.kind), { id: `d-${create.kind}`, kind: create.kind }];
          return create;
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Dr Ayesha' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'admin1' }]),
      },
      $transaction: jest.fn().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    service = new TherapistApplicationService(prisma, notifications as any);
  });

  it('a first submission needs both a CV and a photo', async () => {
    await expect(service.submit('t1', { ...baseDto, photo: { fileName: 'me.png', data: PNG_B64 } })).rejects.toThrow('Please upload your CV.');
    await expect(service.submit('t1', { ...baseDto, cv: { fileName: 'cv.pdf', data: PDF_B64 } })).rejects.toThrow('Please upload a profile photo.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a complete submission stores the files, goes PENDING (not verified) and notifies admins', async () => {
    await service.submit('t1', { ...baseDto, cv: { fileName: 'cv.pdf', data: PDF_B64 }, photo: { fileName: 'me.png', data: PNG_B64 } });
    expect(prisma.therapistDocument.upsert).toHaveBeenCalledTimes(2);
    expect(profile).toMatchObject({
      verificationStatus: 'PENDING',
      isVerified: false,
      whatsappNumber: '923001234567',
      specializations: ['Anxiety', 'Depression'],
    });
    expect(notifications.createNotification).toHaveBeenCalledWith('admin1', 'New therapist application', expect.any(String), 'THERAPIST_APPLICATION', 't1');
  });

  it('rejects an invalid WhatsApp number before writing anything', async () => {
    await expect(
      service.submit('t1', { ...baseDto, whatsappNumber: '123', cv: { fileName: 'cv.pdf', data: PDF_B64 }, photo: { fileName: 'me.png', data: PNG_B64 } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a rejected therapist can resubmit without re-uploading files', async () => {
    profile.verificationStatus = 'REJECTED';
    profile.documents = [{ id: 'd1', kind: 'CV' }, { id: 'd2', kind: 'PHOTO' }];
    await service.submit('t1', baseDto);
    expect(profile.verificationStatus).toBe('PENDING');
    expect(prisma.therapistDocument.upsert).not.toHaveBeenCalled();
  });

  it('an approved therapist cannot resubmit (it would hide them from patients)', async () => {
    profile.verificationStatus = 'APPROVED';
    await expect(service.submit('t1', baseDto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('approve makes the therapist verified and tells them; reject stores the reason', async () => {
    profile.verificationStatus = 'PENDING';
    await service.approve('t1');
    expect(profile).toMatchObject({ verificationStatus: 'APPROVED', isVerified: true });
    expect(notifications.createNotification).toHaveBeenLastCalledWith('t1', expect.any(String), expect.any(String), 'THERAPIST_APPROVED');

    await service.reject('t1', 'CV is unreadable, please upload a clearer scan.');
    expect(profile).toMatchObject({ verificationStatus: 'REJECTED', isVerified: false, reviewNote: 'CV is unreadable, please upload a clearer scan.' });
    expect(notifications.createNotification).toHaveBeenLastCalledWith('t1', expect.any(String), expect.stringContaining('unreadable'), 'THERAPIST_REJECTED');
  });

  it('cannot approve someone who never applied', async () => {
    await expect(service.approve('t1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
