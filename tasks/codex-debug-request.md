# Codex デバッグ依頼 — ミニゲーム機能

## 背景

Next.js 16 App Router + TypeScript + Tailwind CSS + Anthropic SDK (`claude-haiku-4-5`) のプロジェクト。  
英会話チャットアプリ（Mia/Mimi キャラクター）に**英語クイズゲームモード**を新規実装した。  
Claude によるコードレビューとデバッグを一通り行ったが、実機テストができていないため Codex に動作確認・追加デバッグを依頼する。

---

## 新規実装ファイル（未コミット）

```
lib/toeic-words.ts               # TOEIC 700レベル 500語リスト
app/api/game/questions/route.ts  # 5問生成 API（GET）
app/api/game/comment/route.ts    # キャラコメント生成 API（POST）
app/api/game/exp/route.ts        # EXP保存・レベル管理 API（GET/POST）
app/game/page.tsx                # クイズゲーム画面（/game）
```

## 既存ファイルの変更（未コミット）

```
app/page.tsx                     # lie detectionゲーム削除、ゲームボタン追加
app/api/chat/route.ts            # Miaペルソナ調整（アニメ少女寄りに変更）
app/api/translate/route.ts       # 翻訳の学習ヒント復活、Miaトーン調整
app/api/vocab-save/route.ts      # 単語抽出プロンプトの閾値緩和
```

---

## ゲームの仕様

### フロー
```
/game ページ
  → スタート画面（Lv・EXPバー表示）
  → 「スタート！」ボタン
  → 問題×5問（API生成）
      各問: キャラがコメント → ユーザー回答 → キャラが正誤コメント
  → 結果画面（スコア・獲得EXP・レベルバー・レベルアップ通知）
```

### 問題形式（3種類）

| 種類 | 内容 | UI |
|---|---|---|
| `ja_select` | 英語 → 日本語4択 | 2×2カードグリッド |
| `en_select` | 日本語 → 英語4択 | 2×2カードグリッド |
| `reorder` | 日本語の意味が提示され、英単語カードを正しい順に並べる | 2ゾーン（プール/配置済み） |

### キャラクター
- Q1・3・5 → Mia（紫）、Q2・4 → Mimi（オレンジ）
- 各問で **出題コメント**（API生成）と **正誤コメント**（API生成）の2回コメントが入る

### EXP テーブル
| 形式 | 正解EXP |
|---|---|
| ja_select | 10 |
| en_select | 15 |
| reorder | 25 |

### レベルテーブル（累計EXP）
Lv1=0, Lv2=100, Lv3=250, Lv4=450, Lv5=700, Lv6=1000, Lv7=1350, Lv8=1750, Lv9=2200, Lv10=2700, 以降+550/Lv

---

## Supabase テーブル

### 既存テーブル
```sql
-- vocabulary（単語帳）
session_id   text
phrase       text
translation  text
created_at   timestamptz
```

### 新規テーブル（デプロイ前に手動作成済み）
```sql
-- user_progress（EXP・レベル）
vocab_owner_id  text  PRIMARY KEY
exp             int   DEFAULT 0
level           int   DEFAULT 1
updated_at      timestamptz
```

### localStorage キー
```
mia_vocab_owner_id  -- 単語帳・EXPの所有者ID（ゲームページでも使用）
mia_session_id      -- チャット会話セッションID（別物）
```

---

## API 仕様

### GET /api/game/questions?vocabOwnerId=xxx

**処理:**
1. Supabase `vocabulary` から `session_id = vocabOwnerId` の単語を最大100件取得
2. `lib/toeic-words.ts` の500語と混合し、重複排除して10語プール作成
3. 先頭5語を選択
4. 問題タイプをシャッフル（ja_select×2, en_select×2, reorder×2 → shuffle → slice(0,5)）
5. Claude haiku に1回のAPIコールで全5問の選択肢・例文を生成させる
6. 構造化してJSON返却

