import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { cleanTrialContent, DEFAULT_TRIAL_CHARGES, normalizeModelPlainText, type TrialHistoryMessage } from '@/lib/trial';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const { recentMessages = [] } = await req.json() as { recentMessages?: TrialHistoryMessage[] };

  const cleanedMessages: TrialHistoryMessage[] = recentMessages
    .map((message) => ({
      role: (message.role === 'user' ? 'user' : 'assistant') as TrialHistoryMessage['role'],
      content: cleanTrialContent(message.content),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-10);

  const fallbackCharge = DEFAULT_TRIAL_CHARGES[Math.floor(Math.random() * DEFAULT_TRIAL_CHARGES.length)];

  if (cleanedMessages.length < 3) {
    return NextResponse.json({ charge: fallbackCharge });
  }

  const prompt = `You are setting up a ridiculous "mock trial" in a teen chat app.
Mimi (14, chaotic, always denying everything) is the DEFENDANT.
Mia (13, sharp, slightly smug) is the PROSECUTOR.

Generate ONE funny charge — what Mimi is accused of doing.

Rules:
- Tone: playful, petty, dramatic
- The charge must be something Mimi would absolutely deny doing
- Base it loosely on the conversation when possible
- Output valid JSON only: { "charge": "string" }

Recent messages:
${cleanedMessages.map((message) => `${message.role}: ${message.content}`).join('\n')}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 100,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? text) as { charge?: string };

    return NextResponse.json({
      charge: typeof parsed.charge === 'string' && parsed.charge.trim()
        ? normalizeModelPlainText(parsed.charge.trim())
        : fallbackCharge,
    });
  } catch {
    return NextResponse.json({ charge: fallbackCharge });
  }
}
