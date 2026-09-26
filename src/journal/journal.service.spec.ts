import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateJournalDto } from './dto/create-journal.dto';
import { UpdateJournalDto } from './dto/update-journal.dto';
import { JournalService } from './journal.service';

const errorsFor = async (cls: any, plain: object) => (await validate(plainToInstance(cls, plain))).map((e) => e.property);

describe('journal entry length rules', () => {
  it('has NO minimum length: a single word, even a very short one, is valid', async () => {
    for (const content of ['x', 'ok', 'suicide', 'I am tired', 'a'.repeat(20000)]) {
      expect(await errorsFor(CreateJournalDto, { content })).toEqual([]);
    }
  });

  it('still requires some content (an empty entry is meaningless) and a string', async () => {
    expect(await errorsFor(CreateJournalDto, { content: '' })).toEqual(['content']);
    expect(await errorsFor(CreateJournalDto, {})).toEqual(['content']);
    expect(await errorsFor(CreateJournalDto, { content: 42 })).toEqual(['content']);
  });

  it('update: short content is fine when provided, empty is not, and it stays optional', async () => {
    expect(await errorsFor(UpdateJournalDto, { content: 'hi' })).toEqual([]);
    expect(await errorsFor(UpdateJournalDto, {})).toEqual([]);
    expect(await errorsFor(UpdateJournalDto, { content: '' })).toEqual(['content']);
    expect(await errorsFor(UpdateJournalDto, { title: 'x'.repeat(101) })).toEqual(['title']);
  });
});

describe('JournalService.create', () => {
  const realFetch = global.fetch;
  let prisma: any;
  let notifications: { createNotification: jest.Mock; notifyLinkedTherapistsOfCrisis: jest.Mock };
  let service: JournalService;

  beforeEach(() => {
    process.env.HUGGINGFACE_API_KEY = 'hf_test';
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any; // emotion model down: falls back to neutral
    prisma = { journalEntry: { create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'j1', ...data })) } };
    notifications = { createNotification: jest.fn().mockResolvedValue({}), notifyLinkedTherapistsOfCrisis: jest.fn().mockResolvedValue(0) };
    service = new JournalService(prisma, notifications as any);
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.HUGGINGFACE_API_KEY;
  });

  it('a one-word crisis entry is saved, flagged, and alerts the patient and linked therapists', async () => {
    const entry = await service.create('u1', { content: 'suicide' });
    expect(entry.isCrisis).toBe(true);
    expect(notifications.createNotification).toHaveBeenCalledWith('u1', expect.any(String), expect.any(String), 'CRISIS_DETECTED');
    expect(notifications.notifyLinkedTherapistsOfCrisis).toHaveBeenCalledWith('u1', 'journal');
  });

  it('an ordinary entry alerts no one', async () => {
    const entry = await service.create('u1', { content: 'ok' });
    expect(entry.isCrisis).toBe(false);
    expect(notifications.createNotification).not.toHaveBeenCalled();
    expect(notifications.notifyLinkedTherapistsOfCrisis).not.toHaveBeenCalled();
  });
});
