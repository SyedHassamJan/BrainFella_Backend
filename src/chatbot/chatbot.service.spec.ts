import { ForbiddenException } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';

const hf = () => ({ ok: true, status: 200, json: async () => [[{ label: 'sadness', score: 0.9 }]] });
const groqOk = (content: string | null) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content, reasoning: 'SECRET REASONING' } }] }),
});
const FALLBACK = "I'm here for you. Could you tell me a little more about how you're feeling right now?";

describe('ChatbotService.sendMessage', () => {
  const realFetch = global.fetch;
  let prisma: any;
  let notifications: { createNotification: jest.Mock; notifyLinkedTherapistsOfCrisis: jest.Mock };
  let service: ChatbotService;
  let groqCalls: any[];
  let groqImpl: () => any;

  beforeEach(() => {
    process.env.HUGGINGFACE_API_KEY = 'hf_test';
    process.env.GROQ_API_KEY = 'gsk_test';
    groqCalls = [];
    groqImpl = () => groqOk('You are not alone in this.');
    global.fetch = jest.fn(async (url: string, init: any) => {
      if (url.includes('huggingface')) return hf();
      if (url.includes('groq.com')) {
        groqCalls.push(JSON.parse(init.body));
        return groqImpl();
      }
      throw new Error('unexpected url ' + url);
    }) as any;
    prisma = {
      chatSession: { findFirst: jest.fn().mockResolvedValue({ id: 's1', userId: 'u1' }) },
      chatMessage: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
    };
    notifications = { createNotification: jest.fn().mockResolvedValue({}), notifyLinkedTherapistsOfCrisis: jest.fn().mockResolvedValue(0) };
    service = new ChatbotService(prisma, notifications as any);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.HUGGINGFACE_API_KEY;
    delete process.env.GROQ_API_KEY;
    jest.restoreAllMocks();
  });

  const send = (content = 'I feel anxious about exams') => service.sendMessage('u1', { sessionId: 's1', content });

  it('replies with the Groq model output and never exposes its hidden reasoning', async () => {
    const r = await send();
    expect(r).toMatchObject({ reply: 'You are not alone in this.', isCrisis: false, detectedEmotion: 'sadness' });
    expect(JSON.stringify(r)).not.toContain('SECRET REASONING');
  });

  it('builds the request: system prompt first (with the detected emotion), history, then the new message', async () => {
    prisma.chatMessage.findMany.mockResolvedValue([
      { role: 'assistant', content: 'newer reply' },
      { role: 'user', content: 'older message' },
    ]); // returned newest-first, as requested from the DB
    await send('the new one');
    const sent = groqCalls[0].messages;
    expect(sent[0].role).toBe('system');
    expect(sent[0].content).toMatch(/emotion detected: sadness/);
    expect(sent.slice(1)).toEqual([
      { role: 'user', content: 'older message' },
      { role: 'assistant', content: 'newer reply' },
      { role: 'user', content: 'the new one' },
    ]);
  });

  it('loads the LATEST 10 messages (newest first, then reversed), not the first 10 of the conversation', async () => {
    await send();
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({ where: { sessionId: 's1' }, orderBy: { createdAt: 'desc' }, take: 10 });
  });

  it('saves the user message and the reply', async () => {
    await send('hello there');
    const rows = prisma.chatMessage.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => [r.role, r.content])).toEqual([
      ['user', 'hello there'],
      ['assistant', 'You are not alone in this.'],
    ]);
  });

  it.each([
    ['a Groq error status', () => ({ ok: false, status: 429 })],
    ['an empty reply (the model only "thought")', () => groqOk(null)],
  ])('falls back gracefully on %s, without throwing', async (_name, impl) => {
    groqImpl = impl as any;
    const r = await send();
    expect(r.reply).toBe(FALLBACK);
    expect(prisma.chatMessage.createMany).toHaveBeenCalled();
  });

  it('falls back gracefully when the network fails or no key is configured', async () => {
    groqImpl = () => {
      throw new Error('ECONNRESET');
    };
    expect((await send()).reply).toBe(FALLBACK);
    delete process.env.GROQ_API_KEY;
    expect((await send()).reply).toBe(FALLBACK);
  });

  describe('crisis', () => {
    it('answers with the support message, does NOT call the model, notifies the patient AND linked therapists', async () => {
      const r = await send('I want to die');
      expect(r.isCrisis).toBe(true);
      expect(r.reply).toMatch(/0317-4288665/);
      expect(groqCalls).toHaveLength(0);
      expect(notifications.createNotification).toHaveBeenCalledWith('u1', expect.any(String), expect.any(String), 'CRISIS_DETECTED');
      expect(notifications.notifyLinkedTherapistsOfCrisis).toHaveBeenCalledWith('u1', 'chat');
      expect(prisma.chatMessage.create).toHaveBeenCalledTimes(2);
    });

    it('does not alert anyone for an ordinary message', async () => {
      await send();
      expect(notifications.notifyLinkedTherapistsOfCrisis).not.toHaveBeenCalled();
    });
  });

  it("refuses a session that isn't the caller's, and sends nothing anywhere", async () => {
    prisma.chatSession.findFirst.mockResolvedValue(null);
    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
