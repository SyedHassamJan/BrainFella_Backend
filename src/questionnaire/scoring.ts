import { QuestionnaireType } from 'src/types/enums';
import { INSTRUMENTS } from './instruments';

/**
 * Deterministic scoring of standardized screening instruments — fixed
 * published formulas, no AI and no learned parameters. Output is a screening
 * result, never a diagnosis.
 */
export interface ScoringResult {
  score: number;
  severityLabel: string;
  subscores?: Record<string, unknown>;
  /** True when an item that signals possible risk of self-harm was endorsed. */
  crisisFlag: boolean;
}

/** Returns an error message if the answers don't fit the instrument, else null. */
export function validateAnswers(
  type: QuestionnaireType,
  answers: number[],
): string | null {
  const { items, options, name } = INSTRUMENTS[type];
  if (answers.length !== items.length) {
    return `${name} requires exactly ${items.length} answers`;
  }
  const max = options[options.length - 1].value;
  if (answers.some((a) => !Number.isInteger(a) || a < 0 || a > max)) {
    return `${name} answers must be integers between 0 and ${max}`;
  }
  return null;
}

const sum = (answers: number[], oneBasedItems: number[]) =>
  oneBasedItems.reduce((total, n) => total + answers[n - 1], 0);

/** Label of the first band whose upper bound covers the score, else `top`. */
function band(score: number, bands: [number, string][], top: string): string {
  for (const [upper, label] of bands) if (score <= upper) return label;
  return top;
}

// PHQ-9 — Kroenke et al. (2001): total 0–27.
function scorePhq9(answers: number[]): ScoringResult {
  const score = answers.reduce((a, b) => a + b, 0);
  const severityLabel = band(
    score,
    [
      [4, 'Minimal'],
      [9, 'Mild'],
      [14, 'Moderate'],
      [19, 'Moderately severe'],
    ],
    'Severe',
  );
  // Item 9 (thoughts of being better off dead / self-harm): any non-zero
  // answer is treated as a crisis signal regardless of the total score.
  return { score, severityLabel, crisisFlag: answers[8] > 0 };
}

// GAD-7 — Spitzer et al. (2006): total 0–21.
function scoreGad7(answers: number[]): ScoringResult {
  const score = answers.reduce((a, b) => a + b, 0);
  const severityLabel = band(
    score,
    [
      [4, 'Minimal'],
      [9, 'Mild'],
      [14, 'Moderate'],
    ],
    'Severe',
  );
  return { score, severityLabel, crisisFlag: false };
}

// OCI-R — Foa et al. (2002): 18 items scored 0–4, total 0–72; a total of 21
// or more is the published clinical cutoff. Six 3-item subscales.
const OCIR_SUBSCALES: Record<string, number[]> = {
  washing: [5, 11, 17],
  obsessing: [6, 12, 18],
  hoarding: [1, 7, 13],
  ordering: [3, 9, 15],
  checking: [2, 8, 14],
  neutralizing: [4, 10, 16],
};
const OCIR_CUTOFF = 21;

function scoreOcir(answers: number[]): ScoringResult {
  const score = answers.reduce((a, b) => a + b, 0);
  const subscores = Object.fromEntries(
    Object.entries(OCIR_SUBSCALES).map(([name, items]) => [
      name,
      sum(answers, items),
    ]),
  );
  return {
    score,
    severityLabel:
      score >= OCIR_CUTOFF ? 'Clinical range' : 'Below clinical cutoff',
    subscores,
    crisisFlag: false,
  };
}

// DASS-21 — Lovibond & Lovibond (1995): each 7-item subscale is summed and
// multiplied by 2 (to be comparable with the full DASS-42). Severity bands
// differ per subscale.
const DASS_SUBSCALES: Record<
  string,
  { items: number[]; bands: [number, string][] }
> = {
  depression: {
    items: [3, 5, 10, 13, 16, 17, 21],
    bands: [
      [9, 'Normal'],
      [13, 'Mild'],
      [20, 'Moderate'],
      [27, 'Severe'],
    ],
  },
  anxiety: {
    items: [2, 4, 7, 9, 15, 19, 20],
    bands: [
      [7, 'Normal'],
      [9, 'Mild'],
      [14, 'Moderate'],
      [19, 'Severe'],
    ],
  },
  stress: {
    items: [1, 6, 8, 11, 12, 14, 18],
    bands: [
      [14, 'Normal'],
      [18, 'Mild'],
      [25, 'Moderate'],
      [33, 'Severe'],
    ],
  },
};
const DASS_ORDER = ['Normal', 'Mild', 'Moderate', 'Severe', 'Extremely severe'];

function scoreDass21(answers: number[]): ScoringResult {
  const subscores: Record<string, { score: number; severity: string }> = {};
  let worst = 0;
  let score = 0;
  for (const [name, { items, bands }] of Object.entries(DASS_SUBSCALES)) {
    const subscale = sum(answers, items) * 2;
    const severity = band(subscale, bands, 'Extremely severe');
    subscores[name] = { score: subscale, severity };
    score += subscale;
    worst = Math.max(worst, DASS_ORDER.indexOf(severity));
  }
  // Overall label is the most severe subscale band; `score` is the sum of the
  // three ×2 subscale scores (0–126). Per-subscale detail is in `subscores`.
  return {
    score,
    severityLabel: DASS_ORDER[worst],
    subscores,
    crisisFlag: false,
  };
}

const SCORERS: Record<QuestionnaireType, (a: number[]) => ScoringResult> = {
  PHQ9: scorePhq9,
  GAD7: scoreGad7,
  OCIR: scoreOcir,
  DASS21: scoreDass21,
};

/** Caller must have run validateAnswers first. */
export function scoreQuestionnaire(
  type: QuestionnaireType,
  answers: number[],
): ScoringResult {
  return SCORERS[type](answers);
}
