import * as nodemailer from 'nodemailer';

import { MailService, escapeHtml } from './mail.service';

jest.mock('nodemailer');
const createTransport = nodemailer.createTransport as jest.Mock;

describe('escapeHtml', () => {
  it('neutralises markup and quotes', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    expect(escapeHtml('plain name')).toBe('plain name');
  });
});

describe('MailService', () => {
  const sendMail = jest.fn();
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue({});
    createTransport.mockReset().mockReturnValue({ sendMail });
    process.env.MAIL_USER = 'noreply@example.com';
    process.env.MAIL_PASS = 'app-password';
    delete process.env.MAIL_HOST;
    delete process.env.MAIL_PORT;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.MAIL_USER;
    delete process.env.MAIL_PASS;
    jest.restoreAllMocks();
  });

  const mail = { to: 'a@example.com', subject: 'S', html: '<p>h</p>', text: 'h' };

  it('uses the same SMTP settings as the weekly reports (Gmail defaults), with short timeouts', async () => {
    await expect(new MailService().send(mail)).resolves.toBe(true);
    const opts = createTransport.mock.calls[0][0];
    expect(opts).toMatchObject({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: 'noreply@example.com', pass: 'app-password' } });
    expect(opts.connectionTimeout).toBeLessThanOrEqual(15_000);
    expect(opts.socketTimeout).toBeLessThanOrEqual(20_000);
    expect(sendMail).toHaveBeenCalledWith({ from: '"BrainHealth" <noreply@example.com>', ...mail });
  });

  it('honours MAIL_HOST and MAIL_PORT', async () => {
    process.env.MAIL_HOST = 'smtp.example.net';
    process.env.MAIL_PORT = '2525';
    await new MailService().send(mail);
    expect(createTransport.mock.calls[0][0]).toMatchObject({ host: 'smtp.example.net', port: 2525 });
    delete process.env.MAIL_HOST;
    delete process.env.MAIL_PORT;
  });

  it('returns false (never throws) when SMTP fails', async () => {
    sendMail.mockRejectedValue(new Error('535 bad credentials'));
    await expect(new MailService().send(mail)).resolves.toBe(false);
  });

  it('returns false without trying when credentials are missing', async () => {
    delete process.env.MAIL_PASS;
    await expect(new MailService().send(mail)).resolves.toBe(false);
    expect(createTransport).not.toHaveBeenCalled();
  });
});