**Claude プロンプト要求:**
- `ja_select`: 誤った日本語訳3つ（distractors）
- `en_select`: 誤った英語表現3つ（distractors）
- `reorder`: 5〜8語の英文（sentence）

**返却形式:**
```typescript
type GameQuestion = {
  type: 'ja_select' | 'en_select' | 'reorder';
  word: string;
  meaning: string;
  character: 'mia' | 'mimi';
  options?: string[];   // ja_select / en_select: 正解込み4択（シャッフル済み）
  answer?: string;      // ja_select / en_select: 正解
  sentence?: string;    // reorder: 句読点除去・正規化済みの英文
  words?: string[];     // reorder: sentence をスペース分割してシャッフル
}
```

### POST /api/game/comment

```typescript
// リクエスト
{
  character: 'mia' | 'mimi';
  word: string;
  meaning: string;
  questionType: 'ja_select' | 'en_select' | 'reorder';
  phase: 'question' | 'result';
  isCorrect?: boolean;    // result時
  userAnswer?: string;    // result時
}
// レスポンス
{ comment: string }
```

### GET /api/game/exp?vocabOwnerId=xxx
```typescript
// レスポンス
{ exp: number; level: number; nextLevelExp: number }
```

### POST /api/game/exp
```typescript
// リクエスト
{ vocabOwnerId: string; expGained: number }
// レスポンス
{ exp: number; level: number; leveledUp: boolean; nextLevelExp: number }
```

---

## ゲームページの状態管理

```typescript
type GamePhase =
  | 'loading'      // 問題取得中
  | 'start'        // スタート画面
  | 'questioning'  // 出題コメント取得中（ローディングドット表示）
  | 'playing'      // ユーザーの回答待ち
  | 'judging'      // 正誤コメント取得中
  | 'result'       // 正誤+コメント表示、「次へ」待ち
  | 'complete';    // 全5問終了、結果画面
```

**reorder 状態:**
- `pool: string[]` — 未配置の単語（`q.words`から開始）
- `placed: string[]` — ユーザーが配置した単語（順序が答え）
- クリックで pool ↔ placed を移動（インデックスベースで管理）

---

## 既知の潜在問題・確認してほしい箇所

### 1. reorder の正誤判定（高優先度）
**ファイル:** `app/game/page.tsx`  
`handleReorderCheck` 内で `normalize(placed.join(' ')) === normalize(q.sentence)` で比較。  
`normalize` は小文字化・空白正規化・trim を行う。  
**確認:** Claude が生成する sentence に特殊文字（アポストロフィ、ハイフン等）が含まれた場合、words の分割と join が一致するか。  
現在 `sentence` 側は `replace(/[.,!?;:'"]/g, '')` で除去済みだが、**ハイフン（-）は除去していない**ため "well-known" のような語が "well-known" として1トークンになり、pool に "well-known" として入る。これは問題なし。ただしアポストロフィが sentence から除去されると "It's" → "Its" になり words も "Its" になるので一致するはず。

### 2. Claude の JSON 生成失敗時のフォールバック（高優先度）
**ファイル:** `app/api/game/questions/route.ts`  
Claude が JSON フォーマットを外れた場合（マークダウンコードブロック等）、`raw.match(/\[[\s\S]*\]/)` でパース試行。失敗時は `generated = []` のまま続行。  
**結果:**
- `ja_select` / `en_select`: `distractors = []` → `allOptions = [correctAnswer]`（1択になる）
- `reorder`: フォールバック文 `"We need to use this expression correctly."` を使用

**確認:** 1択問題が出た場合の UI 崩れがないか（2×2グリッドに1つだけ表示される）。  
**推奨修正案:** distractors が3未満の場合、TOEIC_WORDS から他の翻訳をランダムに補填する。

### 3. ユーザーの単語帳翻訳フィールドが長い場合（中優先度）
**ファイル:** `app/api/game/questions/route.ts`  
`vocabulary.translation` は「日本語の意味・ニュアンス・使い方の一言説明」形式（長め）。  
これが `ja_select` の正解選択肢になるため、選択肢テキストが長くなってカードUIが崩れる可能性。  
**確認:** 長い翻訳テキストがカード内で折り返すか、はみ出すかを確認し、必要なら `line-clamp` を追加する。

