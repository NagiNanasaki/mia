import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// POST { message } -> extract only
// POST { items, sessionId } -> save selected items
export async function POST(req: Request) {
  const body = await req.json();

  if (body.items && body.sessionId) {
    const { items, sessionId, source } = body as {
      items: { phrase: string; translation: string; tagged?: boolean }[];
      sessionId: string;
      source?: string;
    };

    if (!items.length) return Response.json({ saved: 0 });

    const rows = items.map((item) => {
      const row: Record<string, unknown> = {
        session_id: sessionId,
        phrase: item.phrase,
        translation: item.translation,
      };
      if (source) row.source = source;
      if (typeof item.tagged === 'boolean') row.tagged = item.tagged;
      return row;
    });

    const { error } = await supabase.from('vocabulary').insert(rows);
    if (error) {
      console.error('Supabase insert error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ saved: items.length });
  }

  const { message } = body as { message?: string };
  if (!message) return Response.json({ error: 'Missing message' }, { status: 400 });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Extract useful English vocabulary items from the following chat text.

Only include phrases that are genuinely worth saving for study.

Good candidates:
- natural everyday expressions
- useful slang or conversational chunks
- British expressions
- short idiomatic phrases
- memorable adjectives or verbs used in context

Do not include:
- basic function words like "the", "is", "a"
- fragments that are too incomplete to study
- duplicate items

Text:
"${message}"

Return JSON only in this exact format:
[{"phrase":"useful phrase","translation":"short Japanese explanation"}]

If nothing useful appears, return [] only.`,
    }],
  });

  const raw = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
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
