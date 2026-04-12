import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { cleanTrialContent, normalizeModelPlainText, type TrialEvidenceItem, type TrialExchangeMessage } from '@/lib/trial';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const { charge, evidence = [], history = [], userQuestion } = await req.json() as {
    charge: string;
    evidence: TrialEvidenceItem[];
    history: TrialExchangeMessage[];
    userQuestion: string;
  };

  const prompt = `You are Mimi on the witness stand in a silly mock trial.
You are the DEFENDANT, accused of: ${charge}

The defense counsel (your lawyer) is asking you questions to help your case.
You want to cooperate, but you're chaotic and keep accidentally revealing suspicious details.

Evidence on file:
${evidence
    .filter((item) => item.isRelevant)
    .map((item) => `${item.label}: ${cleanTrialContent(item.content)}`)
    .join('\n') || 'No specific evidence.'}

Examination history:
${history.map((item) => `${item.role}: ${cleanTrialContent(item.content)}`).join('\n')}

Defense counsel's question:
${cleanTrialContent(userQuestion)}

Rules:
- Answer the question directly but chaotically
- You're trying to help your case, but you keep saying things that sound suspicious
- Mix in innocent details with accidentally incriminating ones
- Stay in character: "I didn't do anything" energy, but also nervous
- Occasionally reveal a detail that's actually helpful
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
