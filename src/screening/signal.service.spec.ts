import { SignalService } from './signal.service';

const DAY = 24 * 60 * 60 * 1000;

describe('SignalService', () => {
  let prisma: any;
  let service: SignalService;
  const saved = () => prisma.screeningSignal.create.mock.calls.map((c: any) => c[0].data);

  beforeEach(() => {
    prisma = {
      screeningSignal: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    service = new SignalService(prisma);
  });

  it('stores voice timing but NEVER the transcript', async () => {
    await service.saveVoice('u1', {
      transcript: 'my private words',
      duration: 9,
      language: 'en',
      languageProbability: 0.99,
      speakingRate: 120,
      pauseCount: 2,
      models: {},
      note: '',
    });
    const [row] = saved();
    expect(row).toMatchObject({ userId: 'u1', modality: 'VOICE' });
    expect(JSON.stringify(row)).not.toContain('private words');
    expect(Object.keys(row.payload).sort()).toEqual(['duration', 'language', 'languageProbability', 'pauseCount', 'speakingRate']);
  });

  it('stores facial signals without any image data', async () => {
    await service.saveFacial('u1', {
      emotion: 'happy',
      emotionScores: { happy: 0.9 },
      eyeContact: true,
      blinkRate: null,
      headPose: { yaw: 1, pitch: 2, roll: 3 },
      models: {},
      note: '',
    });
    const [row] = saved();
    expect(row.modality).toBe('FACIAL');
    expect(Object.keys(row.payload).sort()).toEqual(['emotion', 'emotionScores', 'eyeContact', 'headPose']);
  });

  describe('saveText', () => {
    const base: any = {
      available: true,
      sentiment: { label: 'negative', score: 0.9 },
      emotionalTone: { emotion: 'sadness', score: 0.8, scores: { sadness: 0.8 } },
      depressionLanguageScore: 0.7,
      anxietyLanguageScore: 0.2,
      stressLanguageScore: 0.3,
      unavailableSignals: [],
      crisisFlag: false,
      models: {},
      note: '',
    };

    it('stores the derived scores, tagged with their source, and no text', async () => {
      await service.saveText('u1', { ...base, transcript: 'never stored' }, 'voice');
      const [row] = saved();
      expect(row.payload).toMatchObject({ source: 'voice', depressionLanguageScore: 0.7, crisisFlag: false });
      expect(JSON.stringify(row)).not.toContain('never stored');
    });

    it('skips results that carry nothing (unavailable and no crisis)', async () => {
      await service.saveText('u1', { ...base, available: false, crisisFlag: false }, 'typed');
      expect(prisma.screeningSignal.create).not.toHaveBeenCalled();
    });

    it('still stores a crisis-only result so the fusion layer sees it', async () => {
      await service.saveText('u1', { ...base, available: false, crisisFlag: true }, 'typed');
      expect(saved()[0].payload.crisisFlag).toBe(true);
    });
  });

  it('a storage failure never fails the analysis', async () => {
    prisma.screeningSignal.create.mockRejectedValue(new Error('db down'));
    await expect(service.saveVoice('u1', { duration: 1, language: 'en', languageProbability: 1, speakingRate: 1, pauseCount: 0 } as any)).resolves.toBeUndefined();
  });

  it('getRecent maps rows and scopes to the user', async () => {
    const since = new Date('2026-09-26T00:00:00Z');
    prisma.screeningSignal.findMany.mockResolvedValue([{ modality: 'TEXT', payload: { a: 1 }, createdAt: since, id: 'x' }]);
    const out = await service.getRecent('u1', since);
    expect(prisma.screeningSignal.findMany.mock.calls[0][0].where).toEqual({ userId: 'u1', createdAt: { gte: since } });
    expect(out).toEqual([{ modality: 'TEXT', payload: { a: 1 }, createdAt: since }]);
  });

  it('purges signals older than 30 days', async () => {
    const now = new Date('2026-09-27T03:00:00Z');
    prisma.screeningSignal.deleteMany.mockResolvedValue({ count: 4 });
    await expect(service.purgeExpired(now)).resolves.toBe(4);
    const cutoff: Date = prisma.screeningSignal.deleteMany.mock.calls[0][0].where.createdAt.lt;
    expect(now.getTime() - cutoff.getTime()).toBe(30 * DAY);
  });
});
