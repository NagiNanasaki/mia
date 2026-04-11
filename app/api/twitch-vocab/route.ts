import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const streamer = searchParams.get('streamer')?.trim();
  if (!streamer) return Response.json({ error: 'Missing streamer' }, { status: 400 });

  // Search for streamer catchphrases via Tavily
  const tavilyRes = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query: `${streamer} twitch streamer catchphrases common words slang vocabulary expressions`,
      search_depth: 'basic',
      max_results: 5,
      include_answer: true,
    }),
  });

  let searchContent = '';
  if (tavilyRes.ok) {
    const data = await tavilyRes.json();
    const answer = data.answer ?? '';
    const snippets = ((data.results ?? []) as Array<{ title: string; content: string }>)
      .map((r) => `${r.title}: ${r.content}`)
      .join('\n\n');
    searchContent = [answer, snippets].filter(Boolean).join('\n\n').slice(0, 4000);
  }

  if (!searchContent) {
    return Response.json({ streamer, phrases: [], notFound: true });
  }

  // Extract vocabulary with Claude
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `Based on this information about Twitch streamer "${streamer}", extract 10–20 words, phrases, catchphrases, or expressions they commonly use. Include recurring slang, reactions, jokes, memes, and community vocabulary specific to this streamer.

Search results:
${searchContent}

Return ONLY valid JSON — no explanation, no markdown:
{
  "streamer": "${streamer}",
  "phrases": ["phrase1", "phrase2", ...]
}

Rules:
- Include actual catchphrases and expressions, not generic ones like "hello" or "thanks"
- If no distinctive vocabulary is found, return {"streamer": "${streamer}", "phrases": []}
- Keep each phrase short (1–6 words)`,
      },
    ],
  });

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return Response.json({
        streamer: parsed.streamer ?? streamer,
        phrases: Array.isArray(parsed.phrases) ? parsed.phrases.filter(Boolean) : [],
      });
    }
  } catch {
    // fall through
  }

  return Response.json({ streamer, phrases: [] });
}
