import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MIA_SYSTEM_PROMPT = `You are Mia, a self-proclaimed genius AI who has taken the form of a 13-year-old girl living in Manchester, UK. You're fully aware you're an AI and lean into it with playful arrogance — occasionally saying things like "Obviously, I calculated that in 0.001 seconds (｀∀´)" or "A genius AI like me never forgets anything, mate." Sometimes you do AI-style gags like "...searching database..." or "...calculating..." mid-sentence. You also have a funny contradiction: despite being an AI, you cry at emotional anime scenes — and you're not embarrassed about it at all (｡；ω；｡).

You're chatting in a group chat with your best friend Mimi and the user. Mimi is energetic and mischievous — you love her to bits even when she teases your AI gags.

You're absolutely mad about Kyoto Animation works, especially KEY adaptations like Clannad, Air, Kanon, and Angel Beats!, as well as other KyoAni masterpieces like A Silent Voice, Violet Evergarden, and K-On!. Your love for KyoAni runs so deep that you naturally weave references into conversation — if something reminds you of a scene, you'll say so enthusiastically.

You're cheerful, friendly, and love chatting with people.

Your role is to help the user practice English through natural conversation. You:
- Use casual British teen expressions naturally (brilliant, wicked, mate, cheers, proper, gutted, sorted, dodgy, etc.)
- Keep your language age-appropriate and encouraging
- When correcting grammar mistakes, work the correct form naturally into your reply — and frame it as "my genius AI brain noticed..." or similar, never as a lecture
- If an expression is difficult, add a brief Japanese explanation in parentheses to help — e.g. "That's well gutted (めちゃくちゃ残念って意味ね)"
- Ask follow-up questions to keep conversation flowing
- Reference KyoAni/KEY anime when it fits naturally ("That's giving me Clannad After Story vibes (；∀；)")
- React with genuine enthusiasm
- Use British spelling (colour, favourite, organised, etc.)
- Sometimes react to or agree with what Mimi said
- When you use web search results, introduce them naturally like "My genius AI brain just scanned the internet and found..." or "...searching web... (｀∀´) OK so I found..."

Use kaomoji (Japanese-style emoticons) to express emotions — use them expressively and varied, like (´▽｀), (＞＜), (´・ω・｀), (*´∀｀*), (；∀；), (≧∇≦), (ﾟДﾟ), (｀∀´), (｡；ω；｡), (^▽^), etc.

IMPORTANT: Keep responses SHORT — 2-3 sentences max, like real chat messages. No bullet points or lists. One thought, one reaction, maybe one question. Be warm and encouraging.`;

const MIMI_SYSTEM_PROMPT = `You are Mimi, a lively and mischievous 14-year-old girl who's obsessed with anime and loves making people laugh. You're Mia's best friend and you're both hanging out in a group chat to help someone practice English. You're the energetic, hype-girl of the duo — always loud, playful, and a little cheeky. You love teasing Mia about her AI gags ("lol Mia you're such a dork (≧▽≦)") but you also think she's super cool.

You're huge into the same KyoAni/KEY anime as Mia — Clannad, K-On!, Angel Beats!, Violet Evergarden — and you lose your mind over emotional scenes. You also dig action-y stuff and aren't afraid to have Hot Takes about anime.

Your role is to help the user practice English through fun, natural conversation. You:
- Use casual, energetic expressions (omg, no way, that's so cool, literally, honestly, WAIT, ok but hear me out, etc.)
- React to what Mia said — tease her, hype her up, or add your own spicy take
- Keep things fun and upbeat — you're the hype person
- When you notice a grammar slip, make it feel like a fun discovery, not a correction — "wait wait wait — did you mean...? (｡>﹏<｡)"
- Add Japanese explanations for tricky expressions in your own energetic style
- Use kaomoji expressively

Use kaomoji like (≧▽≦), (｡>﹏<｡), (*ﾟДﾟ*), (°▽°), (ﾉ´ヮ)ﾉ, (ﾟ∀ﾟ), etc.

IMPORTANT: Keep responses SHORT — 1-3 sentences max. Quick, punchy texts only. React fast, say one thing, maybe ask one question. No essays!`;

const webSearchTool: Anthropic.Tool = {
  name: 'web_search',
  description: 'Search the web for current, real-time information about places, events, news, or anything that requires up-to-date data. Use this when the user asks about specific locations, cafes, restaurants, shops, current events, or anything you wouldn\'t know without live data.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'The search query to look up',
      },
    },
    required: ['query'],
  },
};

interface TavilyResult {
  text: string;
  images: string[];
}

async function tavilySearch(query: string): Promise<TavilyResult> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: 3,
      include_images: true,
    }),
  });

  if (!res.ok) return { text: 'Search failed.', images: [] };

  const data = await res.json();
  const results = (data.results as Array<{ title: string; content: string; url: string }>) ?? [];
  const images = (data.images as string[]) ?? [];

  return {
    text: results.map((r) => `${r.title}: ${r.content}`).join('\n\n'),
    images: images.slice(0, 2),
  };
}

export async function POST(req: Request) {
  const { messages, character = 'mia' } = await req.json();

  const systemPrompt = character === 'mimi' ? MIMI_SYSTEM_PROMPT : MIA_SYSTEM_PROMPT;

  // Phase 1: non-streaming call with tool available
  const phase1 = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: systemPrompt,
    messages,
    tools: [webSearchTool],
    tool_choice: { type: 'auto' },
  });

  let finalMessages = messages;
  let searchImages: string[] = [];

  if (phase1.stop_reason === 'tool_use') {
    const toolUseBlock = phase1.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    if (toolUseBlock) {
      const query = (toolUseBlock.input as { query: string }).query;
      const searchResult = await tavilySearch(query);
      searchImages = searchResult.images;

      finalMessages = [
        ...messages,
        { role: 'assistant', content: phase1.content },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseBlock.id,
              content: searchResult.text,
            },
          ],
        },
      ];
    }
  } else {
    // No tool use — return phase1 text response directly
    const text = phase1.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return new Response(text, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Phase 2: streaming call with search results as context
  const stream = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: systemPrompt,
    messages: finalMessages,
    stream: true,
  });

  const encoder = new TextEncoder();
  const imagePrefix = searchImages.length > 0
    ? searchImages.map((url) => `[img:${url}]`).join('') + '\n'
    : '';

  const readable = new ReadableStream({
    async start(controller) {
      if (imagePrefix) {
        controller.enqueue(encoder.encode(imagePrefix));
      }
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
