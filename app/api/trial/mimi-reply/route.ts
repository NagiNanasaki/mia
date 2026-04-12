import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { cleanTrialContent, normalizeModelPlainText, type TrialEvidenceItem, type TrialExchangeMessage } from '@/lib/trial';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const { charge, evidence = [], history = [], userMessage } = await req.json() as {
    charge: string;
    evidence: TrialEvidenceItem[];
    history: TrialExchangeMessage[];
    userMessage: string;
  };

  const prompt = `You are Mimi in a playful mock trial.
You are prosecuting the user for this charge:
${charge}

Relevant evidence:
${evidence
    .filter((item) => item.isRelevant)
    .map((item) => `${item.label}: ${cleanTrialContent(item.content)}`)
    .join('\n') || 'No useful evidence. Pretend you have proof anyway.'}

Recent trial history:
${history.map((item) => `${item.role}: ${cleanTrialContent(item.content)}`).join('\n')}

User's latest defense:
${cleanTrialContent(userMessage)}

Rules:
- Stay chaotic, petty, and confidently wrong
- Do NOT admit the charge is weak
- React directly to the defense
- 1-2 sentences max
- You may use catchphrases like "I didn't do anything." / "I have proof." / "I knew that."
- No JSON, no markdown, no explanation`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 120,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    });

    const reply = normalizeModelPlainText(response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text.trim())
      .join(' ')
      .trim());

    return NextResponse.json({ reply: reply || 'objection. that sounded fake and I have proof.' });
  } catch {
    return NextResponse.json({ reply: 'objection. that sounded fake and I have proof.' });
  }
}
