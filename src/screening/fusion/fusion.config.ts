import { QuestionnaireType } from 'src/types/enums';

/**
 * Configuration of the rule-based fusion layer.
 *
 * These are documented DESIGN CHOICES, not learned parameters and not
 * clinically validated. Nothing here is trained or fitted to data. See
 * FUSION_METHODOLOGY.md for the rationale, references and limitations.
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const FUSION = {
  /**
   * Relative weight of each evidence source when several are present. Weights
   * are renormalized over the sources actually present, so a missing input
   * never lowers or penalizes a score.
   *  - questionnaire: validated self-report instruments carry the most weight
   *  - text:          language signals from pretrained NLP models (smaller)
   *  - facial:        pretrained facial-expression model (smallest adjustment)
   */
  weights: { questionnaire: 0.7, text: 0.2, facial: 0.1 },

  /**
   * Without a validated questionnaire behind it, a risk is capped here and
   * marked low-confidence. The text and facial models are neither calibrated
   * nor validated for screening (the zero-shot text scores in particular are
   * strongly saturated near 0 or 1), so they must not be able to produce a
   * top-of-scale score on their own.
   */
  noQuestionnaireCap: 60,

  /** How long an input stays relevant. Questionnaire windows follow each instrument's own recall period. */
  windowMs: {
    PHQ9: 14 * DAY, // PHQ-9 asks about the last 2 weeks
    GAD7: 14 * DAY, // GAD-7 asks about the last 2 weeks
    DASS21: 7 * DAY, // DASS-21 asks about the past week
    OCIR: 30 * DAY, // OCI-R asks about the past month
    signals: 24 * HOUR, // facial / voice / text signals
  },

  /** Signals of one modality within the window are averaged, using at most the N most recent. */
  maxSignalsPerModality: 5,

  /** Derived signals are deleted after this many days (data minimization). */
  signalRetentionDays: 30,

  /** Display levels for a 0-100 risk indicator: <25 Low, <50 Mild, <75 Moderate, else High. */
  levelBounds: [25, 50, 75] as const,
};

/** [minScore, maxScore, riskAtMin, riskAtMax]: linear inside each published severity band. */
export type Band = [number, number, number, number];

/**
 * Mapping from an instrument's raw total to a 0-100 risk scale, piecewise
 * linear across its PUBLISHED severity bands so a "moderate" result lands
 * near the middle of the scale (rather than raw/max, which would understate
 * it). Band edges: PHQ-9 Kroenke et al. 2001; GAD-7 Spitzer et al. 2006;
 * OCI-R Foa et al. 2002 (>= 21 is the clinical cutoff, placed at 50);
 * DASS-21 Lovibond & Lovibond 1995 (scores already multiplied by 2).
 */
export const BANDS: {
  PHQ9: Band[];
  GAD7: Band[];
  OCIR: Band[];
  DASS21: Record<'depression' | 'anxiety' | 'stress', Band[]>;
} = {
  PHQ9: [
    [0, 4, 0, 20], // minimal
    [5, 9, 20, 40], // mild
    [10, 14, 40, 60], // moderate
    [15, 19, 60, 80], // moderately severe
    [20, 27, 80, 100], // severe
  ],
  GAD7: [
    [0, 4, 0, 25], // minimal
    [5, 9, 25, 50], // mild
    [10, 14, 50, 75], // moderate
    [15, 21, 75, 100], // severe
  ],
  OCIR: [
    [0, 20, 0, 50], // below the clinical cutoff
    [21, 72, 50, 100], // clinical range
  ],
  DASS21: {
    depression: [
      [0, 9, 0, 20],
      [10, 13, 20, 40],
      [14, 20, 40, 60],
      [21, 27, 60, 80],
      [28, 42, 80, 100],
    ],
    anxiety: [
      [0, 7, 0, 20],
      [8, 9, 20, 40],
      [10, 14, 40, 60],
      [15, 19, 60, 80],
      [20, 42, 80, 100],
    ],
    stress: [
      [0, 14, 0, 20],
      [15, 18, 20, 40],
      [19, 25, 40, 60],
      [26, 33, 60, 80],
      [34, 42, 80, 100],
    ],
  },
};

export type Condition = 'depression' | 'anxiety' | 'stress' | 'ocd';

export const QUESTIONNAIRE_TYPES: QuestionnaireType[] = ['PHQ9', 'GAD7', 'DASS21', 'OCIR'];

export const DISCLAIMER =
  'This is a screening result (a risk indicator), not a medical diagnosis and not the output of a trained prediction model. It combines self-report questionnaires with signals from pretrained models using fixed rules. Please speak with a qualified professional about your results.';
