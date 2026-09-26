import { BANDS, FUSION } from './fusion.config';
import { FusionService, levelOf, normalizeByBands, QuestionnaireInput, SignalInput } from './fusion.service';

const NOW = new Date('2026-09-27T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const H = 60 * 60 * 1000;
const D = 24 * H;

const q = (type: any, score: number, age = 0, extra: Partial<QuestionnaireInput> = {}): QuestionnaireInput => ({
  type,
  score,
  answers: Array(type === 'PHQ9' ? 9 : 7).fill(0),
  subscores: null,
  createdAt: ago(age),
  ...extra,
});
const dass = (dep: number, anx: number, str: number, age = 0): QuestionnaireInput => ({
  type: 'DASS21',
  score: dep + anx + str,
  answers: [],
  subscores: {
    depression: { score: dep, severity: '' },
    anxiety: { score: anx, severity: '' },
    stress: { score: str, severity: '' },
  },
  createdAt: ago(age),
});
const text = (scores: { dep?: number; anx?: number; str?: number }, extra: any = {}, age = 0): SignalInput => ({
  modality: 'TEXT',
  createdAt: ago(age),
  payload: {
    source: 'typed',
    depressionLanguageScore: scores.dep ?? null,
    anxietyLanguageScore: scores.anx ?? null,
    stressLanguageScore: scores.str ?? null,
    crisisFlag: false,
    ...extra,
  },
});
const face = (scores: Record<string, number>, extra: any = {}, age = 0): SignalInput => ({
  modality: 'FACIAL',
  createdAt: ago(age),
  payload: { emotion: 'x', emotionScores: scores, eyeContact: true, headPose: { yaw: 1, pitch: 2, roll: 3 }, ...extra },
});
const voice = (extra: any = {}, age = 0): SignalInput => ({
  modality: 'VOICE',
  createdAt: ago(age),
  payload: { duration: 10, language: 'en', speakingRate: 120, pauseCount: 1, ...extra },
});

describe('FusionService', () => {
  const svc = new FusionService();
  const run = (questionnaires: QuestionnaireInput[] = [], signals: SignalInput[] = []) =>
    svc.computeRiskIndicator({ questionnaires, signals }, NOW);

  describe('normalizeByBands (piecewise linear over published bands)', () => {
    it.each([
      [0, 0], [4, 20], [5, 20], [12, 50], [14, 60], [15, 60], [27, 100],
    ])('PHQ-9 total %i -> %f', (total, expected) => {
      expect(normalizeByBands(total, BANDS.PHQ9)).toBeCloseTo(expected, 5);
    });
    it('GAD-7 total 8 -> 43.75', () => {
      expect(normalizeByBands(8, BANDS.GAD7)).toBeCloseTo(43.75, 5);
    });
    it('OCI-R puts the clinical cutoff (21) at 50 and the max at 100', () => {
      expect(normalizeByBands(21, BANDS.OCIR)).toBe(50);
      expect(normalizeByBands(72, BANDS.OCIR)).toBe(100);
      expect(normalizeByBands(10, BANDS.OCIR)).toBe(25);
    });
    it('clamps out-of-range values', () => {
      expect(normalizeByBands(-5, BANDS.PHQ9)).toBe(0);
      expect(normalizeByBands(99, BANDS.PHQ9)).toBe(100);
    });
  });

  it('levels: <25 Low, <50 Mild, <75 Moderate, else High', () => {
    expect([24, 25, 49, 50, 74, 75].map(levelOf)).toEqual(['Low', 'Mild', 'Mild', 'Moderate', 'Moderate', 'High']);
  });

  describe('weighted combination (hand-computed)', () => {
    it('questionnaire alone: PHQ-9 total 12 -> depression 50, high confidence', () => {
      const r = run([q('PHQ9', 12)]);
      expect(r.depressionRisk).toBe(50);
      expect(r.anxietyRisk).toBeNull();
      expect(r.confidence).toBe('high');
      expect(r.breakdown.conditions.depression!.sources).toEqual([
        expect.objectContaining({ source: 'questionnaire', weight: 1, score: 50 }),
      ]);
    });

    it('questionnaire + text: weights 0.7/0.2 renormalize to 0.778/0.222 -> 0.778*50 + 0.222*60 = 52.2 -> 52', () => {
      expect(run([q('PHQ9', 12)], [text({ dep: 0.6 })]).depressionRisk).toBe(52);
    });

    it('questionnaire + text + face: 0.7*50 + 0.2*60 + 0.1*10 = 48', () => {
      const r = run([q('PHQ9', 12)], [text({ dep: 0.6 }), face({ sad: 0.1 })]);
      expect(r.depressionRisk).toBe(48);
      expect(r.inputsUsed).toEqual(['questionnaire', 'text', 'facial']);
    });

    it('anxiety uses GAD-7, text anxiety score and facial fear', () => {
      // GAD-7 8 -> 43.75; text 0.4 -> 40; fear 0.2 -> 20  => 30.625 + 8 + 2 = 40.625 -> 41
      expect(run([q('GAD7', 8)], [text({ anx: 0.4 }), face({ fear: 0.2 })]).anxietyRisk).toBe(41);
    });

    it('a missing input never lowers a score: an agreeing extra source leaves it unchanged', () => {
      expect(run([q('PHQ9', 12)], [text({ dep: 0.5 })]).depressionRisk).toBe(run([q('PHQ9', 12)]).depressionRisk);
    });

    it('PHQ-9 and DASS-21 depression are averaged into the questionnaire source: (50 + 60) / 2 = 55', () => {
      // DASS-21 depression 20 is the top of its moderate band -> 60
      const r = run([q('PHQ9', 12), dass(20, 0, 0)]);
      expect(r.depressionRisk).toBe(55);
    });

    it('DASS-21 alone yields depression, anxiety and stress from its subscales', () => {
      const r = run([dass(28, 14, 26)]);
      expect(r.depressionRisk).toBe(80); // extremely severe starts at 80
      expect(r.anxietyRisk).toBe(60); // top of moderate
      expect(r.stressRisk).toBe(60); // bottom of severe
    });

    it('OCD comes only from OCI-R; text and face do not touch it', () => {
      expect(run([], [text({ dep: 1, anx: 1, str: 1 }), face({ sad: 1, fear: 1 })]).ocdRisk).toBeNull();
      expect(run([q('OCIR', 21)], [text({ dep: 1 })]).ocdRisk).toBe(50);
    });

    it('stress comes from DASS-21 and text only (no facial contribution)', () => {
      const r = run([], [face({ sad: 1, fear: 1, angry: 1 })]);
      expect(r.stressRisk).toBeNull();
      const withText = run([dass(0, 0, 26)], [text({ str: 0.5 }), face({ angry: 1 })]);
      // stress: DASS 26 -> 60 (weight 0.7/0.9), text 50 (0.2/0.9) => 46.67 + 11.11 = 57.8 -> 58
      expect(withText.stressRisk).toBe(58);
      expect(withText.breakdown.conditions.stress!.sources.map((s) => s.source)).toEqual(['questionnaire', 'text']);
    });
  });

  describe('no validated questionnaire => capped and low-confidence', () => {
    it('text alone at 100 is capped to 60', () => {
      const r = run([], [text({ dep: 1 })]);
      expect(r.depressionRisk).toBe(FUSION.noQuestionnaireCap);
      expect(r.breakdown.conditions.depression).toMatchObject({ capped: true, confidence: 'low' });
      expect(r.confidence).toBe('low');
    });
    it('face alone cannot reach top of scale either', () => {
      expect(run([], [face({ fear: 0.95 })]).anxietyRisk).toBe(60);
    });
    it('a score below the cap is left alone but still low-confidence', () => {
      const r = run([], [text({ dep: 0.3 })]);
      expect(r.depressionRisk).toBe(30);
      expect(r.breakdown.conditions.depression).toMatchObject({ capped: false, confidence: 'low' });
    });
    it('overall confidence is low if ANY reported condition lacks a questionnaire', () => {
      const r = run([q('PHQ9', 12)], [text({ anx: 0.4 })]); // depression has a questionnaire, anxiety does not
      expect(r.breakdown.conditions.depression!.confidence).toBe('high');
      expect(r.breakdown.conditions.anxiety!.confidence).toBe('low');
      expect(r.confidence).toBe('low');
    });
    it('a questionnaire lifts the cap: 100 questionnaire-backed risk is not capped', () => {
      expect(run([q('PHQ9', 27)], [text({ dep: 1 })]).depressionRisk).toBe(100);
    });
  });

  describe('recency windows', () => {
    it('PHQ-9 counts for 14 days, not 15', () => {
      expect(run([q('PHQ9', 12, 13 * D)]).depressionRisk).toBe(50);
      expect(run([q('PHQ9', 12, 15 * D)]).depressionRisk).toBeNull();
    });
    it('DASS-21 counts for 7 days, OCI-R for 30', () => {
      expect(run([dass(20, 0, 0, 6 * D)]).depressionRisk).toBe(60);
      expect(run([dass(20, 0, 0, 8 * D)]).depressionRisk).toBeNull();
      expect(run([q('OCIR', 21, 29 * D)]).ocdRisk).toBe(50);
      expect(run([q('OCIR', 21, 31 * D)]).ocdRisk).toBeNull();
    });
    it('signals count for 24 hours', () => {
      expect(run([], [text({ dep: 0.3 }, {}, 23 * H)]).depressionRisk).toBe(30);
      expect(run([], [text({ dep: 0.3 }, {}, 25 * H)]).depressionRisk).toBeNull();
    });
    it('uses the latest submission per instrument', () => {
      expect(run([q('PHQ9', 4, 2 * D), q('PHQ9', 12, 1 * D), q('PHQ9', 27, 5 * D)]).depressionRisk).toBe(50);
    });
    it('averages at most the 5 most recent signals of a modality', () => {
      const many = [1, 2, 3, 4, 5].map((i) => text({ dep: 0.2 }, {}, i * H)).concat([text({ dep: 1 }, {}, 10 * H)]);
      expect(run([], many).depressionRisk).toBe(20); // the 6th (1.0) is excluded
    });
    it('ignores inputs dated in the future', () => {
      expect(run([q('PHQ9', 12, -1 * D)]).depressionRisk).toBeNull();
    });
  });

  describe('recorded but NOT scored: voice timing, eye contact, head pose', () => {
    it('voice timing does not change any score, and voice alone scores nothing', () => {
      const base = run([q('PHQ9', 12)]);
      const withVoice = run([q('PHQ9', 12)], [voice({ speakingRate: 40, pauseCount: 30 })]);
      expect(withVoice.depressionRisk).toBe(base.depressionRisk);
      expect(run([], [voice()]).depressionRisk).toBeNull();
      expect(withVoice.breakdown.recordedNotScored.voice).toMatchObject({ speakingRate: 40, pauseCount: 30 });
    });
    it('eye contact and head pose are reported but do not affect the score', () => {
      const a = run([], [face({ sad: 0.5 }, { eyeContact: true, headPose: { yaw: 0, pitch: 0, roll: 0 } })]);
      const b = run([], [face({ sad: 0.5 }, { eyeContact: false, headPose: { yaw: 45, pitch: 30, roll: 10 } })]);
      expect(a.depressionRisk).toBe(b.depressionRisk);
      expect(b.breakdown.recordedNotScored.facial).toEqual({ eyeContact: false, headPose: { yaw: 45, pitch: 30, roll: 10 } });
    });
    it('"voice" appears in inputsUsed only when its transcript fed a scored text signal', () => {
      expect(run([], [text({ dep: 0.5 }, { source: 'voice' })]).inputsUsed).toContain('voice');
      expect(run([], [text({ dep: 0.5 })]).inputsUsed).not.toContain('voice');
      expect(run([q('PHQ9', 12)], [voice()]).inputsUsed).toEqual(['questionnaire']);
    });
  });

  describe('crisis', () => {
    it('PHQ-9 item 9 raises crisisFlag even when the score is minimal', () => {
      const answers = [0, 0, 0, 0, 0, 0, 0, 0, 1];
      const r = run([q('PHQ9', 1, 0, { answers })]);
      expect(r.depressionRisk).toBeLessThan(25);
      expect(r.crisisFlag).toBe(true);
      expect(r.breakdown.crisisSources).toContain('PHQ-9 item 9');
      expect(r.breakdown.recommendations[0]).toMatchObject({ id: 'crisis_support', priority: 'urgent' });
    });
    it('a crisis-flagged text signal raises it even when no model scored anything', () => {
      const r = run([], [text({}, { crisisFlag: true })]);
      expect(r.crisisFlag).toBe(true);
      expect(r.depressionRisk).toBeNull();
    });
    it('an old PHQ-9 item-9 answer outside its window no longer counts', () => {
      const answers = [0, 0, 0, 0, 0, 0, 0, 0, 2];
      expect(run([q('PHQ9', 2, 15 * D, { answers })]).crisisFlag).toBe(false);
    });
    it('no crisis flag when item 9 is zero', () => {
      expect(run([q('PHQ9', 12)]).crisisFlag).toBe(false);
    });
  });

  describe('recommendations (static rules, no AI)', () => {
    const ids = (r: ReturnType<typeof run>) => r.breakdown.recommendations.map((x) => x.id);
    it('high risk -> book_therapist and cbt_exercises', () => {
      expect(ids(run([q('PHQ9', 20)]))).toEqual(expect.arrayContaining(['book_therapist', 'cbt_exercises']));
    });
    it('low risk -> keep_tracking, no therapist push', () => {
      const r = run([q('PHQ9', 2)]);
      expect(ids(r)).toContain('keep_tracking');
      expect(ids(r)).not.toContain('book_therapist');
    });
    it('low confidence -> asks for a questionnaire', () => {
      expect(ids(run([], [text({ dep: 0.7 })]))).toContain('complete_questionnaire');
    });
    it('does NOT push "book a therapist" on a low-confidence (capped, text-only) score', () => {
      const r = run([], [text({ dep: 1, anx: 1, str: 1 })]); // all three capped at 60, no questionnaire
      expect(r.depressionRisk).toBe(60);
      expect(ids(r)).not.toContain('book_therapist');
      expect(ids(r)).toEqual(expect.arrayContaining(['complete_questionnaire', 'cbt_exercises']));
    });
    it('does push it when the high risk is questionnaire-backed, even if another condition is low-confidence', () => {
      expect(ids(run([q('PHQ9', 20)], [text({ anx: 0.3 })]))).toContain('book_therapist');
    });
    it('always suggests re-screening later', () => {
      expect(ids(run([q('PHQ9', 2)]).breakdown && run([q('PHQ9', 2)]))).toContain('retake_later');
    });
  });

  it('with no inputs at all: everything null, no crisis, nothing used', () => {
    const r = run();
    expect([r.depressionRisk, r.anxietyRisk, r.stressRisk, r.ocdRisk]).toEqual([null, null, null, null]);
    expect(r.crisisFlag).toBe(false);
    expect(r.inputsUsed).toEqual([]);
  });

  it('is labelled a screening result / risk indicator, never a diagnosis or trained model', () => {
    const r = run([q('PHQ9', 12)]);
    expect(r.disclaimer).toMatch(/not a medical diagnosis/);
    expect(r.disclaimer).toMatch(/not the output of a trained/);
    expect(r.breakdown.method).toMatch(/not a trained model/);
    expect(r.computedAt).toEqual(NOW);
  });

  it('breakdown lists which questionnaires were used', () => {
    const r = run([q('PHQ9', 12, 1 * D), q('GAD7', 8, 2 * D)]);
    expect(r.breakdown.questionnairesUsed.map((x) => x.type)).toEqual(['PHQ9', 'GAD7']);
  });
});
