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
  let ml: { analyzeVoice: jest.Mock; analyzeFace: jest.Mock };
  let signals: { saveText: jest.Mock; saveVoice: jest.Mock; saveFacial: jest.Mock };
  let service: ScreeningService;

  beforeEach(() => {
    text = { analyze: jest.fn().mockResolvedValue(textResult) };
    ml = { analyzeVoice: jest.fn(), analyzeFace: jest.fn() };
    signals = {
      saveText: jest.fn().mockResolvedValue(undefined),
      saveVoice: jest.fn().mockResolvedValue(undefined),
      saveFacial: jest.fn().mockResolvedValue(undefined),
    };
    service = new ScreeningService(text as any, ml as any, signals as any);
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

  it('stores derived signals after typed-text analysis', async () => {
    await service.analyzeText('u1', 'hello');
    expect(signals.saveText).toHaveBeenCalledWith('u1', textResult, 'typed');
  });

  it('stores voice timing and the transcript-derived text signal (as source "voice")', async () => {
    const v = voice('en');
    ml.analyzeVoice.mockResolvedValue(v);
    await service.analyzeVoice('u1', 'QUJD');
    expect(signals.saveVoice).toHaveBeenCalledWith('u1', v);
    expect(signals.saveText).toHaveBeenCalledWith('u1', textResult, 'voice');
  });

  it('stores nothing when voice analysis fails', async () => {
    ml.analyzeVoice.mockRejectedValue(new Error('no speech'));
    await expect(service.analyzeVoice('u1', 'QUJD')).rejects.toThrow();
    expect(signals.saveVoice).not.toHaveBeenCalled();
    expect(signals.saveText).not.toHaveBeenCalled();
  });

  it('face: forwards the image, stores the signal, returns the ML result', async () => {
    const face = { emotion: 'happy', emotionScores: {}, eyeContact: true, headPose: {} };
    ml.analyzeFace.mockResolvedValue(face);
    await expect(service.analyzeFace('u1', 'SU1H')).resolves.toBe(face);
    expect(ml.analyzeFace).toHaveBeenCalledWith('SU1H');
    expect(signals.saveFacial).toHaveBeenCalledWith('u1', face);
  });

  it('face: stores nothing when the ML service rejects the image', async () => {
    ml.analyzeFace.mockRejectedValue(new Error('no face'));
    await expect(service.analyzeFace('u1', 'SU1H')).rejects.toThrow('no face');
    expect(signals.saveFacial).not.toHaveBeenCalled();
  });
});
