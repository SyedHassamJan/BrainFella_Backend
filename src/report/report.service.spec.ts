import * as nodemailer from 'nodemailer';

import { ReportService } from './report.service';

jest.mock('nodemailer');
const createTransport = nodemailer.createTransport as jest.Mock;

const EVIL = '<script>alert(1)</script><img src=x onerror=alert(2)><a href="https://evil.example">click</a>';

describe('ReportService weekly email: user-controlled text is HTML-escaped', () => {
  const sendMail = jest.fn();
  let prisma: any;
  let service: ReportService;

  const report = (over: object = {}) => ({
    weekStartDate: new Date('2026-09-20T00:00:00Z'),
    weekEndDate: new Date('2026-09-27T00:00:00Z'),
    totalMoodLogs: 5,
    dominantEmotion: 'sadness',
    averageMoodScore: 6.5,
    totalJournalEntries: 3,
    totalChatSessions: 2,
    exercisesCompleted: 1,
    appointmentsHeld: 0,
    crisisEventsCount: 0,
    ...over,
  });
  const send = (guardianName: string | null, patientName: string, over: object = {}) => {
    prisma.user.findUnique.mockResolvedValue({ name: patientName });
    return (service as any).sendReportEmail(report(over), { guardianEmail: 'guardian@example.com', guardianName }, 'p1');
  };
  const sent = () => sendMail.mock.calls[0][0];

  beforeEach(() => {
    process.env.MAIL_USER = 'noreply@example.com';
    process.env.MAIL_PASS = 'pw';
    sendMail.mockReset().mockResolvedValue({});
    createTransport.mockReset().mockReturnValue({ sendMail });
    prisma = { user: { findUnique: jest.fn() } };
    service = new ReportService(prisma, { createNotification: jest.fn() } as any);
  });
  afterEach(() => {
    delete process.env.MAIL_USER;
    delete process.env.MAIL_PASS;
  });

  it('a malicious PATIENT name cannot inject markup or links into the email', async () => {
    await send('Sara', EVIL);
    const { html } = sent();
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<a href');
    expect(html).toContain('&lt;script&gt;');
  });

  it('a malicious GUARDIAN name is escaped too', async () => {
    await send(EVIL, 'Aisha');
    const { html } = sent();
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('the crisis banner (which repeats the patient name) is escaped as well', async () => {
    await send('Sara', EVIL, { crisisEventsCount: 2 });
    const { html } = sent();
    expect(html).toContain('Crisis Alert');
    expect(html).not.toContain('<script>');
    expect(html.match(/&lt;script&gt;/g)!.length).toBeGreaterThanOrEqual(2); // summary line + crisis banner
  });

  it('a hostile dominant emotion value is escaped', async () => {
    await send('Sara', 'Aisha', { dominantEmotion: '<b onmouseover=x>' });
    expect(sent().html).not.toContain('<b onmouseover');
  });

  it('the subject line cannot carry line breaks (header injection)', async () => {
    await send('Sara', 'Aisha\r\nBcc: attacker@example.com');
    expect(sent().subject).not.toMatch(/[\r\n]/);
  });

  it('ordinary content is unchanged: names, counts, and the recipient', async () => {
    await send('Sara', 'Aisha Khan', { crisisEventsCount: 0 });
    const { html, to, subject } = sent();
    expect(to).toBe('guardian@example.com');
    expect(html).toContain('Dear <strong>Sara</strong>');
    expect(html).toContain('<strong>Aisha Khan</strong>');
    expect(html).toContain('sadness');
    expect(html).toContain('6.5/10');
    expect(html).not.toContain('Crisis Alert');
    expect(subject).toContain('Aisha Khan');
  });

  it('an apostrophe in a name is shown safely (O&#39;Brien), not dropped', async () => {
    await send('Sara', "Aisha O'Brien");
    expect(sent().html).toContain('Aisha O&#39;Brien');
  });

  it('falls back to "Guardian" / "Patient" when names are missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await (service as any).sendReportEmail(report(), { guardianEmail: 'g@example.com', guardianName: null }, 'p1');
    expect(sent().html).toContain('Dear <strong>Guardian</strong>');
    expect(sent().html).toContain('<strong>Patient</strong>');
  });
});
