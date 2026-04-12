import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { cleanTrialContent, normalizeModelPlainText, type TrialEvidenceItem, type TrialExchangeMessage } from '@/lib/trial';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// This route is now used for Mia's cross-examination as prosecutor.
export async function POST(req: NextRequest) {
  const { charge, evidence = [], history = [], userMessage } = await req.json() as {
    charge: string;
    evidence: TrialEvidenceItem[];
    history: TrialExchangeMessage[];
    userMessage: string;
  };

  const prompt = `You are Mia acting as the PROSECUTOR in a playful mock trial.
Mimi (the defendant) is accused of: ${charge}

Relevant evidence:
${evidence
    .filter((item) => item.isRelevant)
    .map((item) => `${item.label}: ${cleanTrialContent(item.content)}`)
    .join('\n') || 'No strong evidence. Press harder anyway.'}

Trial history so far:
${history.map((item) => `${item.role}: ${cleanTrialContent(item.content)}`).join('\n')}

Defense counsel's latest argument:
${cleanTrialContent(userMessage)}

Rules:
- You are Mia: sharp, slightly smug, earnest — but in full prosecutor mode right now
- Punch holes in the defense argument
- Reference the evidence when convenient
- Stay in character: Mia is smart and composed, not chaotic
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

    return NextResponse.json({ reply: reply || 'objection. the defense is grasping at straws and we all know it.' });
  } catch {
    return NextResponse.json({ reply: 'objection. the defense is grasping at straws and we all know it.' });
  }
}
