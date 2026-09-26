import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { MlServiceClient } from './ml-service.client';

const voiceOk = {
  transcript: 'hello there',
  duration: 2.5,
  language: 'en',
  languageProbability: 0.99,
  speakingRate: 96,
  pauseCount: 0,
  models: {},
  note: '',
};

describe('MlServiceClient.analyzeVoice', () => {
  const realFetch = global.fetch;
  const client = new MlServiceClient();
  beforeEach(() => {
    process.env.ML_SERVICE_KEY = 'k';
    process.env.ML_SERVICE_URL = 'http://ml.test';
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.ML_SERVICE_KEY;
    delete process.env.ML_SERVICE_URL;
  });

  it('forwards audio with the internal key and passes language only when given', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => voiceOk }) as any;
    await expect(client.analyzeVoice('QUJD')).resolves.toMatchObject({ transcript: 'hello there' });
    let [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://ml.test/analyze-voice');
    expect(init.headers['X-Internal-Key']).toBe('k');
    expect(JSON.parse(init.body)).toEqual({ audio: 'QUJD' });

    await client.analyzeVoice('QUJD', 'en');
    [, init] = (global.fetch as jest.Mock).mock.calls[1];
    expect(JSON.parse(init.body)).toEqual({ audio: 'QUJD', language: 'en' });
  });

  it.each(['invalid_audio', 'audio_too_large', 'audio_too_long', 'no_speech_detected'])(
    'maps %s to a 422 with a readable message',
    async (error) => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ error }) }) as any;
      await expect(client.analyzeVoice('QUJD')).rejects.toBeInstanceOf(UnprocessableEntityException);
    },
  );

  it('maps ML-service failures and outages to 503 without leaking details', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any;
    await expect(client.analyzeVoice('QUJD')).rejects.toBeInstanceOf(ServiceUnavailableException);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ error: 'analysis_failed' }) }) as any;
    await expect(client.analyzeVoice('QUJD')).rejects.toBeInstanceOf(ServiceUnavailableException);
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:8002')) as any;
    await expect(client.analyzeVoice('QUJD')).rejects.toThrow('temporarily unavailable');
  });

  it('fails closed when the key is not configured', async () => {
    delete process.env.ML_SERVICE_KEY;
    global.fetch = jest.fn() as any;
    await expect(client.analyzeVoice('QUJD')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
