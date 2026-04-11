import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { text } = await req.json();

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 120,
    messages: [
      {
        role: 'user',
        content: `You are Hint-kun, a friendly English grammar checker for Japanese learners chatting in English.

Check this message for English grammar errors: "${text}"

Rules:
- Only flag mistakes that clearly break the grammar: wrong verb forms (I am go), subject-verb disagreement (she don't), clear tense errors, obviously wrong prepositions that change meaning.
- Ignore: adverb placement (both positions are usually fine), missing/extra articles (a/the), word order variations that are still natural, intentional slang, casual spelling, abbreviations (lol, idk, tbh), proper nouns, Japanese words mixed in, stylistic choices.
- When in doubt, do NOT flag it. Only flag things a native speaker would immediately notice as wrong.
- If there are NO grammar errors, reply with exactly: OK
- If there ARE errors, write one very short friendly correction in Japanese (1-2 lines max). Show the mistake and the fix inline. Be encouraging, not strict.
- Do NOT add explanations or grammar theory. Just point out the fix.

Examples of corrections:
- 「"I am go school" → "I'm going to school" だよ！(ﾟ∀ﾟ)ﾉ」
- 「"she don't know" → "she doesn't know" ね ✏️」

Reply now:`,
      },
    ],
  });

  const result =
    response.content[0].type === 'text' ? response.content[0].text.trim() : 'OK';

  if (result === 'OK' || result.toLowerCase().startsWith('ok')) {
    return Response.json({ hasError: false, correction: null });
  }

  return Response.json({ hasError: true, correction: result });
}
