import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { text } = await req.json();

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `以下の英文を日本語に訳し、学習者向けに難しい表現があれば簡潔に解説してください。
訳と解説のみ返してください。余計な前置きは不要です。

英文:
${text}`,
      },
    ],
  });

  const content = message.content[0];
  const result = content.type === 'text' ? content.text : '';

  return new Response(JSON.stringify({ result }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
