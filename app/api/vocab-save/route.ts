import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// POST { message } → { items } (extract only, no save)
// POST { items, sessionId } → { saved } (save selected items)
export async function POST(req: Request) {
  const body = await req.json();

  // Save mode: items + sessionId provided
  if (body.items && body.sessionId) {
    const { items, sessionId } = body as {
      items: { phrase: string; translation: string }[];
      sessionId: string;
    };
    if (!items.length) return Response.json({ saved: 0 });

    const { error } = await supabase.from('vocabulary').insert(
      items.map(item => ({
        session_id: sessionId,
        phrase: item.phrase,
        translation: item.translation,
      }))
    );
    if (error) {
      console.error('Supabase insert error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ saved: items.length });
  }

  // Extract mode: message provided
  const { message } = body as { message: string };
  if (!message) return Response.json({ error: 'Missing message' }, { status: 400 });

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `以下の英語メッセージから、英語学習者が覚えるべき英単語・熟語・スラング・慣用句をすべて抽出してください。
各表現について日本語で意味と使い方を簡潔に説明してください。

メッセージ: "${message}"

以下のJSON配列形式で返してください（他のテキストは不要）:
[{"phrase": "英語表現", "translation": "日本語の意味と使い方の説明"}]

該当する表現がなければ空配列 [] を返してください。`,
    }],
  });

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  let items: { phrase: string; translation: string }[] = [];
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    items = match ? JSON.parse(match[0]) : [];
  } catch {
    return Response.json({ items: [] });
  }

  return Response.json({ items });
}
