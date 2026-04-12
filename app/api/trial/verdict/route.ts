import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { cleanTrialContent, normalizeModelPlainText, parseVerdictOutcome, type TrialEvidenceItem } from '@/lib/trial';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const { charge, evidence = [], userDefense = [], mimiReplies = [] } = await req.json() as {
    charge: string;
    evidence: TrialEvidenceItem[];
    userDefense: string[];
    mimiReplies: string[];
  };

  const prompt = `You are Mia acting as the judge in a silly mock trial.
Charge:
${charge}

Evidence:
${evidence.map((item) => `${item.label}: ${cleanTrialContent(item.content)}${item.isRelevant ? ' [relevant]' : ''}`).join('\n')}

User defense messages:
${userDefense.map((item, index) => `${index + 1}. ${cleanTrialContent(item)}`).join('\n') || 'No defense provided.'}

Mimi prosecution replies:
${mimiReplies.map((item, index) => `${index + 1}. ${cleanTrialContent(item)}`).join('\n') || 'No prosecution replies provided.'}

Rules:
- Tone: Mia is amused but fair
- Decide one outcome: guilty / not guilty / case dismissed
- Keep verdict to 1-2 sentences max
- Include the exact phrase "guilty", "not guilty", or "case dismissed" in the verdict
- No JSON, no markdown`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 120,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }],
    });

    const verdict = normalizeModelPlainText(response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text.trim())
      .join(' ')
      .trim());

    const safeVerdict = verdict || 'case dismissed. Mimi had energy, but not evidence.';
    return NextResponse.json({
      verdict: safeVerdict,
      outcome: parseVerdictOutcome(safeVerdict),
    });
  } catch {
    const verdict = 'case dismissed. Mimi had energy, but not evidence.';
    return NextResponse.json({
      verdict,
      outcome: parseVerdictOutcome(verdict),
    });
  }
}
