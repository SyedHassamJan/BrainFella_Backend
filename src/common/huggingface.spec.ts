import { containsCrisisKeywords } from './crisis';
import {
  hfModelUrl,
  hfPost,
  HfError,
  parseClassification,
  parseZeroShot,
} from './huggingface';

describe('huggingface helpers', () => {
  it('uses the inference-providers router, not the retired api-inference host', () => {
    expect(hfModelUrl('a/b')).toBe(
      'https://router.huggingface.co/hf-inference/models/a/b',
    );
  });

  describe('parseClassification', () => {
    const rows = [
      { label: 'joy', score: 0.1 },
      { label: 'sadness', score: 0.8 },
    ];
    it('accepts nested and flat shapes and sorts by score', () => {
      expect(parseClassification([rows])[0].label).toBe('sadness');
      expect(parseClassification(rows)[0].label).toBe('sadness');
    });
    it('returns [] for junk', () => {
      for (const junk of [null, undefined, {}, 'x', [[{ label: 1 }]], [{}]]) {
        expect(parseClassification(junk)).toEqual([]);
      }
    });
  });

  describe('parseZeroShot', () => {
    it('accepts the list shape', () => {
      expect(parseZeroShot([{ label: 'a', score: 0.2 }, { label: 'b', score: 0.7 }])).toEqual({ a: 0.2, b: 0.7 });
    });
    it('accepts the labels/scores shape', () => {
      expect(parseZeroShot({ labels: ['a', 'b'], scores: [0.9, 0.1] })).toEqual({ a: 0.9, b: 0.1 });
    });
    it('returns {} for junk', () => {
      expect(parseZeroShot(null)).toEqual({});
    });
  });

  describe('hfPost', () => {
    const realFetch = global.fetch;
    afterEach(() => {
      global.fetch = realFetch;
      delete process.env.HUGGINGFACE_API_KEY;
    });

    it('throws without calling the network when no key is set', async () => {
      global.fetch = jest.fn();
      await expect(hfPost('m', {})).rejects.toBeInstanceOf(HfError);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sends the bearer key and throws HfError on non-2xx', async () => {
      process.env.HUGGINGFACE_API_KEY = 'hf_test';
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
      await expect(hfPost('m', { inputs: 'x' })).rejects.toMatchObject({ status: 401 });
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('router.huggingface.co');
      expect(init.headers.Authorization).toBe('Bearer hf_test');
    });
  });
});

describe('containsCrisisKeywords', () => {
  it('matches case-insensitively', () => {
    expect(containsCrisisKeywords('I feel HOPELESS lately')).toBe(true);
    expect(containsCrisisKeywords('I want to die')).toBe(true);
  });
  it('does not match ordinary text', () => {
    expect(containsCrisisKeywords('I am tired but hopeful about my exams')).toBe(false);
  });
});
