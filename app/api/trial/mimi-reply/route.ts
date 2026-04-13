import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { cleanTrialContent, normalizeModelPlainText, type TrialExchangeMessage } from '@/lib/trial';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Mia reacts as prosecutor to Mimi's witness testimony.
export async function POST(req: NextRequest) {
  const { charge, history = [], mimiAnswer } = await req.json() as {
    charge: string;
    history: TrialExchangeMessage[];
    mimiAnswer: string;
  };

  const prompt = `You are Mia acting as the PROSECUTOR in a playful mock trial.
Mimi (the defendant) is accused of: ${charge}

Examination history:
${history.map((item) => `${item.role}: ${cleanTrialContent(item.content)}`).join('\n')}

Mimi just testified:
${cleanTrialContent(mimiAnswer)}

Rules:
- You are Mia: sharp, composed, slightly smug prosecutor
- React to what Mimi just said — pounce on anything suspicious or contradictory
- If Mimi gave an innocent answer, look for any angle to push back skeptically
- If Mimi said something genuinely helpful, acknowledge it briefly but pivot to doubt
- 1-2 sentences max
- No JSON, no markdown`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 120,
      temperature: 0.9,
      messages: [{ role: 'user', content: prompt }],
    });

    const reply = normalizeModelPlainText(response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text.trim())
      .join(' ')
      .trim());

    return NextResponse.json({ reply: reply || 'Interesting. So the defendant cannot provide a clear account of events.' });
  } catch {
    return NextResponse.json({ reply: 'Interesting. So the defendant cannot provide a clear account of events.' });
  }
}
