import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { messages } = await req.json();
  const conversationMessages = (messages ?? []).filter(
    (m: { role: string; character?: string; content: string }) =>
      !(m.role === 'assistant' && m.character === 'hint') &&
      !(m.role === 'user' && m.content?.trim?.().startsWith('/hint'))
  );

  // Build context from recent messages to suggest DIFFERENT topics
  const recentTopics = conversationMessages
    .slice(-10)
    .map((m: { role: string; character?: string; content: string }) => {
      const name = m.role === 'user' ? 'User' : (m.character === 'mimi' ? 'Mimi' : 'Mia');
      return `${name}: ${m.content.slice(0, 80)}`;
    })
    .join('\n');

  const contextPart = recentTopics
    ? `Current conversation:\n${recentTopics}\n\nSuggest topics that are COMPLETELY DIFFERENT from what's being discussed above.`
    : 'Suggest fun, varied conversation topics.';

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `${contextPart}

Generate 3 short, natural English conversation-starter messages a learner could send to their English tutor friends.
Topics should be fun, varied, and cover different areas (e.g. culture, food, hobbies, opinions, hypotheticals, weird facts, etc.).
Each message should be 1 short sentence that invites discussion.

Return ONLY a JSON array, no other text:
["message1", "message2", "message3"]`,
    }],
  });

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  try {
    const match = raw.match(/\[[\s\S]*?\]/);
    const topics = match ? JSON.parse(match[0]) : [];
    return Response.json({ topics });
  } catch {
    return Response.json({ topics: [] });
  }
}
