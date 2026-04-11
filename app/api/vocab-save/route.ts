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
    const { items, sessionId, source } = body as {
      items: { phrase: string; translation: string }[];
      sessionId: string;
      source?: string;
    };
    if (!items.length) return Response.json({ saved: 0 });

    const rows = items.map(item => {
      const row: Record<string, string> = {
        session_id: sessionId,
        phrase: item.phrase,
        translation: item.translation,
      };
      if (source) row.source = source;
      return row;
    });

    const { error } = await supabase.from('vocabulary').insert(rows);
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
      content: `以下の英語メッセージから、日本語話者の英語学習者に役立つ表現をすべて抽出してください。

抽出基準（広めに取る）:
- 日常的なスラング・口語表現（"sort of", "kind of", "I'll allow it" など）
- イギリス英語特有の表現（"mate", "brilliant", "gutted", "sorted" など）
- 熟語・イディオム・フレーズ動詞
- 感嘆・相槌表現（"fair enough", "not gonna lie", "to be honest" など）
- 学習者が自然に使えると嬉しい表現なら何でも含める
- 超基本語（"the", "is", "a"）以外は積極的に拾う

メッセージ: "${message}"

JSON配列のみを返してください（前後に説明文を加えない）:
[{"phrase": "英語表現", "translation": "日本語の意味・ニュアンス・使い方の一言説明"}]

表現が見当たらない場合のみ [] を返す。`,
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
