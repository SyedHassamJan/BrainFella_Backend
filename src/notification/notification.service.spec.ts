import { NotificationService, THERAPIST_ALERT_WINDOW_MS } from './notification.service';

describe('NotificationService.notifyLinkedTherapistsOfCrisis', () => {
  let prisma: any;
  let mail: { send: jest.Mock };
  let service: NotificationService;
  const NOW = new Date('2026-09-27T12:00:00Z');
  const flush = () => new Promise((r) => setImmediate(r)); // the alert email is fire-and-forget

  beforeEach(() => {
    prisma = {
      appointment: { findMany: jest.fn().mockResolvedValue([{ therapistId: 't1' }, { therapistId: 't2' }]) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Aisha Khan' }),
        findMany: jest.fn().mockResolvedValue([
          { id: 't1', name: 'Dr One', email: 'one@example.com' },
          { id: 't2', name: 'Dr Two', email: 'two@example.com' },
        ]),
      },
      notification: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    mail = { send: jest.fn().mockResolvedValue(true) };
    service = new NotificationService(prisma, mail as any);
    delete process.env.CRISIS_EMAIL_ALERTS;
  });

  const created = () => prisma.notification.create.mock.calls.map((c: any) => c[0].data);

  it('alerts every distinct linked therapist, naming the patient and the kind of input', async () => {
    await expect(service.notifyLinkedTherapistsOfCrisis('p1', 'journal', NOW)).resolves.toBe(2);
    const rows = created();
    expect(rows.map((r: any) => r.userId).sort()).toEqual(['t1', 't2']);
    for (const r of rows) {
      expect(r).toMatchObject({ type: 'CRISIS_ALERT', relatedUserId: 'p1', title: 'A patient may need support' });
      expect(r.message).toContain('Aisha Khan');
      expect(r.message).toContain('a journal entry');
    }
  });

  it('only counts therapists with a CONFIRMED or COMPLETED appointment (not PENDING or CANCELLED)', async () => {
    await service.notifyLinkedTherapistsOfCrisis('p1', 'chat', NOW);
    const where = prisma.appointment.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ patientId: 'p1', status: { in: ['CONFIRMED', 'COMPLETED'] } });
  });

  it('does nothing when the patient has no linked therapist', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);
    await expect(service.notifyLinkedTherapistsOfCrisis('p1', 'chat', NOW)).resolves.toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('does not repeat an alert for the same patient within the window, but still alerts other therapists', async () => {
    prisma.notification.findFirst.mockImplementation(async ({ where }: any) => (where.userId === 't1' ? { id: 'existing' } : null));
    await expect(service.notifyLinkedTherapistsOfCrisis('p1', 'chat', NOW)).resolves.toBe(1);
    expect(created().map((r: any) => r.userId)).toEqual(['t2']);
    const q = prisma.notification.findFirst.mock.calls[0][0].where;
    expect(q).toMatchObject({ type: 'CRISIS_ALERT', relatedUserId: 'p1' });
    expect(NOW.getTime() - q.createdAt.gte.getTime()).toBe(THERAPIST_ALERT_WINDOW_MS);
  });

  it('words the source for each kind of input', async () => {
    const texts: Record<string, string> = { journal: 'a journal entry', chat: 'a chat message', screening: 'a screening input', questionnaire: 'a questionnaire answer' };
    for (const [source, label] of Object.entries(texts)) {
      prisma.notification.create.mockClear();
      await service.notifyLinkedTherapistsOfCrisis('p1', source as any, NOW);
      expect(created()[0].message).toContain(label);
    }
  });

  it('never shares what the patient wrote (the alert has no content field, only name + source)', async () => {
    await service.notifyLinkedTherapistsOfCrisis('p1', 'journal', NOW);
    expect(Object.keys(created()[0]).sort()).toEqual(['message', 'relatedUserId', 'title', 'type', 'userId']);
  });

  it('falls back to a neutral name if the patient row is missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await service.notifyLinkedTherapistsOfCrisis('p1', 'chat', NOW);
    expect(created()[0].message).toContain('One of your patients');
  });

  it("never throws: a failure must not break the patient's own request", async () => {
    prisma.appointment.findMany.mockRejectedValue(new Error('db down'));
    await expect(service.notifyLinkedTherapistsOfCrisis('p1', 'chat', NOW)).resolves.toBe(0);
  });

  describe('email alerts', () => {
    it('emails each therapist that was alerted, and the patient request does not wait on it', async () => {
      await service.notifyLinkedTherapistsOfCrisis('p1', 'chat', NOW);
      await flush();
      expect(mail.send.mock.calls.map((c) => c[0].to).sort()).toEqual(['one@example.com', 'two@example.com']);
    });

    it('is minimal: no patient name in the subject, no content, a link to the notifications page, and the helpline', async () => {
      await service.notifyLinkedTherapistsOfCrisis('p1', 'journal', NOW);
      await flush();
      const { subject, html, text } = mail.send.mock.calls[0][0];
      expect(subject).toBe('BrainHealth: a patient may need support');
      expect(subject).not.toContain('Aisha');
      for (const body of [html, text]) {
        expect(body).toContain('Aisha Khan');
        expect(body).toContain('a journal entry');
        expect(body).toContain('/notifications');
        expect(body).toContain('0317-4288665');
      }
      expect(text).toContain('does not include what they wrote');
    });

    it('escapes a malicious patient name in the HTML email (names are user-controlled)', async () => {
      prisma.user.findUnique.mockResolvedValue({ name: '<script>alert(1)</script><img src=x onerror=1>' });
      await service.notifyLinkedTherapistsOfCrisis('p1', 'chat', NOW);
      await flush();
      const { html } = mail.send.mock.calls[0][0];
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;script&gt;');
    });

    it('does not email a therapist who was skipped by the de-dupe window', async () => {
      prisma.notification.findFirst.mockImplementation(async ({ where }: any) => (where.userId === 't1' ? { id: 'x' } : null));
      await service.notifyLinkedTherapistsOfCrisis('p1', 'chat', NOW);
      await flush();
      expect(mail.send.mock.calls.map((c) => c[0].to)).toEqual(['two@example.com']);
    });

    it('a failing mail server never affects the alert, the count, or the caller', async () => {
      mail.send.mockRejectedValue(new Error('smtp down'));
      await expect(service.notifyLinkedTherapistsOfCrisis('p1', 'chat', NOW)).resolves.toBe(2);
      await flush();
      expect(created()).toHaveLength(2); // the in-app alerts still exist
    });

    it('can be switched off with CRISIS_EMAIL_ALERTS=false (in-app alerts continue)', async () => {
      process.env.CRISIS_EMAIL_ALERTS = 'false';
      await expect(service.notifyLinkedTherapistsOfCrisis('p1', 'chat', NOW)).resolves.toBe(2);
      await flush();
      expect(mail.send).not.toHaveBeenCalled();
      delete process.env.CRISIS_EMAIL_ALERTS;
    });

    it('skips a therapist with no email address, without error', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 't1', name: 'Dr One', email: '' },
        { id: 't2', name: 'Dr Two', email: 'two@example.com' },
      ]);
      await service.notifyLinkedTherapistsOfCrisis('p1', 'chat', NOW);
      await flush();
      expect(mail.send.mock.calls.map((c) => c[0].to)).toEqual(['two@example.com']);
    });

    it('sends nothing when the patient has no linked therapist', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);
      await service.notifyLinkedTherapistsOfCrisis('p1', 'chat', NOW);
      await flush();
      expect(mail.send).not.toHaveBeenCalled();
    });
  });
});

describe('NotificationService.createNotification', () => {
  it('stores relatedUserId only when given', async () => {
    const prisma: any = { notification: { create: jest.fn().mockResolvedValue({}) } };
    const service = new NotificationService(prisma, { send: jest.fn() } as any);
    await service.createNotification('u1', 't', 'm', 'X');
    expect(prisma.notification.create.mock.calls[0][0].data).toEqual({ userId: 'u1', title: 't', message: 'm', type: 'X' });
    await service.createNotification('u1', 't', 'm', 'X', 'p9');
    expect(prisma.notification.create.mock.calls[1][0].data.relatedUserId).toBe('p9');
  });
});
