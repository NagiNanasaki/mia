import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { cleanTrialContent, DEFAULT_TRIAL_CHARGES, normalizeModelPlainText, type TrialEvidenceItem, type TrialHistoryMessage } from '@/lib/trial';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildFallbackEvidence(recentMessages: TrialHistoryMessage[]): TrialEvidenceItem[] {
  const source = recentMessages.slice(-5);
  const items = source.map((message, index) => ({
    id: `exhibit-${String.fromCharCode(97 + index)}`,
    label: `Exhibit ${String.fromCharCode(65 + index)}`,
    content: cleanTrialContent(message.content).slice(0, 120) || 'suspicious silence',
    isRelevant: index < 3,
  }));

  while (items.length < 5) {
    const index = items.length;
    items.push({
      id: `exhibit-${String.fromCharCode(97 + index)}`,
      label: `Exhibit ${String.fromCharCode(65 + index)}`,
      content: 'additional suspicious behavior noted by the court.',
      isRelevant: index < 3,
    });
  }

  return items;
}

export async function POST(req: NextRequest) {
  const { recentMessages = [] } = await req.json() as { recentMessages?: TrialHistoryMessage[]; ownerID?: string };

  const cleanedMessages: TrialHistoryMessage[] = recentMessages
    .map((message) => ({
      role: (message.role === 'user' ? 'user' : 'assistant') as TrialHistoryMessage['role'],
      content: cleanTrialContent(message.content),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-10);

  const fallbackCharge = DEFAULT_TRIAL_CHARGES[Math.floor(Math.random() * DEFAULT_TRIAL_CHARGES.length)];
  const fallbackEvidence = buildFallbackEvidence(cleanedMessages);

  if (cleanedMessages.length < 3) {
    return NextResponse.json({ charge: fallbackCharge, evidence: fallbackEvidence });
  }

  const prompt = `You are setting up a ridiculous "mock trial" in a teen chat app.
Mimi (14, chaotic, always denying everything) is the DEFENDANT.
Mia (13, sharp, slightly smug) is the PROSECUTOR.

Create:
1. one funny charge — what Mimi is accused of doing
2. five short evidence items labelled as exhibits

Rules:
- Tone: playful, petty, dramatic
- The charge must be something Mimi would absolutely deny doing
- Evidence should be loosely based on the conversation when possible
- Keep each evidence item to 1 short sentence
- Mark only some evidence as actually relevant
- Output valid JSON only

Recent messages (context for generating the charge):
${cleanedMessages.map((message) => `${message.role}: ${message.content}`).join('\n')}

Use this JSON shape:
{
  "charge": "string",
  "evidence": [
    { "id": "exhibit-a", "label": "Exhibit A", "content": "string", "isRelevant": true }
  ]
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? text) as { charge?: string; evidence?: TrialEvidenceItem[] };
    const evidence = Array.isArray(parsed.evidence) && parsed.evidence.length > 0 ? parsed.evidence.slice(0, 5) : fallbackEvidence;

    return NextResponse.json({
      charge: typeof parsed.charge === 'string' && parsed.charge.trim()
        ? normalizeModelPlainText(parsed.charge.trim())
        : fallbackCharge,
      evidence: evidence.map((item, index) => ({
        id: item.id || `exhibit-${String.fromCharCode(97 + index)}`,
        label: item.label || `Exhibit ${String.fromCharCode(65 + index)}`,
        content: normalizeModelPlainText(cleanTrialContent(item.content || fallbackEvidence[index]?.content || 'suspicious behavior')),
        isRelevant: Boolean(item.isRelevant),
      })),
    });
  } catch {
    return NextResponse.json({ charge: fallbackCharge, evidence: fallbackEvidence });
  }
}
