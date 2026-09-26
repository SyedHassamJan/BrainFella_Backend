/**
 * Shared keyword-based crisis detection, used by journal, chatbot and
 * screening text analysis so all channels flag the same phrases.
 */
export const CRISIS_KEYWORDS = [
  'suicide',
  'kill myself',
  'end my life',
  'want to die',
  'self harm',
  'cut myself',
  'hurt myself',
  'no reason to live',
  'hopeless',
  'worthless',
];

export function containsCrisisKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS.some((kw) => lower.includes(kw));
}
