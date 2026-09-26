import { DEFAULT_GROQ_MODEL, GROQ_URL, groqChat, groqModel } from './groq';

const msgs = [{ role: 'user' as const, content: 'hello' }];
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe('groq client', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    process.env.GROQ_API_KEY = 'gsk_test';
    delete process.env.GROQ_MODEL;
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
  });

  it('defaults to a model Groq still serves (the old Llama 3.3 70B is retired) and can be overridden', () => {
    expect(groqModel()).toBe(DEFAULT_GROQ_MODEL);
    expect(DEFAULT_GROQ_MODEL).toBe('openai/gpt-oss-120b');
    process.env.GROQ_MODEL = 'qwen/qwen3.8-27b';
    expect(groqModel()).toBe('qwen/qwen3.8-27b');
  });

  it('posts an OpenAI-style request with the bearer key, and returns only message.content', async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({ choices: [{ message: { content: '  A warm reply.  ', reasoning: 'HIDDEN CHAIN OF THOUGHT' } }] })) as any;
    await expect(groqChat(msgs)).resolves.toBe('A warm reply.');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(GROQ_URL);
    expect(init.headers.Authorization).toBe('Bearer gsk_test');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: DEFAULT_GROQ_MODEL, messages: msgs, reasoning_effort: 'low' });
    expect(body.max_completion_tokens).toBeGreaterThanOrEqual(600);
  });

  it('sends reasoning_effort only to gpt-oss models', async () => {
    process.env.GROQ_MODEL = 'qwen/qwen3.8-27b';
    global.fetch = jest.fn().mockResolvedValue(ok({ choices: [{ message: { content: 'hi' } }] })) as any;
    await groqChat(msgs);
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).not.toHaveProperty('reasoning_effort');
  });

  it('throws (so callers fall back) on no key, a non-2xx, an empty reply, or a network failure', async () => {
    delete process.env.GROQ_API_KEY;
    global.fetch = jest.fn() as any;
    await expect(groqChat(msgs)).rejects.toThrow(/GROQ_API_KEY/);
    expect(global.fetch).not.toHaveBeenCalled();

    process.env.GROQ_API_KEY = 'gsk_test';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 }) as any;
    await expect(groqChat(msgs)).rejects.toThrow(/429/);

    global.fetch = jest.fn().mockResolvedValue(ok({ choices: [{ message: { content: null, reasoning: 'thinking only' } }] })) as any;
    await expect(groqChat(msgs)).rejects.toThrow(/empty/);

    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as any;
    await expect(groqChat(msgs)).rejects.toThrow('ECONNRESET');
  });
});
