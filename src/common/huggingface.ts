/**
 * Hugging Face Inference helpers (pretrained-model inference only).
 *
 * The old `api-inference.huggingface.co` host no longer exists; serverless
 * models are reached through the Inference Providers router.
 */
export const HF_ROUTER_BASE = 'https://router.huggingface.co/hf-inference/models';

export const DEFAULT_EMOTION_MODEL = 'j-hartmann/emotion-english-distilroberta-base';

export const hfModelUrl = (model: string) => `${HF_ROUTER_BASE}/${model}`;

export class HfError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** POST a JSON payload to a hosted model. Throws HfError on any non-2xx. */
export async function hfPost(
  model: string,
  payload: unknown,
  timeoutMs = 30000,
): Promise<unknown> {
  const key = process.env.HUGGINGFACE_API_KEY;
  if (!key) throw new HfError(0, 'HUGGINGFACE_API_KEY is not set');
  const res = await fetch(hfModelUrl(model), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // Block until a cold model has loaded instead of failing with 503.
      'x-wait-for-model': 'true',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new HfError(res.status, `HuggingFace ${model} responded ${res.status}`);
  return res.json();
}

export interface LabelScore {
  label: string;
  score: number;
}

/**
 * Text-classification output, highest score first. Accepts both the nested
 * `[[{label, score}, ...]]` and flat `[{label, score}, ...]` shapes.
 */
export function parseClassification(data: unknown): LabelScore[] {
  const rows = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : data;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(
      (r): r is LabelScore =>
        !!r && typeof r.label === 'string' && typeof r.score === 'number',
    )
    .map((r) => ({ label: r.label, score: r.score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Zero-shot output as label -> score. Accepts `[{label, score}, ...]` and the
 * older `{labels: [...], scores: [...]}` shape.
 */
export function parseZeroShot(data: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const legacy = Array.isArray(data) ? data[0] : data;
  if (
    legacy &&
    !Array.isArray(legacy) &&
    Array.isArray((legacy as any).labels) &&
    Array.isArray((legacy as any).scores)
  ) {
    const { labels, scores } = legacy as { labels: string[]; scores: number[] };
    labels.forEach((l, i) => {
      if (typeof scores[i] === 'number') out[l] = scores[i];
    });
    return out;
  }
  for (const { label, score } of parseClassification(data)) out[label] = score;
  return out;
}

const EMOTIONS = ['joy', 'sadness', 'anger', 'fear', 'disgust', 'surprise', 'neutral'] as const;
export type DetectedEmotion = { emotion: (typeof EMOTIONS)[number]; score: number };

/**
 * The dominant emotion of a short text, or null if the model is unavailable or
 * returns an unknown label. Never fakes a "neutral" result. Short timeout: it
 * runs inside a user's request (e.g. saving a mood check-in).
 */
export async function detectTextEmotion(text: string, timeoutMs = 8000): Promise<DetectedEmotion | null> {
  try {
    const top = parseClassification(
      await hfPost(process.env.HF_EMOTION_MODEL || DEFAULT_EMOTION_MODEL, { inputs: text }, timeoutMs),
    )[0];
    const label = top?.label.toLowerCase();
    return top && (EMOTIONS as readonly string[]).includes(label!) ? { emotion: label as DetectedEmotion['emotion'], score: top.score } : null;
  } catch {
    return null;
  }
}
