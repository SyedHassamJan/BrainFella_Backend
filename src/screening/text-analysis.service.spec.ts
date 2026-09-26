import { TextAnalysisService } from './text-analysis.service';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number) => ({ ok: false, status, json: async () => ({}) });

// Route each stubbed model call by the model id in the URL.
function stubHf(handlers: {
  emotion?: () => unknown;
  sentiment?: () => unknown;
  zeroshot?: () => unknown;
}) {
  return jest.fn(async (url: string, init: any) => {
    if (url.includes('emotion')) return (handlers.emotion ?? (() => fail(500)))();
    if (url.includes('sentiment')) return (handlers.sentiment ?? (() => fail(500)))();
    if (url.includes('zeroshot')) return (handlers.zeroshot ?? (() => fail(500)))();
    throw new Error('unexpected url ' + url + JSON.stringify(init).slice(0, 10));
  });
}

const EMOTION = [[{ label: 'sadness', score: 0.81 }, { label: 'fear', score: 0.1 }, { label: 'weird', score: 0.05 }, { label: 'joy', score: 0.04 }]];
const SENTIMENT = [[{ label: 'negative', score: 0.9 }, { label: 'neutral', score: 0.07 }, { label: 'positive', score: 0.03 }]];
const ZEROSHOT = [
  { label: 'feeling depressed, sad, or hopeless', score: 0.77 },
  { label: 'feeling anxious, worried, or afraid', score: 0.41 },
  { label: 'feeling stressed, overwhelmed, or under pressure', score: 0.63 },
];

describe('TextAnalysisService', () => {
  const realFetch = global.fetch;
  let notifications: { createNotification: jest.Mock };
  let service: TextAnalysisService;

  beforeEach(() => {
    process.env.HUGGINGFACE_API_KEY = 'hf_test';
    process.env.HF_EMOTION_MODEL = 'x/emotion-model';
    process.env.HF_SENTIMENT_MODEL = 'x/sentiment-model';
    process.env.HF_ZEROSHOT_MODEL = 'x/zeroshot-model';
    notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    service = new TextAnalysisService(notifications as any);
  });
  afterEach(() => {
    global.fetch = realFetch;
    for (const k of ['HUGGINGFACE_API_KEY', 'HF_EMOTION_MODEL', 'HF_SENTIMENT_MODEL', 'HF_ZEROSHOT_MODEL']) delete process.env[k];
  });

  it('maps all three models into the screening signals', async () => {
    global.fetch = stubHf({ emotion: () => ok(EMOTION), sentiment: () => ok(SENTIMENT), zeroshot: () => ok(ZEROSHOT) }) as any;
    const r = await service.analyze('u1', 'I feel low and worried about exams.');
    expect(r.available).toBe(true);
    expect(r.emotionalTone).toMatchObject({ emotion: 'sadness', score: 0.81 });
    expect(r.emotionalTone!.scores).not.toHaveProperty('weird'); // unknown labels dropped
    expect(r.sentiment).toEqual({ label: 'negative', score: 0.9 });
    expect(r.depressionLanguageScore).toBe(0.77);
    expect(r.anxietyLanguageScore).toBe(0.41);
    expect(r.stressLanguageScore).toBe(0.63);
    expect(r.unavailableSignals).toEqual([]);
    expect(r.crisisFlag).toBe(false);
    expect(notifications.createNotification).not.toHaveBeenCalled();
    expect(r.note).toMatch(/not a diagnosis/);
  });

  it('sends the zero-shot hypotheses as multi-label, truncated input', async () => {
    const fetchMock = stubHf({ emotion: () => ok(EMOTION), sentiment: () => ok(SENTIMENT), zeroshot: () => ok(ZEROSHOT) });
    global.fetch = fetchMock as any;
    await service.analyze('u1', 'a'.repeat(4000));
    const zsCall = fetchMock.mock.calls.find(([u]) => u.includes('zeroshot'))!;
    const body = JSON.parse(zsCall[1].body);
    expect(body.inputs).toHaveLength(2000);
    expect(body.parameters.multi_label).toBe(true);
    expect(body.parameters.candidate_labels).toHaveLength(3);
  });

  it('marks a failed model as unavailable (null), never as a fake neutral score', async () => {
    global.fetch = stubHf({ emotion: () => ok(EMOTION), sentiment: () => fail(500), zeroshot: () => fail(401) }) as any;
    const r = await service.analyze('u1', 'I feel low today.');
    expect(r.available).toBe(true);
    expect(r.emotionalTone).not.toBeNull();
    expect(r.sentiment).toBeNull();
    expect(r.depressionLanguageScore).toBeNull();
    expect(r.unavailableSignals.sort()).toEqual(['languageSignals', 'sentiment']);
  });

  it('reports model_unavailable when every model fails', async () => {
    global.fetch = stubHf({}) as any;
    const r = await service.analyze('u1', 'I feel low today.');
    expect(r).toMatchObject({ available: false, reason: 'model_unavailable' });
    expect(r.unavailableSignals).toHaveLength(3);
  });

  it('survives an unreachable network', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;
    const r = await service.analyze('u1', 'I feel low today.');
    expect(r.reason).toBe('model_unavailable');
  });

  it('skips the models for non-English speech and says why', async () => {
    global.fetch = jest.fn() as any;
    const r = await service.analyze('u1', 'mujhe thakawat hai', 'ur');
    expect(r).toMatchObject({ available: false, reason: 'non_english', emotionalTone: null, depressionLanguageScore: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips the models for non-Latin typed text', async () => {
    global.fetch = jest.fn() as any;
    const r = await service.analyze('u1', 'مجھے بہت تھکاوٹ محسوس ہو رہی ہے');
    expect(r.reason).toBe('non_english');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('flags crisis keywords, notifies, and still scores the text', async () => {
    global.fetch = stubHf({ emotion: () => ok(EMOTION), sentiment: () => ok(SENTIMENT), zeroshot: () => ok(ZEROSHOT) }) as any;
    const r = await service.analyze('u1', 'I feel hopeless and want to die');
    expect(r.crisisFlag).toBe(true);
    expect(r.crisisSupport).toMatch(/0317-4288665/);
    expect(notifications.createNotification).toHaveBeenCalledWith('u1', expect.any(String), expect.any(String), 'CRISIS_DETECTED');
    expect(r.available).toBe(true);
  });

  it('still raises the crisis flag when the models are down or the language is skipped', async () => {
    global.fetch = stubHf({}) as any;
    expect((await service.analyze('u1', 'I feel hopeless')).crisisFlag).toBe(true);
    global.fetch = jest.fn() as any;
    expect((await service.analyze('u1', 'I feel hopeless', 'ur')).crisisFlag).toBe(true);
    expect(notifications.createNotification).toHaveBeenCalledTimes(2);
  });
});
