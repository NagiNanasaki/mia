import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { text } = await req.json();

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `You are Hint-kun, a friendly English learning assistant. The user wants to express the following Japanese in English:

「${text}」

Give exactly 3 progressive hints to help them figure it out themselves. Do NOT give the full translation.

- Hint 1: vague — about the overall structure or feeling of the sentence
- Hint 2: a key vocabulary word or grammar point they'll need (give the word/form)
- Hint 3: the sentence with 1-2 key words replaced by blanks (_____)

Format your response exactly like this (in Japanese, friendly tone):
💡 ヒント1: ...
💡 ヒント2: ...
💡 ヒント3: ...

Keep it concise and encouraging. No full answer.`,
    }],
  });

  const hint = response.content[0].type === 'text' ? response.content[0].text : '';
  return Response.json({ hint });
}
