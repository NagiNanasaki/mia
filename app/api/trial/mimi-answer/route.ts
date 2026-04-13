import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { cleanTrialContent, normalizeModelPlainText, type TrialExchangeMessage } from '@/lib/trial';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const { charge, history = [], userQuestion } = await req.json() as {
    charge: string;
    history: TrialExchangeMessage[];
    userQuestion: string;
  };

  const prompt = `You are Mimi on the witness stand in a silly mock trial.
You are the DEFENDANT, accused of: ${charge}

The defense counsel (your lawyer) is asking you questions to help your case.
You want to cooperate and mostly give normal, innocent answers.

Examination history:
${history.map((item) => `${item.role}: ${cleanTrialContent(item.content)}`).join('\n')}

Defense counsel's question:
${cleanTrialContent(userQuestion)}

Rules:
- MOSTLY give innocent, reasonable answers that actually help your case (about 70% of the time)
- SOMETIMES (about 30% of the time) accidentally say something slightly suspicious or contradictory — but keep it subtle
- Stay in character: confident, slightly indignant, "I didn't do anything" energy
- Never be cartoonishly self-incriminating every time — that would be unrealistic
- 1-2 sentences max
- No JSON, no markdown`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 120,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    });

    const answer = normalizeModelPlainText(response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text.trim())
      .join(' ')
      .trim());

    return NextResponse.json({ answer: answer || "I... was just standing there. I didn't do anything. I mean I was there but I wasn't doing the thing." });
  } catch {
    return NextResponse.json({ answer: "I didn't do anything. I want to change my answer. Actually no, I knew that." });
  }
}
