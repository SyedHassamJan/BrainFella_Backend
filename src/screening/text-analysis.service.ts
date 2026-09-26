import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from 'src/notification/notification.service';
import { EmotionLabel } from 'src/types/enums';
import { containsCrisisKeywords } from 'src/common/crisis';
import {
  DEFAULT_EMOTION_MODEL,
  hfPost,
  parseClassification,
  parseZeroShot,
} from 'src/common/huggingface';
import { checkTextLanguage } from './language';

/**
 * Text analysis for the screening pipeline. Every model here is PRETRAINED and
 * used for inference only - nothing is trained or fine-tuned. The outputs are
 * language signals for the rule-based fusion layer: a screening result, not a
 * diagnosis or a clinical measure.
 */
const DEFAULT_SENTIMENT_MODEL = 'cardiffnlp/twitter-roberta-base-sentiment-latest';
const DEFAULT_ZEROSHOT_MODEL = 'MoritzLaurer/deberta-v3-base-zeroshot-v2.0';

// Zero-shot NLI: each hypothesis is "<template with label>", scored independently.
const ZEROSHOT_TEMPLATE = 'This person is {}.';
const ZEROSHOT_LABELS = {
  depression: 'feeling depressed, sad, or hopeless',
  anxiety: 'feeling anxious, worried, or afraid',
  stress: 'feeling stressed, overwhelmed, or under pressure',
} as const;

const MAX_MODEL_CHARS = 2000; // ~500 tokens; longer input is truncated for the models only

const NOTE =
  'Language signals from pretrained models (emotion, sentiment, zero-shot NLI); a screening result, not a diagnosis or clinical measure.';

export const CRISIS_SUPPORT =
  'We noticed you may be going through a very difficult time. You are not alone — please reach out to the Umang helpline now: 0317-4288665, or book a session with a therapist on BrainHealth.';

export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface TextAnalysisResult {
  /** True if at least one model signal was produced. */
  available: boolean;
  reason?: 'non_english' | 'empty_text' | 'model_unavailable';
  sentiment: { label: Sentiment; score: number } | null;
  emotionalTone: { emotion: EmotionLabel; score: number; scores: Record<string, number> } | null;
  // 0-1 zero-shot scores; null when unavailable (never a fake neutral value).
  depressionLanguageScore: number | null;
  anxietyLanguageScore: number | null;
  stressLanguageScore: number | null;
  /** Signals whose model call failed, so callers can tell "low" from "missing". */
  unavailableSignals: string[];
  crisisFlag: boolean;
  crisisSupport?: string;
  models: Record<string, string>;
  note: string;
}

@Injectable()
export class TextAnalysisService {
  private readonly logger = new Logger(TextAnalysisService.name);

  constructor(private readonly notificationService: NotificationService) {}

  private models() {
    return {
      emotion: process.env.HF_EMOTION_MODEL || DEFAULT_EMOTION_MODEL,
      sentiment: process.env.HF_SENTIMENT_MODEL || DEFAULT_SENTIMENT_MODEL,
      languageSignals: process.env.HF_ZEROSHOT_MODEL || DEFAULT_ZEROSHOT_MODEL,
    };
  }

  /**
   * @param language ISO code if known (voice: detected by Whisper). Anything
   * other than "en" skips model scoring. Omit for typed text: a script check
   * is used instead.
   */
  async analyze(userId: string, text: string, language?: string): Promise<TextAnalysisResult> {
    const models = this.models();
    const base = {
      sentiment: null,
      emotionalTone: null,
      depressionLanguageScore: null,
      anxietyLanguageScore: null,
      stressLanguageScore: null,
      unavailableSignals: [] as string[],
      models,
      note: NOTE,
    };

    // Safety first: keyword crisis check runs on any text, whatever the language
    // or model availability (same list/notification as journal and chatbot).
    const crisisFlag = containsCrisisKeywords(text);
    if (crisisFlag) {
      await this.notificationService.createNotification(
        userId,
        'Crisis Detected',
        'We noticed you may be going through a very difficult time. Please reach out to our helpline: Umang 0317-4288665 or book a session with a therapist.',
        'CRISIS_DETECTED',
      );
    }
    const crisis = crisisFlag ? { crisisFlag, crisisSupport: CRISIS_SUPPORT } : { crisisFlag };

    // The models are English-only: transcribe/keep the text, but don't score it.
    if (language && language !== 'en') {
      return { ...base, ...crisis, available: false, reason: 'non_english' };
    }
    const check = checkTextLanguage(text);
    if (!check.ok) {
      return { ...base, ...crisis, available: false, reason: check.reason };
    }

    const input = text.slice(0, MAX_MODEL_CHARS);
    const [emotionRes, sentimentRes, zeroShotRes] = await Promise.allSettled([
      hfPost(models.emotion, { inputs: input }),
      hfPost(models.sentiment, { inputs: input }),
      hfPost(models.languageSignals, {
        inputs: input,
        parameters: {
          candidate_labels: Object.values(ZEROSHOT_LABELS),
          hypothesis_template: ZEROSHOT_TEMPLATE,
          multi_label: true,
        },
      }),
    ]);

    const result: TextAnalysisResult = { ...base, ...crisis, available: false };

    if (emotionRes.status === 'fulfilled') {
      const rows = parseClassification(emotionRes.value);
      const valid = Object.values(EmotionLabel) as string[];
      const scores: Record<string, number> = {};
      for (const r of rows) {
        const label = r.label.toLowerCase();
        if (valid.includes(label)) scores[label] = round(r.score);
      }
      const top = rows.find((r) => valid.includes(r.label.toLowerCase()));
      if (top) {
        result.emotionalTone = {
          emotion: top.label.toLowerCase() as EmotionLabel,
          score: round(top.score),
          scores,
        };
      }
    }
    if (!result.emotionalTone) this.markFailed(result, 'emotionalTone', emotionRes);

    if (sentimentRes.status === 'fulfilled') {
      const top = parseClassification(sentimentRes.value)[0];
      const label = top?.label.toLowerCase();
      if (top && (label === 'positive' || label === 'neutral' || label === 'negative')) {
        result.sentiment = { label, score: round(top.score) };
      }
    }
    if (!result.sentiment) this.markFailed(result, 'sentiment', sentimentRes);

    const zs = zeroShotRes.status === 'fulfilled' ? parseZeroShot(zeroShotRes.value) : {};
    const pick = (key: keyof typeof ZEROSHOT_LABELS) => {
      const v = zs[ZEROSHOT_LABELS[key]];
      return typeof v === 'number' ? round(v) : null;
    };
    result.depressionLanguageScore = pick('depression');
    result.anxietyLanguageScore = pick('anxiety');
    result.stressLanguageScore = pick('stress');
    if (result.depressionLanguageScore === null) {
      this.markFailed(result, 'languageSignals', zeroShotRes);
    }

    result.available =
      !!result.emotionalTone ||
      !!result.sentiment ||
      result.depressionLanguageScore !== null;
    if (!result.available) result.reason = 'model_unavailable';
    return result;
  }

  private markFailed(
    result: TextAnalysisResult,
    signal: string,
    settled: PromiseSettledResult<unknown>,
  ) {
    result.unavailableSignals.push(signal);
    // Log the failure (never the text) so a bad token/endpoint is visible.
    const why = settled.status === 'rejected' ? String(settled.reason?.message ?? settled.reason) : 'unexpected response shape';
    this.logger.warn(`text-analysis signal "${signal}" unavailable: ${why}`);
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;
