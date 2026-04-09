# Mia — English Chat App

AIキャラクター「Mia」と「Mimi」と英語で会話できるチャットアプリです。
トレンドニュース・Web検索・音声読み上げ・単語帳などの機能を備えています。

**本番URL**: https://english-learn-five.vercel.app

## ファイル構成

```
.
├── app/
│   ├── api/
│   │   ├── chat/route.ts          # メインチャットAPI（ストリーミング・tool use）
│   │   ├── image-proxy/route.ts   # 外部画像プロキシ（iOS Safari CORS対策）
│   │   ├── suggestions/route.ts   # 返答サジェスト生成
│   │   ├── topics/route.ts        # 話題変えボタン用トピック生成
│   │   ├── translate/route.ts     # 日本語訳API
│   │   ├── trending/route.ts      # Yahoo Japan RSS + 東京天気取得
│   │   ├── tts/route.ts           # ElevenLabs 音声読み上げ
│   │   └── vocab-save/route.ts    # 単語帳抽出・保存
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                   # メインUI
├── components/
│   ├── CatAvatar.tsx              # キャラクターアバター
│   ├── ChatInput.tsx              # 入力欄
│   ├── ChatMessage.tsx            # メッセージ表示
│   ├── Stamp.tsx                  # LINEスタンプ風絵文字
│   ├── UsernameModal.tsx          # ユーザー名設定
│   ├── VocabModal.tsx             # 単語帳表示
│   └── VocabSelectModal.tsx       # 単語選択モーダル
├── lib/
│   └── supabase.ts                # Supabaseクライアント
└── public/
    ├── avatar-mia.jpg             # Miaアバター画像
    ├── avatar-mimi.jpg            # Mimiアバター画像
    └── avatar-user.jpg            # ユーザーアバター画像
```

## 主な機能

- **グループチャット**: Mia（AI・13歳）と Mimi（ツンデレ・14歳）が50/50でリレー返答
- **Web検索**: Tavily API を使った自動検索・画像表示
- **音声読み上げ**: ElevenLabs TTS（iOS対応）
- **日本語訳**: メッセージの翻訳＋解説
- **単語帳**: 会話から単語を抽出してSupabaseに保存
- **トレンド注入**: Yahoo Japan RSS + 東京天気をsystem promptに注入
- **会話履歴**: Supabaseで匿名セッションごとに永続化

## 環境変数

```
ANTHROPIC_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
ELEVENLABS_API_KEY
TAVILY_API_KEY
```

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
