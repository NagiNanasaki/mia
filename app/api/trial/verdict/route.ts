import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { cleanTrialContent, normalizeModelPlainText, parseVerdictOutcome, type TrialEvidenceItem } from '@/lib/trial';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const { charge, evidence = [], userDefense = [], miaReplies = [] } = await req.json() as {
    charge: string;
    evidence: TrialEvidenceItem[];
    userDefense: string[];
    miaReplies: string[];
  };

  const prompt = `You are the Honourable Judge presiding over a silly mock trial.
Mimi (the defendant) is accused of: ${charge}

Evidence submitted:
${evidence.map((item) => `${item.label}: ${cleanTrialContent(item.content)}${item.isRelevant ? ' [relevant]' : ''}`).join('\n')}

Defense arguments (by the user as defense counsel):
${userDefense.map((d, i) => `${i + 1}. ${cleanTrialContent(d)}`).join('\n') || 'No defense provided.'}

Prosecution rebuttals (by Mia):
${miaReplies.map((r, i) => `${i + 1}. ${cleanTrialContent(r)}`).join('\n') || 'No prosecution rebuttal.'}

Rules:
- You are the Judge: authoritative, dry, slightly absurd sense of humour
- Weigh the defense against the prosecution
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

    const safeVerdict = verdict || 'case dismissed. The prosecution was enthusiastic. The evidence was not.';
    return NextResponse.json({
      verdict: safeVerdict,
      outcome: parseVerdictOutcome(safeVerdict),
    });
  } catch {
    const verdict = 'case dismissed. The prosecution was enthusiastic. The evidence was not.';
    return NextResponse.json({ verdict, outcome: parseVerdictOutcome(verdict) });
  }
}
