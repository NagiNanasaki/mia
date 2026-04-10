import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function isEnglishWord(text: string): boolean {
  // Allow letters, hyphens, apostrophes, spaces only
  if (!/^[a-zA-Z\s'\-]+$/.test(text)) return false;
  const wordCount = text.trim().split(/\s+/).length;
  return wordCount >= 1 && wordCount <= 5;
}

async function translateFirst(word: string): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: `英語「${word}」を日本語に訳し、最も一般的な意味・訳語を1つだけ返してください。
ルール:
- 訳語のみ返す（例: 「達成する」「大幅な」「見通し」）
- 説明・例文・品詞・記号は一切不要
- 複数候補がある場合は最も頻出の1つだけ`,
      },
    ],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return text;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return Response.json({ error: '不正なリクエストです' }, { status: 400, headers: CORS_HEADERS });
  }

  const { word, connection_code } = body as { word?: string; connection_code?: string };

  if (!connection_code || !/^[0-9a-f-]{36}$/i.test(connection_code)) {
    return Response.json({ error: '連携コードが無効です' }, { status: 400, headers: CORS_HEADERS });
  }

  if (!word || typeof word !== 'string') {
    return Response.json({ error: '単語が指定されていません' }, { status: 400, headers: CORS_HEADERS });
  }

  const trimmed = word.trim();

  if (!isEnglishWord(trimmed)) {
    return Response.json({ error: '単語・熟語のみ保存できます' }, { status: 400, headers: CORS_HEADERS });
  }

  const translation = await translateFirst(trimmed);

  const { error: dbError } = await supabase.from('vocabulary').insert({
    session_id: connection_code,
    phrase: trimmed,
    translation,
  });

  if (dbError) {
    console.error('[extension/save] DB error:', dbError);
    return Response.json({ error: '保存に失敗しました' }, { status: 500, headers: CORS_HEADERS });
  }

  return Response.json({ ok: true, phrase: trimmed, translation }, { headers: CORS_HEADERS });
}
