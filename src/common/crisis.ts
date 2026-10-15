/**
 * Shared keyword-based crisis detection, used by journal, chatbot, mood
 * check-ins and screening text analysis so all channels flag the same phrases.
 *
 * Deliberately over-sensitive: a false alarm costs a gentle helpline message,
 * a miss can cost far more. It is still only keyword matching, so phrasing it
 * has never seen (or heavy misspelling) can slip through.
 */
export const CRISIS_KEYWORDS = [
  // Thoughts of self-harm or suicide
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
  // Thoughts of harming someone else
  'kill someone',
  'kill somebody',
  'kill everyone',
  'hurt someone',
  'hurt somebody',
  'want to murder',
  'going to murder',
];

/**
 * Patterns for what plain phrases miss: common misspellings ("kil", "kils"),
 * any target pronoun ("kill you", "kill them") and chat shorthand.
 * Word boundaries keep e.g. "skills" from matching. "kms" is left out on
 * purpose: it is far more often kilometres than "kill myself".
 */
export const CRISIS_PATTERNS: RegExp[] = [
  /\bkil+s?\s+(my\s*self|me|you|u|him|her|them|ur?\s*self|everyone|every\s*one)\b/,
  /\bhurt\s+(you|u|him|her|them)\b/,
  /\bkys\b/, // "kill yourself"
  // Threats of sexual or physical violence against someone ("rape you", "stab him", "beat her up")
  /\b(rape|raping|r@pe|stab|stabbing|shoot|strangle|choke|murder)\s+(you|u|him|her|them|someone|somebody|some\s*one|everyone|every\s*one|people|ur?\s*self|my\s*self|me)\b/,
  /\bbeat\s+(you|u|him|her|them|someone|somebody|everyone)\s+up\b/,
  /\b(i'?ll|i will|i am going to|i'?m going to|i am gonna|i'?m gonna|gonna|i wanna|i want to)\s+rape\b/,
];

export function containsCrisisKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS.some((kw) => lower.includes(kw)) || CRISIS_PATTERNS.some((re) => re.test(lower));
}
