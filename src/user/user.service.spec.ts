import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserService } from './user.service';

describe('UserService.updateProfile', () => {
  let tx: any;
  let service: UserService;

  beforeEach(() => {
    tx = {
      user: { update: jest.fn().mockResolvedValue({ id: 'u1', name: 'A' }) },
      patientProfile: { upsert: jest.fn().mockResolvedValue({}) },
      therapistProfile: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = { $transaction: jest.fn(async (cb: any) => cb(tx)) };
    service = new UserService(prisma);
  });

  const upserted = () => tx.patientProfile.upsert.mock.calls[0][0];

  it('turns a bare date of birth ("2003-05-21") into a Date (passing the string made Prisma throw a 500)', async () => {
    await service.updateProfile('u1', { patientProfile: { dateOfBirth: '2003-05-21', gender: 'Female' } } as any);
    const { create, update } = upserted();
    expect(update.dateOfBirth).toBeInstanceOf(Date);
    expect((update.dateOfBirth as Date).toISOString()).toBe('2003-05-21T00:00:00.000Z');
    expect(create.dateOfBirth).toBeInstanceOf(Date);
    expect(update.gender).toBe('Female');
    expect(create.userId).toBe('u1');
  });

  it('accepts a full ISO timestamp too', async () => {
    await service.updateProfile('u1', { patientProfile: { dateOfBirth: '2003-05-21T00:00:00.000Z' } } as any);
    expect((upserted().update.dateOfBirth as Date).toISOString()).toBe('2003-05-21T00:00:00.000Z');
  });

  it('leaves the profile alone when no date of birth is sent', async () => {
    await service.updateProfile('u1', { patientProfile: { gender: 'Male' } } as any);
    expect(upserted().update).toEqual({ gender: 'Male' });
    expect(upserted().update).not.toHaveProperty('dateOfBirth');
  });

  it('does not touch the patient profile when only base fields change', async () => {
    await service.updateProfile('u1', { name: 'New Name' } as any);
    expect(tx.patientProfile.upsert).not.toHaveBeenCalled();
    expect(tx.user.update.mock.calls[0][0].data).toEqual({ name: 'New Name' });
  });
});

// Validated through the SAME pipe configuration as main.ts, so this is what a real request meets.
describe('UpdateProfileDto through the global ValidationPipe', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const run = (body: object) => pipe.transform(body, { type: 'body', metatype: UpdateProfileDto });

  it('accepts a normal update, with a bare date or a full timestamp', async () => {
    await expect(run({ name: 'A', patientProfile: { dateOfBirth: '2003-05-21', gender: 'Female' } })).resolves.toBeDefined();
    await expect(run({ patientProfile: { dateOfBirth: '2003-05-21T00:00:00.000Z' } })).resolves.toBeDefined();
    await expect(run({ therapistProfile: { bio: 'hi', consultationFee: 2500, specializations: ['CBT'] } })).resolves.toBeDefined();
  });

  it('rejects a nonsense date of birth with a 400 (it used to reach the database and 500)', async () => {
    await expect(run({ patientProfile: { dateOfBirth: 'garbage' } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(run({ patientProfile: { dateOfBirth: '2003-13-45' } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects wrongly-typed nested fields', async () => {
    await expect(run({ therapistProfile: { consultationFee: 'free' } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(run({ patientProfile: { conditions: 'anxiety' } })).rejects.toBeInstanceOf(BadRequestException);
  });

  // Regression: nested objects were not validated, so unknown fields were copied into the DB write.
  it('rejects smuggled fields inside patientProfile (e.g. re-pointing the profile at another user)', async () => {
    await expect(run({ patientProfile: { gender: 'x', userId: 'someone-else' } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(run({ patientProfile: { id: 'x' } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects privilege-escalating fields inside therapistProfile (self-verification, fake rating)', async () => {
    for (const evil of [{ isVerified: true }, { rating: 5 }, { totalReviews: 999 }, { userId: 'x' }]) {
      await expect(run({ therapistProfile: { bio: 'hi', ...evil } })).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('still rejects unknown top-level fields', async () => {
    await expect(run({ role: 'ADMIN' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
