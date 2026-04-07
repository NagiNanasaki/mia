import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const { phrase, sessionId } = await req.json();
  if (!phrase || !sessionId) {
    return Response.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Generate Japanese translation + explanation
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `英語学習者向けに、以下の英語フレーズを日本語で簡潔に説明してください。
訳と、使い方のポイントを2〜3文で。フレーズ: "${phrase}"`,
    }],
  });

  const translation = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  const { error } = await supabase.from('vocabulary').insert({
    session_id: sessionId,
    phrase,
    translation,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ translation });
}
