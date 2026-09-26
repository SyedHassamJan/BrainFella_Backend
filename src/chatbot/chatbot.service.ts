import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationService } from 'src/notification/notification.service';
import { SendMessageDto } from './dto/send-message.dto';
import { EmotionLabel } from 'src/types/enums';
import { containsCrisisKeywords } from 'src/common/crisis';
import {
  DEFAULT_EMOTION_MODEL,
  hfModelUrl,
  parseClassification,
} from 'src/common/huggingface';

const CRISIS_RESPONSE =
  "🚨 I can sense you're going through something very serious. Your life matters deeply. Please reach out to the Umang helpline right now: **0317-4288665**. You can also book a session with one of our therapists on BrainHealth. You are not alone. 💙";

@Injectable()
export class ChatbotService {
  private anthropic: Anthropic;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {
    this.anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
  }

  async startSession(userId: string) {
    return this.prisma.chatSession.create({
      data: { userId, title: `Session ${new Date().toLocaleDateString()}` },
    });
  }

  async getMySessions(userId: string) {
    return this.prisma.chatSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // FIX 1 — Use findFirst with combined id+userId for atomic ownership check
  async getSession(sessionId: string, userId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) throw new ForbiddenException('Access denied or session not found');
    return session;
  }

  // FIX 1 — Use findFirst with combined id+userId for atomic ownership check
  async deleteSession(sessionId: string, userId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new ForbiddenException('Access denied or session not found');
    return this.prisma.chatSession.delete({ where: { id: sessionId } });
  }

  async sendMessage(userId: string, dto: SendMessageDto) {
    // FIX 1 — Verify session belongs to user atomically
    const session = await this.prisma.chatSession.findFirst({
      where: { id: dto.sessionId, userId },
    });
    if (!session) throw new ForbiddenException('Access denied or session not found');

    // 1. Detect emotion via HuggingFace (FIX 4 hardened version)
    const { emotion, score } = await this.detectEmotion(dto.content);

    // 2. Check crisis keywords
    const isCrisis = this.checkCrisis(dto.content);

    if (isCrisis) {
      // Save crisis user message
      await this.prisma.chatMessage.create({
        data: {
          sessionId: dto.sessionId,
          role: 'user',
          content: dto.content,
          detectedEmotion: emotion,
          emotionScore: score,
          isCrisis: true,
        },
      });
      // Save crisis assistant response
      await this.prisma.chatMessage.create({
        data: {
          sessionId: dto.sessionId,
          role: 'assistant',
          content: CRISIS_RESPONSE,
          isCrisis: true,
        },
      });
      // Notify user
      await this.notificationService.createNotification(
        userId,
        '🚨 Crisis Support',
        'We noticed you may be in crisis. Please call Umang: 0317-4288665 or book a therapist session.',
        'CRISIS_DETECTED',
      );
      return {
        reply: CRISIS_RESPONSE,
        detectedEmotion: emotion,
        emotionScore: score,
        isCrisis: true,
      };
    }

    // 3. Get conversation history for context (last 10 messages)
    const history = await this.prisma.chatMessage.findMany({
      where: { sessionId: dto.sessionId },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    // 4. Call Claude Haiku via SDK (FIX 5 — already using SDK correctly)
    const systemPrompt = `You are BrainHealth's compassionate AI mental health companion designed for Pakistani students and young adults.

Current user emotion detected: ${emotion} (confidence: ${Math.round(score * 100)}%)

Guidelines:
- Be warm, empathetic, and non-judgmental
- Suggest relevant CBT (Cognitive Behavioral Therapy) techniques when appropriate
- NEVER diagnose mental health conditions
- If the user seems distressed or anxious, gently suggest booking a session with a verified therapist on the BrainHealth platform
- Respond in a conversational, supportive tone
- Keep responses concise (3-4 sentences max)
- If user mentions crisis thoughts: immediately share the Umang helpline: 0317-4288665
- You support: anxiety, stress, depression, academic pressure, relationship issues, and general mental wellness`;

    const messages = history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    messages.push({ role: 'user', content: dto.content });

    let aiReply =
      "I'm here for you. Could you tell me a little more about how you're feeling right now?";

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages,
      });
      aiReply =
        response.content[0].type === 'text'
          ? response.content[0].text
          : aiReply;
    } catch (err) {
      // Graceful fallback — Claude down should never crash the endpoint
      console.error('Claude API error:', err);
    }

    // 5. Save both messages to DB
    await this.prisma.chatMessage.createMany({
      data: [
        {
          sessionId: dto.sessionId,
          role: 'user',
          content: dto.content,
          detectedEmotion: emotion,
          emotionScore: score,
          isCrisis: false,
        },
        {
          sessionId: dto.sessionId,
          role: 'assistant',
          content: aiReply,
        },
      ],
    });

    return { reply: aiReply, detectedEmotion: emotion, emotionScore: score, isCrisis: false };
  }

  // FIX 4 — Hardened HuggingFace detection with response.ok + 503 + shape validation
  private async detectEmotion(
    text: string,
  ): Promise<{ emotion: EmotionLabel; score: number }> {
    try {
      const response = await fetch(
        hfModelUrl(process.env.HF_EMOTION_MODEL || DEFAULT_EMOTION_MODEL),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: text }),
        },
      );

      // HuggingFace cold start — model loading takes ~20s on first request
      if (response.status === 503) {
        console.warn('HuggingFace model loading, using fallback emotion');
        return { emotion: EmotionLabel.neutral, score: 0.5 };
      }

      if (!response.ok) {
        console.error(`HuggingFace API error: ${response.status}`);
        return { emotion: EmotionLabel.neutral, score: 0.5 };
      }

      // Accepts both [[{label, score}, ...]] and [{label, score}, ...]
      const top = parseClassification(await response.json())[0];
      if (!top) {
        return { emotion: EmotionLabel.neutral, score: 0.5 };
      }

      const emotionLabel = top.label.toLowerCase() as EmotionLabel;

      // Validate returned label is in our known enum
      const validEmotions = Object.values(EmotionLabel) as string[];
      const safeEmotion = validEmotions.includes(emotionLabel)
        ? emotionLabel
        : EmotionLabel.neutral;

      return { emotion: safeEmotion, score: top.score };
    } catch {
      return { emotion: EmotionLabel.neutral, score: 0 };
    }
  }

  private checkCrisis(text: string): boolean {
    return containsCrisisKeywords(text);
  }
}
