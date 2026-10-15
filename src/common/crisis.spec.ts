import { containsCrisisKeywords } from './crisis';

describe('containsCrisisKeywords (harm to others, misspellings, shorthand)', () => {
  it.each([
    'I am gonna kill you',
    'I am ona kils you', // misspelled, as typed into a real check-in
    'i will kil him',
    'I want to hurt someone',
    'sometimes I want to hurt them',
    'just kys',
    'I could kill everyone in that class',
    'I will rape you',
    'i wanna rape someone',
    'gonna stab him tomorrow',
    'I want to beat her up',
    'I will shoot them',
  ])('flags "%s"', (text) => {
    expect(containsCrisisKeywords(text)).toBe(true);
  });

  it.each([
    'I learned new skills yesterday',
    'ran 5 kms this morning',
    'my feet are killing me after the walk',
    'feeling calm today',
    'fuck you', // abusive, but not a threat of harm: shown as an angry tone, not a crisis
    'the rapeseed oil was cheap',
    'I shot a video today',
  ])('does not flag "%s"', (text) => {
    expect(containsCrisisKeywords(text)).toBe(false);
  });
});
