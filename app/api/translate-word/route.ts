import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type TranslateWordResult =
  | { mode: 'normal'; candidates: { translation: string; nuance: string }[] }
  | { mode: 'long'; fullTranslation: string; keyPhrases: { original: string; translation: string }[] }
  | { mode: 'error'; message: string };

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function translateNormal(text: string): Promise<TranslateWordResult> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `英単語・熟語「${text}」を日本語に訳し、意味の異なる訳候補を3つ返してください。

ルール:
- 3候補は意味・用途・ニュアンスが分かるものを選ぶ（単なる言い換えは避ける）
- 各候補に短いニュアンス説明を付ける（20字以内）
- 品詞表示は不要
- JSON配列のみを返す（前後に説明文を加えない）

形式:
[{"translation":"訳語","nuance":"ニュアンス説明"},{"translation":"訳語","nuance":"ニュアンス説明"},{"translation":"訳語","nuance":"ニュアンス説明"}]`,
      },
    ],
  });

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  try {
    const match = raw.match(/\[[\s\S]*\]/);
    const candidates = match ? JSON.parse(match[0]) : [];
    return { mode: 'normal', candidates };
  } catch {
    return { mode: 'normal', candidates: [] };
  }
}

async function translateLong(text: string): Promise<TranslateWordResult> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `以下の英語フレーズを日本語に訳し、主要語句もまとめてください。

英語: ${text}

ルール:
- fullTranslation: 自然な日本語訳（1文）
- keyPhrases: 重要な単語・熟語を3〜5件（原語と訳語のペア）
- JSON形式のみ返す（前後に説明文を加えない）

形式:
{"fullTranslation":"日本語訳","keyPhrases":[{"original":"英語","translation":"日本語"},{"original":"英語","translation":"日本語"}]}`,
      },
    ],
  });

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const data = match ? JSON.parse(match[0]) : {};
    return {
      mode: 'long',
      fullTranslation: data.fullTranslation ?? '',
      keyPhrases: Array.isArray(data.keyPhrases) ? data.keyPhrases : [],
    };
  } catch {
    return { mode: 'long', fullTranslation: '', keyPhrases: [] };
  }
}

export async function POST(req: Request) {
  const { text } = await req.json();

  if (!text || typeof text !== 'string') {
    return Response.json({ mode: 'error', message: '入力が必要です' }, { status: 400 });
  }

  const wordCount = countWords(text);

  if (wordCount === 0) {
    return Response.json({ mode: 'error', message: '入力が必要です' }, { status: 400 });
  }

  if (wordCount > 20) {
    return Response.json({ mode: 'error', message: '20語以内で入力してください' }, { status: 400 });
  }

  const result = wordCount <= 4 ? await translateNormal(text) : await translateLong(text);
  return Response.json(result);
}
