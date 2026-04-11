import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { messages } = await req.json();
  const conversationMessages = (messages ?? []).filter(
    (m: { role: string; character?: string; content: string }) =>
      !(m.role === 'assistant' && m.character === 'hint') &&
      !(m.role === 'user' && m.content?.trim?.().startsWith('/hint'))
  );
  if (!conversationMessages.length) return Response.json({ suggestions: [] });

  // Use last 6 messages for context
  const recent = conversationMessages.slice(-6);
  const context = recent
    .map((m: { role: string; character?: string; content: string }) => {
      const name = m.role === 'user' ? 'User' : (m.character === 'mimi' ? 'Mimi' : 'Mia');
      return `${name}: ${m.content.slice(0, 120)}`;
    })
    .join('\n');

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `以下の会話の流れを踏まえて、ユーザーが次に送りそうな自然な英語メッセージを3つ考えてください。
短く自然な口語英語で（1文以内）、会話の続きとして自然なものにしてください。
会話の流れと無関係に「goodbye」「see you」などの別れ言葉を唐突に提案しないこと（ただし会話の中でユーザーが別れを切り出している流れの場合は自然な返しとして含めてよい）。

会話:
${context}

JSON配列で返してください（他のテキスト不要）:
["メッセージ1", "メッセージ2", "メッセージ3"]`,
    }],
  });

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  try {
    const match = raw.match(/\[[\s\S]*?\]/);
    const suggestions = match ? JSON.parse(match[0]) : [];
    return Response.json({ suggestions });
  } catch {
    return Response.json({ suggestions: [] });
  }
}
