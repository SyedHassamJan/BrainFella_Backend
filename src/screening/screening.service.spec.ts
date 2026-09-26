import { ScreeningService } from './screening.service';

const voice = (language: string) => ({
  transcript: 'I have been feeling tired.',
  duration: 3,
  language,
  languageProbability: 0.99,
  speakingRate: 100,
  pauseCount: 0,
  models: {},
  note: '',
});

describe('ScreeningService', () => {
  const textResult = { available: true, crisisFlag: false } as any;
  let text: { analyze: jest.Mock };
  let ml: { analyzeVoice: jest.Mock };
  let service: ScreeningService;

  beforeEach(() => {
    text = { analyze: jest.fn().mockResolvedValue(textResult) };
    ml = { analyzeVoice: jest.fn() };
    service = new ScreeningService(text as any, ml as any);
  });

  it('runs the transcript through text analysis with the DETECTED language', async () => {
    ml.analyzeVoice.mockResolvedValue(voice('en'));
    const r = await service.analyzeVoice('u1', 'QUJD');
    expect(text.analyze).toHaveBeenCalledWith('u1', 'I have been feeling tired.', 'en');
    expect(r.textAnalysis).toBe(textResult);
    expect(r.transcript).toBe('I have been feeling tired.');
  });

  it('passes a non-English detected language through (text analysis then skips scoring)', async () => {
    ml.analyzeVoice.mockResolvedValue(voice('ur'));
    await service.analyzeVoice('u1', 'QUJD');
    expect(text.analyze).toHaveBeenCalledWith('u1', expect.any(String), 'ur');
  });

  it('does not force a language unless the caller supplied one', async () => {
    ml.analyzeVoice.mockResolvedValue(voice('en'));
    await service.analyzeVoice('u1', 'QUJD');
    expect(ml.analyzeVoice).toHaveBeenCalledWith('QUJD', undefined);
  });

  it('does not run text analysis when voice analysis fails', async () => {
    ml.analyzeVoice.mockRejectedValue(new Error('no speech'));
    await expect(service.analyzeVoice('u1', 'QUJD')).rejects.toThrow('no speech');
    expect(text.analyze).not.toHaveBeenCalled();
  });

  it('analyzes typed text without a language hint', async () => {
    await service.analyzeText('u1', 'hello');
    expect(text.analyze).toHaveBeenCalledWith('u1', 'hello');
  });
});
