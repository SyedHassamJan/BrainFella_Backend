import { scoreQuestionnaire, validateAnswers } from './scoring';

const fill = (n: number, value: number) => Array(n).fill(value);

describe('questionnaire scoring', () => {
  describe('validateAnswers', () => {
    it('rejects wrong length', () => {
      expect(validateAnswers('PHQ9', fill(8, 0))).toMatch(/exactly 9/);
    });
    it('rejects out-of-range and non-integer values', () => {
      expect(validateAnswers('PHQ9', [...fill(8, 0), 4])).toMatch(/0 and 3/);
      expect(validateAnswers('OCIR', [...fill(17, 0), 5])).toMatch(/0 and 4/);
      expect(validateAnswers('GAD7', [...fill(6, 0), -1])).not.toBeNull();
      expect(validateAnswers('GAD7', [...fill(6, 0), 1.5])).not.toBeNull();
    });
    it('accepts valid answers', () => {
      expect(validateAnswers('DASS21', fill(21, 3))).toBeNull();
      expect(validateAnswers('OCIR', fill(18, 4))).toBeNull();
    });
  });

  describe('PHQ-9', () => {
    const cases: [number[], number, string][] = [
      [fill(9, 0), 0, 'Minimal'],
      [[1, 1, 1, 1, 0, 0, 0, 0, 0], 4, 'Minimal'],
      [[1, 1, 1, 1, 1, 0, 0, 0, 0], 5, 'Mild'],
      [[2, 2, 2, 2, 1, 0, 0, 0, 0], 9, 'Mild'],
      [[2, 2, 2, 2, 2, 0, 0, 0, 0], 10, 'Moderate'],
      [[2, 2, 2, 2, 2, 2, 2, 0, 0], 14, 'Moderate'],
      [[2, 2, 2, 2, 2, 2, 2, 1, 0], 15, 'Moderately severe'],
      [[3, 3, 3, 3, 3, 3, 1, 0, 0], 19, 'Moderately severe'],
      [[3, 3, 3, 3, 3, 3, 2, 0, 0], 20, 'Severe'],
      [fill(9, 3), 27, 'Severe'],
    ];
    it.each(cases)('%j → %i (%s)', (answers, score, label) => {
      const r = scoreQuestionnaire('PHQ9', answers);
      expect(r.score).toBe(score);
      expect(r.severityLabel).toBe(label);
    });

    it('flags crisis when item 9 is non-zero, even with a low total', () => {
      const r = scoreQuestionnaire('PHQ9', [0, 0, 0, 0, 0, 0, 0, 0, 1]);
      expect(r.severityLabel).toBe('Minimal');
      expect(r.crisisFlag).toBe(true);
    });
    it('does not flag crisis when item 9 is zero', () => {
      expect(scoreQuestionnaire('PHQ9', fill(8, 3).concat(0)).crisisFlag).toBe(
        false,
      );
    });
  });

  describe('GAD-7', () => {
    const cases: [number, string][] = [
      [0, 'Minimal'],
      [4, 'Minimal'],
      [5, 'Mild'],
      [9, 'Mild'],
      [10, 'Moderate'],
      [14, 'Moderate'],
      [15, 'Severe'],
      [21, 'Severe'],
    ];
    it.each(cases)('total %i → %s', (total, label) => {
      const answers = fill(7, 0);
      for (let i = 0, left = total; left > 0; i++) {
        answers[i] = Math.min(3, left);
        left -= answers[i];
      }
      const r = scoreQuestionnaire('GAD7', answers);
      expect(r.score).toBe(total);
      expect(r.severityLabel).toBe(label);
      expect(r.crisisFlag).toBe(false);
    });
  });

  describe('OCI-R', () => {
    it('applies the cutoff of 21', () => {
      const at20 = [...fill(5, 4), ...fill(13, 0)];
      const at21 = [...fill(5, 4), 1, ...fill(12, 0)];
      expect(scoreQuestionnaire('OCIR', at20).severityLabel).toBe(
        'Below clinical cutoff',
      );
      expect(scoreQuestionnaire('OCIR', at21).severityLabel).toBe(
        'Clinical range',
      );
      expect(scoreQuestionnaire('OCIR', fill(18, 4)).score).toBe(72);
    });
    it('computes the six subscales from the right items', () => {
      const answers = fill(18, 0);
      [5, 11, 17].forEach((n) => (answers[n - 1] = 2)); // washing
      [1, 7, 13].forEach((n) => (answers[n - 1] = 1)); // hoarding
      const r = scoreQuestionnaire('OCIR', answers);
      expect(r.subscores).toEqual({
        washing: 6,
        obsessing: 0,
        hoarding: 3,
        ordering: 0,
        checking: 0,
        neutralizing: 0,
      });
    });
  });

  describe('DASS-21', () => {
    it('all zeros is Normal on every subscale', () => {
      const r = scoreQuestionnaire('DASS21', fill(21, 0));
      expect(r.score).toBe(0);
      expect(r.severityLabel).toBe('Normal');
    });
    it('all threes gives 42 per subscale (extremely severe)', () => {
      const r = scoreQuestionnaire('DASS21', fill(21, 3));
      expect(r.score).toBe(126);
      expect(r.severityLabel).toBe('Extremely severe');
      expect(r.subscores).toEqual({
        depression: { score: 42, severity: 'Extremely severe' },
        anxiety: { score: 42, severity: 'Extremely severe' },
        stress: { score: 42, severity: 'Extremely severe' },
      });
    });
    it('maps items to the correct subscale and doubles the sum', () => {
      const answers = fill(21, 0);
      [3, 5, 10, 13, 16, 17, 21].forEach((n) => (answers[n - 1] = 2)); // D: 14 → 28
      const r = scoreQuestionnaire('DASS21', answers);
      expect(r.subscores).toEqual({
        depression: { score: 28, severity: 'Extremely severe' },
        anxiety: { score: 0, severity: 'Normal' },
        stress: { score: 0, severity: 'Normal' },
      });
      expect(r.severityLabel).toBe('Extremely severe');
    });
    it('uses per-subscale band boundaries', () => {
      const sub = (items: number[], each: number, base = fill(21, 0)) => {
        items.forEach((n) => (base[n - 1] = each));
        return base;
      };
      // Anxiety raw 4 → 8: Mild for anxiety (would still be Normal for depression).
      const a = fill(21, 0);
      [2, 4, 7, 9].forEach((n) => (a[n - 1] = 1));
      expect(scoreQuestionnaire('DASS21', a).subscores).toMatchObject({
        anxiety: { score: 8, severity: 'Mild' },
      });
      // Stress raw 7 → 14: still Normal for stress.
      expect(
        scoreQuestionnaire('DASS21', sub([1, 6, 8, 11, 12, 14, 18], 1))
          .subscores,
      ).toMatchObject({ stress: { score: 14, severity: 'Normal' } });
    });
  });
});
