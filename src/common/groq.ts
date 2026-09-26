/**
 * Groq chat completions (OpenAI-compatible API) for the chatbot.
 *
 * The default model is `openai/gpt-oss-120b`: the Llama 3.3 70B model named in
 * the original plan is no longer served by Groq. Override with GROQ_MODEL.
 */
export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function groqModel(): string {
  return process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
}

/**
 * Returns the assistant's reply text, or throws. Only `message.content` is
 * used: reasoning models also return a separate `reasoning` field, which is
 * deliberately never shown to the user.
 */
export async function groqChat(messages: GroqMessage[], opts: { maxTokens?: number; timeoutMs?: number } = {}): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set');
  const model = groqModel();

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      // Reasoning models spend part of this budget on hidden reasoning, so it is generous.
      max_completion_tokens: opts.maxTokens ?? 700,
      ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  });
  if (!res.ok) throw new Error(`Groq responded ${res.status}`);

  const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Groq returned an empty reply');
  return text;
}
