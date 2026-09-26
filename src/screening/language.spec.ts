import { checkTextLanguage } from './language';

describe('checkTextLanguage', () => {
  it('accepts English text', () => {
    expect(checkTextLanguage('I have been feeling tired this week.')).toEqual({ ok: true });
  });
  it('rejects Urdu-script text as non-English', () => {
    expect(checkTextLanguage('مجھے بہت تھکاوٹ محسوس ہو رہی ہے')).toEqual({
      ok: false,
      reason: 'non_english',
    });
  });
  it('rejects text with no letters', () => {
    expect(checkTextLanguage('1234 ... !!!')).toEqual({ ok: false, reason: 'empty_text' });
  });
  it('tolerates a few non-Latin characters in mostly-English text', () => {
    expect(checkTextLanguage('I feel fine today ✓ شکریہ').ok).toBe(true);
  });
  it('known limitation: Roman Urdu passes as English', () => {
    expect(checkTextLanguage('mujhe bohat thakawat mehsoos ho rahi hai').ok).toBe(true);
  });
});
