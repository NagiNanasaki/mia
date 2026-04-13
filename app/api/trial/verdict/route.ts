import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { cleanTrialContent, normalizeModelPlainText, parseVerdictOutcome } from '@/lib/trial';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const { charge, userQuestions = [], mimiAnswers = [], miaReactions = [] } = await req.json() as {
    charge: string;
    userQuestions: string[];
    mimiAnswers: string[];
    miaReactions: string[];
  };

  const examination = userQuestions.map((q, i) => [
    `Defense: ${cleanTrialContent(q)}`,
    mimiAnswers[i] ? `Mimi: ${cleanTrialContent(mimiAnswers[i])}` : null,
    miaReactions[i] ? `Prosecution: ${cleanTrialContent(miaReactions[i])}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');

  const prompt = `You are the Honourable Judge presiding over a silly mock trial.
Mimi (the defendant) is accused of: ${charge}

Examination transcript:
${examination || 'No examination was conducted.'}

Rules:
- You are the Judge: authoritative, dry, slightly absurd sense of humour
- Weigh Mimi's testimony against the charge
- Decide: guilty / not guilty / case dismissed
- Include the exact phrase "guilty", "not guilty", or "case dismissed" in your verdict
- 2-3 sentences max, delivered with gravitas
- No JSON, no markdown`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 150,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }],
    });

    const verdict = normalizeModelPlainText(response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text.trim())
      .join(' ')
      .trim());

    const safeVerdict = verdict || 'case dismissed. The testimony was chaotic. The court needs a break.';
    return NextResponse.json({ verdict: safeVerdict, outcome: parseVerdictOutcome(safeVerdict) });
  } catch {
    const verdict = 'case dismissed. The testimony was chaotic. The court needs a break.';
    return NextResponse.json({ verdict, outcome: parseVerdictOutcome(verdict) });
  }
}
