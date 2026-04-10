import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function tokenize(sentence: string): string[] {
  return (sentence.toLowerCase().match(/[a-z0-9]+(?:[-'][a-z0-9]+)*/g) ?? []);
}

function sameTokenMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const token of a) counts.set(token, (counts.get(token) ?? 0) + 1);
  for (const token of b) {
    const next = (counts.get(token) ?? 0) - 1;
    if (next < 0) return false;
    counts.set(token, next);
  }
  return [...counts.values()].every((value) => value === 0);
}

export async function POST(req: Request) {
  const { userSentence, answerSentence } = await req.json();

  if (!userSentence || !answerSentence) {
    return Response.json({ correct: false }, { status: 400 });
  }

  const userTokens = tokenize(userSentence);
  const answerTokens = tokenize(answerSentence);

  if (!sameTokenMultiset(userTokens, answerTokens)) {
    return Response.json({ correct: false });
  }

  if (userTokens.join(' ') === answerTokens.join(' ')) {
    return Response.json({ correct: true });
  }

  const prompt = `You are judging an English word-order quiz.

Reference sentence:
"${answerSentence}"

User sentence built from the same word set:
"${userSentence}"

Rules:
- The user sentence uses the same words as the reference sentence.
- Mark CORRECT if the user sentence is a natural, grammatically acceptable English sentence and preserves essentially the same meaning.
- Minor differences in adverb placement or equally natural word order should be accepted.
- Mark WRONG if the word order is unnatural, ungrammatical, or changes the meaning.

Return only one word:
CORRECT
or
WRONG`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 10,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  const result = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
    .toUpperCase();

  return Response.json({ correct: result.includes('CORRECT') });
}
