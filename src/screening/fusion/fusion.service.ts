import { Injectable } from '@nestjs/common';
import { QuestionnaireType } from 'src/types/enums';
import {
  BANDS,
  Band,
  Condition,
  DISCLAIMER,
  FUSION,
  QUESTIONNAIRE_TYPES,
} from './fusion.config';

/**
 * Rule-based fusion of screening inputs into a RISK INDICATOR.
 *
 * This is deliberately NOT a trained model: there are no learned parameters,
 * nothing is fitted to data, and nothing is saved by this class. It is a fixed,
 * documented weighted combination (late fusion of per-source scores, in the
 * sense of Baltrusaitis, Ahuja & Morency, "Multimodal Machine Learning: A
 * Survey and Taxonomy", IEEE TPAMI 41(2), 2019), which is why every weight
 * and cap lives in fusion.config.ts and is explained in FUSION_METHODOLOGY.md.
 *
 *  - questionnaire severity bands carry the most weight (validated instruments)
 *  - text and facial signals contribute a smaller adjustment
 *  - missing inputs simply do not contribute (weights renormalize)
 *  - with no validated questionnaire behind it, a risk is capped and marked
 *    low-confidence
 *  - voice timing, eye contact and head pose are recorded but NOT scored: no
 *    validated thresholds exist without a per-person baseline (see
 *    Cummins et al., Speech Communication 71, 2015 for why speech features
 *    are person- and context-dependent)
 */
export interface QuestionnaireInput {
  type: QuestionnaireType;
  score: number;
  answers: unknown;
  subscores: unknown;
  createdAt: Date;
}

export interface SignalInput {
  modality: 'FACIAL' | 'VOICE' | 'TEXT';
  payload: any;
  createdAt: Date;
}

export interface FusionInputs {
  questionnaires: QuestionnaireInput[];
  signals: SignalInput[];
}

export type Level = 'Low' | 'Mild' | 'Moderate' | 'High';
export type Source = 'questionnaire' | 'text' | 'facial';

export interface SourceContribution {
  source: Source;
  /** 0-100 score this source gives this condition. */
  score: number;
  /** Weight after renormalizing over the sources present. */
  weight: number;
  detail: string;
}

export interface ConditionResult {
  risk: number;
  level: Level;
  confidence: 'high' | 'low';
  /** True if the no-questionnaire cap lowered the score. */
  capped: boolean;
  sources: SourceContribution[];
}

export interface Recommendation {
  id: string;
  priority: 'urgent' | 'high' | 'normal';
  text: string;
  /** In-app feature this points to. */
  action?: 'helpline' | 'book_therapist' | 'cbt_exercises' | 'questionnaire';
}

export interface RiskIndicator {
  depressionRisk: number | null;
  anxietyRisk: number | null;
  stressRisk: number | null;
  ocdRisk: number | null;
  crisisFlag: boolean;
  confidence: 'high' | 'low';
  /** Modes that contributed to the numbers ("voice" = its transcript, via text analysis). */
  inputsUsed: string[];
  computedAt: Date;
  breakdown: {
    method: string;
    weights: typeof FUSION.weights;
    noQuestionnaireCap: number;
    conditions: Partial<Record<Condition, ConditionResult>>;
    questionnairesUsed: { type: QuestionnaireType; score: number; takenAt: string }[];
    recordedNotScored: {
      voice?: { speakingRate: number; pauseCount: number; duration: number; language: string };
      facial?: { eyeContact: boolean; headPose: { yaw: number; pitch: number; roll: number } };
    };
    crisisSources: string[];
    recommendations: Recommendation[];
  };
  disclaimer: string;
}

const CONDITIONS: Condition[] = ['depression', 'anxiety', 'stress', 'ocd'];

