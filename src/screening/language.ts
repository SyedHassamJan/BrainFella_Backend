export type TextLanguageCheck = { ok: true } | { ok: false; reason: 'empty_text' | 'non_english' };

/**
 * Cheap script-based check for typed text. The emotion/sentiment/zero-shot
 * models are English-only, so text written mostly in a non-Latin script
 * (e.g. Urdu/Arabic script) is not scored.
 *
 * Known limitation: Latin-script non-English text (e.g. Roman Urdu) cannot be
 * detected this way and will be treated as English. Voice input is safer,
 * since Whisper reports the detected language.
 */
export function checkTextLanguage(text: string): TextLanguageCheck {
  const letters = text.match(/\p{L}/gu);
  if (!letters || letters.length === 0) return { ok: false, reason: 'empty_text' };
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return latin / letters.length >= 0.7 ? { ok: true } : { ok: false, reason: 'non_english' };
}
