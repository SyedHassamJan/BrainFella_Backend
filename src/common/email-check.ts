import { BadRequestException, Logger } from '@nestjs/common';
import { promises as dns } from 'dns';

/**
 * Prototype-level check that an email address could be real, used before any
 * address is stored (sign-up, guardian link). It does NOT prove the person owns
 * the address (that needs an emailed code); it rejects the obvious fakes:
 *
 *  1. Domains containing adult or abusive words (e.g. sex.com, which does have
 *     a mail server, so check 2 alone would let it through).
 *  2. Throwaway inbox services.
 *  3. Domains with no mail server at all (no MX record), e.g. didy.com.
 *
 * A DNS failure that is not "this domain has no mail server" (offline, timeout)
 * lets the address through, so a network blip never blocks sign-up.
 */

const BLOCKED_DOMAIN_WORDS = [
  'sex',
  'porn',
  'xxx',
  'nude',
  'nsfw',
  'fuck',
  'dick',
  'pussy',
  'boob',
  'escort',
  'hentai',
  'slut',
  'whore',
];

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'sharklasers.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'tempmailo.com',
  'yopmail.com',
  'trashmail.com',
  'getnada.com',
  'dispostable.com',
  'maildrop.cc',
  'throwawaymail.com',
  'fakeinbox.com',
  'mailnesia.com',
  'emailondeck.com',
  'mohmal.com',
]);

/** DNS answers that mean "no mail can be delivered to this domain". */
const NO_MAIL_CODES = new Set(['ENOTFOUND', 'ENODATA', 'ENONAME', 'ESERVFAIL']);

export const FAKE_EMAIL_MESSAGE = 'Please use a real email address that you can receive mail at.';

type MxResolver = (domain: string) => Promise<{ exchange: string }[]>;

const logger = new Logger('EmailCheck');

export function domainOf(email: string): string {
  return email.trim().toLowerCase().split('@').pop() ?? '';
}

export function isBlockedDomain(domain: string): boolean {
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  return BLOCKED_DOMAIN_WORDS.some((w) => domain.includes(w));
}

/** Throws a 400 with a friendly message if the address is clearly not real. */
export async function assertRealisticEmail(email: string, resolveMx: MxResolver = dns.resolveMx): Promise<void> {
  const domain = domainOf(email);
  if (!domain || isBlockedDomain(domain)) throw new BadRequestException(FAKE_EMAIL_MESSAGE);

  try {
    const records = await resolveMx(domain);
    // A "null MX" (RFC 7505) is a domain explicitly saying it accepts no mail.
    if (!records.some((r) => r.exchange && r.exchange !== '.')) throw new BadRequestException(FAKE_EMAIL_MESSAGE);
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    const code = (e as NodeJS.ErrnoException).code ?? '';
    if (NO_MAIL_CODES.has(code)) throw new BadRequestException(FAKE_EMAIL_MESSAGE);
    logger.warn(`could not check mail server (${code || 'unknown error'}); allowing the address`);
  }
}