### 4. `showQuestion` の useCallback 依存配列（中優先度）
**ファイル:** `app/game/page.tsx`  
```typescript
const showQuestion = useCallback(async (idx: number) => { ... }, [questions, fetchComment]);
```
`startGame` は通常関数で `showQuestion` を呼ぶ。`questions` が useState で管理されており `fetchQuestions` 完了後にセットされる。スタート画面は `questions` セット後に表示されるため、`startGame` 呼び出し時点では `showQuestion` が最新の `questions` を参照しているはず。ただし、React の closure の挙動を実際に確認してほしい。

### 5. EXP の二重送信リスク（中優先度）
**ファイル:** `app/game/page.tsx` `handleNext`  
最終問題で「結果を見る」ボタンを二度押しすると `/api/game/exp` に2回POSTされる可能性。  
ボタンに `disabled` や送信フラグが必要かもしれない。

### 6. `handleNext` の stale closure（低優先度・確認のみ）  
**ファイル:** `app/game/page.tsx`  
最終問題の `handleSelectAnswer` / `handleReorderCheck` が `setTotalExpGained((e) => e + exp)` で状態を更新した後、ユーザーが「結果を見る」をクリックすると `handleNext` が `totalExpGained` を参照する。通常関数なので再レンダー後の最新値を持つはずだが、念のため確認。

### 7. チャット画面のゲームボタン（低優先度）
**ファイル:** `app/page.tsx`  
サジェストチップエリアの末尾に `▶` アイコンボタン（`<a href="/game">`）を追加。  
Next.js では `<a>` タグより `<Link>` を使うべきだが、サジェストエリアが `footer` 内にあるため `Link` に変更しても動作するか確認。

---

## テストシナリオ

### 基本フロー
1. `/game` にアクセス → ローディング → スタート画面表示（Lv.1, EXP 0/100）
2. 「スタート！」クリック → Q1表示（Miaのコメント付き）
3. `ja_select` の選択肢4択が表示されることを確認
4. 正解カードクリック → 緑ハイライト → Miaの正解コメント → 「次の問題 →」
5. `reorder` 問題で単語プールから配置 → 「答え合わせ」 → 正誤判定
6. 5問終了 → 結果画面（スコア・EXP・レベルバー）
7. Supabase `user_progress` テーブルに EXP が保存されていることを確認

### エッジケース
- 単語帳が空の場合 → TOEIC リストのみで5問生成できること
- reorder で全単語を pool に戻してから再度配置しても正常動作すること
- ネットワークエラー時（comment API失敗）→ 空コメントでゲームが続行すること（`fetchComment` は失敗時 `''` を返す）

---

## 環境・デプロイ情報

- **本番URL:** https://english-learn-five.vercel.app
- **ビルドコマンド:** `npm run build`（TypeScript・Turbopack、現在エラーなし）
- **デプロイコマンド:** `vercel --prod`
- **Anthropic API:** `claude-haiku-4-5` を使用
- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` で接続

## 注意事項
- Vercel AI SDK への移行は**不要**（プロジェクト全体で Anthropic SDK 直接使用で統一）
- Next.js は v16（breaking changes あり）。変更前に `node_modules/next/dist/docs/` 確認推奨
- `new URL(req.url).searchParams` は Web API であり、Next.js の async searchParams とは別物（同期で問題なし）

---

## 依頼内容

1. **上記「既知の潜在問題」の各項目を確認・修正**（特に2・3・5番）
2. **実際のゲームフローを通しで追って論理バグがないか確認**
3. **UI の崩れやすい箇所の Tailwind クラスを確認**（reorder の2ゾーン、長テキスト対応）
4. **問題なければ `vercel --prod` でデプロイ**

デバッグ完了後は変更内容をコミットしてデプロイしてください。
