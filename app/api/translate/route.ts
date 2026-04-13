import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildToneGuide(character?: 'mia' | 'mimi' | 'hint' | null): string {
  if (character === 'mia') {
    return 'Speaker style reference: Mia. Translate into natural Japanese with an innocent, earnest quality — like a girl who genuinely means every word and is slightly puzzled by the world in a sweet way. If first-person wording is needed, use 「私」 consistently. Use soft, wondering phrasing like 「～なのかな？」「～だよね」「そっか～」「～なんだって！」 when they fit naturally. Avoid smugness, rough words, and formal stiffness. The tone should feel pure, a little naive, and warmly sincere — like she truly believes what she is saying and finds it a bit amazing.';
  }
  if (character === 'mimi') {
    return 'Speaker style reference: Mimi. Translate into casual Japanese with the energy of a mischievous kid who is proud of causing trouble — playful, slightly smug about being bad, and unrepentant. If first-person wording is needed, use 「あたし」 consistently. Use snappy, irreverent phrasing like 「～だし」「～じゃん」「知ってた」「悪いとは思ってない」 when they fit. Keep it punchy and a little bit villainous in a fun way — like a kid who just did something chaotic and thinks it was the right call.';
  }
  if (character === 'hint') {
    return 'Speaker style reference: Hint assistant. Keep the Japanese friendly and clear. If first-person wording is needed, use 「私」 consistently.';
  }
  return 'Keep the Japanese casual and natural. If first-person wording is needed, use 「私」 consistently.';
}

export async function POST(req: Request) {
  const { text, character, simple } = await req.json() as { text: string; character?: string; simple?: boolean };

  const promptContent = simple
    ? `以下の英文を自然な日本語に訳してください。訳文のみ出力し、解説・前置き・補足は一切不要です。\n\n英文:\n${text}`
    : `以下の英文を日本語に訳し、学習者向けに難しい単語・表現・スラングがあれば簡潔に解説してください。

${buildToneGuide(character as 'mia' | 'mimi' | 'hint' | null)}

ルール:
- 最初に自然な日本語訳を書く。
- 改行後、難しい表現・スラング・イディオムがあれば「💡 〇〇：〜」の形で1行ずつ解説する（簡単な単語は省略可）。
- 解説がない場合は訳のみでよい。
- 一人称代名詞はスピーカーガイドに従い固定し、途中で切り替えない。
- 主語は自然に省略してよい。
- 余計な前置きは不要。

英文:
${text}`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: simple ? 120 : 512,
    messages: [{ role: 'user', content: promptContent }],
  });

  const content = message.content[0];
  const result = content.type === 'text' ? content.text.trim() : '';

  return new Response(JSON.stringify({ result }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