/** Linear interpolation inside the band that contains `value` (clamped to the scale). */
export function normalizeByBands(value: number, bands: Band[]): number {
  const first = bands[0];
  const last = bands[bands.length - 1];
  const v = Math.min(Math.max(value, first[0]), last[1]);
  const band = bands.find((b) => v >= b[0] && v <= b[1]) ?? last;
  const [min, max, lo, hi] = band;
  return max === min ? lo : lo + ((v - min) / (max - min)) * (hi - lo);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function levelOf(risk: number): Level {
  const [a, b, c] = FUSION.levelBounds;
  return risk < a ? 'Low' : risk < b ? 'Mild' : risk < c ? 'Moderate' : 'High';
}

@Injectable()
export class FusionService {
  computeRiskIndicator(inputs: FusionInputs, now: Date = new Date()): RiskIndicator {
    // ---- 1. questionnaires: latest submission per instrument, inside its window
    const latest = new Map<QuestionnaireType, QuestionnaireInput>();
    for (const q of inputs.questionnaires) {
      const age = now.getTime() - q.createdAt.getTime();
      if (age < 0 || age > FUSION.windowMs[q.type]) continue;
      const prev = latest.get(q.type);
      if (!prev || q.createdAt > prev.createdAt) latest.set(q.type, q);
    }

    const questionnaireScores: Record<Condition, { score: number; label: string }[]> = {
      depression: [],
      anxiety: [],
      stress: [],
      ocd: [],
    };
    const phq9 = latest.get('PHQ9');
    if (phq9) questionnaireScores.depression.push({ score: normalizeByBands(phq9.score, BANDS.PHQ9), label: `PHQ-9 total ${phq9.score}` });
    const gad7 = latest.get('GAD7');
    if (gad7) questionnaireScores.anxiety.push({ score: normalizeByBands(gad7.score, BANDS.GAD7), label: `GAD-7 total ${gad7.score}` });
    const ocir = latest.get('OCIR');
    if (ocir) questionnaireScores.ocd.push({ score: normalizeByBands(ocir.score, BANDS.OCIR), label: `OCI-R total ${ocir.score}` });
    const dass = latest.get('DASS21');
    if (dass && dass.subscores && typeof dass.subscores === 'object') {
      for (const c of ['depression', 'anxiety', 'stress'] as const) {
        const sub = (dass.subscores as any)[c]?.score;
        if (typeof sub === 'number') {
          questionnaireScores[c].push({ score: normalizeByBands(sub, BANDS.DASS21[c]), label: `DASS-21 ${c} ${sub}` });
        }
      }
    }

    // ---- 2. signals: last N per modality, inside the window
    const recent = (modality: SignalInput['modality']) =>
      inputs.signals
        .filter((s) => {
          const age = now.getTime() - s.createdAt.getTime();
          return s.modality === modality && age >= 0 && age <= FUSION.windowMs.signals;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, FUSION.maxSignalsPerModality);

    const textSignals = recent('TEXT');
    const faceSignals = recent('FACIAL');
    const voiceSignals = recent('VOICE');

    const textScore = (key: string): number | null => {
      const xs = textSignals.map((s) => s.payload?.[key]).filter((v): v is number => typeof v === 'number');
      return xs.length ? mean(xs) * 100 : null;
    };
    const faceScore = (emotion: string): number | null => {
      const xs = faceSignals.map((s) => s.payload?.emotionScores?.[emotion]).filter((v): v is number => typeof v === 'number');
      return xs.length ? mean(xs) * 100 : null;
    };
    const viaVoice = textSignals.some((s) => s.payload?.source === 'voice' && typeof s.payload?.depressionLanguageScore === 'number');

    // ---- 3. per-condition weighted combination over the sources present
    const conditions: Partial<Record<Condition, ConditionResult>> = {};
    for (const c of CONDITIONS) {
      const present: { source: Source; score: number; detail: string }[] = [];
      const q = questionnaireScores[c];
      if (q.length) present.push({ source: 'questionnaire', score: mean(q.map((x) => x.score)), detail: q.map((x) => x.label).join('; ') });

      const textKey = { depression: 'depressionLanguageScore', anxiety: 'anxietyLanguageScore', stress: 'stressLanguageScore', ocd: '' }[c];
      const t = textKey ? textScore(textKey) : null;
      if (t !== null) present.push({ source: 'text', score: t, detail: `zero-shot ${c} language signal (mean of ${textSignals.length} recent)` });

      // Facial: sadness -> depression, fear -> anxiety. Nothing for stress or OCD.
      const faceEmotion = { depression: 'sad', anxiety: 'fear', stress: '', ocd: '' }[c];
      const f = faceEmotion ? faceScore(faceEmotion) : null;
      if (f !== null) present.push({ source: 'facial', score: f, detail: `facial "${faceEmotion}" score (mean of ${faceSignals.length} recent)` });

      if (!present.length) continue;

      const total = present.reduce((sum, p) => sum + FUSION.weights[p.source], 0);
      const sources: SourceContribution[] = present.map((p) => ({
        source: p.source,
        score: round1(p.score),
        weight: round3(FUSION.weights[p.source] / total),
        detail: p.detail,
      }));
      let risk = present.reduce((sum, p) => sum + (FUSION.weights[p.source] / total) * p.score, 0);
      const hasQuestionnaire = q.length > 0;
      let capped = false;
      if (!hasQuestionnaire && risk > FUSION.noQuestionnaireCap) {
        risk = FUSION.noQuestionnaireCap;
        capped = true;
      }
      const rounded = Math.round(risk);
      conditions[c] = {
        risk: rounded,
        level: levelOf(rounded),
        confidence: hasQuestionnaire ? 'high' : 'low',
        capped,
        sources,
      };
    }

    // ---- 4. crisis: PHQ-9 item 9 or a crisis-flagged text/transcript
    const crisisSources: string[] = [];
    for (const q of inputs.questionnaires) {
      const age = now.getTime() - q.createdAt.getTime();
      if (q.type === 'PHQ9' && age >= 0 && age <= FUSION.windowMs.PHQ9 && Array.isArray(q.answers) && Number(q.answers[8]) > 0) {
        crisisSources.push('PHQ-9 item 9');
        break;
      }
    }
    if (textSignals.some((s) => s.payload?.crisisFlag === true)) crisisSources.push('crisis keywords in text or speech');
    const crisisFlag = crisisSources.length > 0;

    // ---- 5. assemble
    const reported = CONDITIONS.filter((c) => conditions[c]);
    const inputsUsed: string[] = [];
    const used = (s: Source) => reported.some((c) => conditions[c]!.sources.some((x) => x.source === s));
    if (used('questionnaire')) inputsUsed.push('questionnaire');
    if (used('text')) inputsUsed.push('text');
    if (viaVoice && used('text')) inputsUsed.push('voice');
    if (used('facial')) inputsUsed.push('facial');

    const lastVoice = voiceSignals[0]?.payload;
    const lastFace = faceSignals[0]?.payload;
    const recordedNotScored: RiskIndicator['breakdown']['recordedNotScored'] = {};
    if (lastVoice) {
      recordedNotScored.voice = {
        speakingRate: lastVoice.speakingRate,
        pauseCount: lastVoice.pauseCount,
        duration: lastVoice.duration,
        language: lastVoice.language,
      };
    }
    if (lastFace && lastFace.headPose) {
      recordedNotScored.facial = { eyeContact: !!lastFace.eyeContact, headPose: lastFace.headPose };
    }

    const confidence: 'high' | 'low' = reported.some((c) => conditions[c]!.confidence === 'low') ? 'low' : 'high';
    const risk = (c: Condition) => conditions[c]?.risk ?? null;

    return {
      depressionRisk: risk('depression'),
      anxietyRisk: risk('anxiety'),
      stressRisk: risk('stress'),
      ocdRisk: risk('ocd'),
      crisisFlag,
      confidence,
      inputsUsed,
      computedAt: now,
      breakdown: {
        method: 'rule-based weighted late fusion (not a trained model)',
        weights: FUSION.weights,
        noQuestionnaireCap: FUSION.noQuestionnaireCap,
        conditions,
        questionnairesUsed: QUESTIONNAIRE_TYPES.flatMap((t) => {
          const q = latest.get(t);
          return q ? [{ type: t, score: q.score, takenAt: q.createdAt.toISOString() }] : [];
        }),
        recordedNotScored,
        crisisSources,
        recommendations: this.recommend(reported.map((c) => conditions[c]!), crisisFlag),
      },
      disclaimer: DISCLAIMER,
    };
  }

  /**
   * Static, rule-based suggestions keyed on the risk levels. No AI involved.
   * "Book a therapist" is only suggested for questionnaire-backed risks: a
   * low-confidence number (text/face only, capped) should prompt a validated
   * questionnaire instead of a stronger push.
   */
  private recommend(results: ConditionResult[], crisis: boolean): Recommendation[] {
    const out: Recommendation[] = [];
    const anyScored = results.length > 0;
    const maxAll = results.length ? Math.max(...results.map((r) => r.risk)) : 0;
    const backed = results.filter((r) => r.confidence === 'high').map((r) => r.risk);
    const maxBacked = backed.length ? Math.max(...backed) : 0;
    const lowConfidence = results.some((r) => r.confidence === 'low');
    if (crisis) {
      out.push({
        id: 'crisis_support',
        priority: 'urgent',
        action: 'helpline',
        text: 'You may be going through a very difficult time and you are not alone. Please reach out to the Umang helpline now: 0317-4288665, or book a session with a therapist on BrainHealth.',
      });
    }
    if (maxBacked >= 50) {
      out.push({
        id: 'book_therapist',
        priority: 'high',
        action: 'book_therapist',
        text: 'Your screening results suggest it may help to talk with a professional. You can book a session with a verified therapist on BrainHealth.',
      });
    }
    if (maxAll >= 25) {
      out.push({
        id: 'cbt_exercises',
        priority: 'normal',
        action: 'cbt_exercises',
        text: 'Try a guided CBT exercise from the BrainHealth library to work on unhelpful thoughts and stress.',
      });
    }
    if (anyScored && lowConfidence) {
      out.push({
        id: 'complete_questionnaire',
        priority: 'normal',
        action: 'questionnaire',
        text: 'For a more reliable result, complete the PHQ-9, GAD-7 or DASS-21 questionnaire. Scores without a questionnaire are capped and less certain.',
      });
    }
    if (anyScored && maxAll < 25 && !crisis) {
      out.push({
        id: 'keep_tracking',
        priority: 'normal',
        text: 'Your current indicators are low. Keep up healthy routines and check in again if things change.',
      });
    }
    out.push({
      id: 'retake_later',
      priority: 'normal',
      text: 'Repeat the screening in a week or two to see how things change over time.',
    });
    return out;
  }
}
