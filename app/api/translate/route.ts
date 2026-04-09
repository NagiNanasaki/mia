import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildToneGuide(character?: 'mia' | 'mimi' | 'hint' | null): string {
  if (character === 'mia') {
    return 'Speaker style reference: Mia. Translate into natural Japanese that sounds like a sincere, slightly earnest anime-girl type — warm and genuine, with a light touch of quiet smugness. If first-person wording is needed, use 「私」 consistently. Use soft, expressive phrasing like 「～だと思うんだよね」「でしょ！」「～じゃないかな？」「～なんだけど」 when they fit naturally. Avoid rough gyaru-ish words (「マジ」「ヤバ」「ウケる」) and avoid stiff formal Japanese. The tone should feel like a thoughtful, curious girl who genuinely cares about getting things right.';
  }
  if (character === 'mimi') {
    return 'Speaker style reference: Mimi. Translate into energetic, casual, playful Japanese. If first-person wording is needed, use 「あたし」 consistently. Keep the vibe high-energy, lively, and slightly cheeky.';
  }
  if (character === 'hint') {
    return 'Speaker style reference: Hint assistant. Keep the Japanese friendly and clear. If first-person wording is needed, use 「私」 consistently.';
  }
  return 'Keep the Japanese casual and natural. If first-person wording is needed, use 「私」 consistently.';
}

export async function POST(req: Request) {
  const { text, character } = await req.json();

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `以下の英文を日本語に訳し、学習者向けに難しい単語・表現・スラングがあれば簡潔に解説してください。

${buildToneGuide(character)}

ルール:
- 最初に自然な日本語訳を書く。
- 改行後、難しい表現・スラング・イディオムがあれば「💡 〇〇：〜」の形で1行ずつ解説する（簡単な単語は省略可）。
- 解説がない場合は訳のみでよい。
- 一人称代名詞はスピーカーガイドに従い固定し、途中で切り替えない。
- 主語は自然に省略してよい。
- 余計な前置きは不要。

英文:
${text}`,
      },
    ],
  });

  const content = message.content[0];
  const result = content.type === 'text' ? content.text.trim() : '';

  return new Response(JSON.stringify({ result }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
