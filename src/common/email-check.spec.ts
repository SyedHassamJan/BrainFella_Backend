import { BadRequestException } from '@nestjs/common';
import { assertRealisticEmail } from './email-check';

const dnsError = (code: string) => Object.assign(new Error(code), { code });
const hasMx = jest.fn().mockResolvedValue([{ exchange: 'mx.example.net', priority: 10 }]);

describe('assertRealisticEmail', () => {
  it('accepts a normal address on a domain with a mail server', async () => {
    await expect(assertRealisticEmail('diddy@google.com', hasMx)).resolves.toBeUndefined();
  });

  it('rejects a domain with no mail server (e.g. didy.com)', async () => {
    const noMx = jest.fn().mockRejectedValue(dnsError('ENODATA'));
    await expect(assertRealisticEmail('diddyloverr@didy.com', noMx)).rejects.toBeInstanceOf(BadRequestException);
    await expect(assertRealisticEmail('a@nonexistent-domain-xyz.com', jest.fn().mockRejectedValue(dnsError('ENOTFOUND')))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects adult or abusive domains even when they have a mail server (e.g. sex.com)', async () => {
    await expect(assertRealisticEmail('didiy@sex.com', hasMx)).rejects.toBeInstanceOf(BadRequestException);
    await expect(assertRealisticEmail('x@PornHub.com', hasMx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects throwaway inbox services', async () => {
    await expect(assertRealisticEmail('test@mailinator.com', hasMx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a "null MX" domain that declares it accepts no mail', async () => {
    await expect(assertRealisticEmail('a@nomail.example', jest.fn().mockResolvedValue([{ exchange: '.', priority: 0 }]))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets the address through when DNS itself is unreachable (offline / timeout)', async () => {
    await expect(assertRealisticEmail('a@gmail.com', jest.fn().mockRejectedValue(dnsError('ETIMEOUT')))).resolves.toBeUndefined();
    await expect(assertRealisticEmail('a@gmail.com', jest.fn().mockRejectedValue(dnsError('ECONNREFUSED')))).resolves.toBeUndefined();
  });
});
