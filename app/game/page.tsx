'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import CatAvatar from '@/components/CatAvatar';
import type { GameQuestion } from '@/app/api/game/questions/route';

const EXP_TABLE: Record<GameQuestion['type'], number> = {
  ja_select: 10,
  en_select: 15,
  reorder: 25,
};

// Relaxed level table (roughly half the original thresholds)
const LEVEL_TABLE = [0, 50, 125, 225, 350, 500, 675, 875, 1100, 1350];

// --- Random character comments (no API call) ---
const COMMENTS = {
  mia: {
    question: [
      "Right, let's see what you've got. (´・ω・｀)",
      "Ok so this one's actually quite interesting.",
      "I'd be surprised if you get this wrong, tbh.",
      "Hmm, think carefully about this one.",
      "Don't rush — take a moment.",
      "This one's from my personal favourites list.",
      "I wonder if you know this one already.",
    ],
    correct: [
      "Oh. You actually got it. Fine. (´・ω・｀)",
      "Correct! I knew you could do it... probably.",
      "That's right! Not bad at all.",
      "Yep, that's the one. Good job, I suppose.",
      "Perfect. You're getting better.",
      "Well done! See, I told you it was doable.",
    ],
    wrong: [
      "Nope. The answer was {answer}. Don't forget it.",
      "Not quite — it was {answer}. Remember that.",
      "Wrong this time. It's {answer}, actually.",
      "Ah, close but no. The right answer is {answer}. (´・ω・｀)",
      "Hmm, that wasn't right. It was {answer}.",
      "Nearly! But no — it's {answer}.",
    ],
  },
  mimi: {
    question: [
      "ok try this one, I already know you'll mess it up",
      "this is easy btw. just saying.",
      "I knew this word before you did. obviously.",
      "not my fault if you don't know this one",
      "hmm. this one's fine I guess",
      "I didn't do anything. here's your question.",
      "ok ok ok here we go",
    ],
    correct: [
      "ugh fine you got it. I knew that.",
      "ok yeah that's right. whatever.",
      "correct! not that I'm impressed or anything",
      "yeah yeah. good. I totally predicted that.",
      "I knew you'd get it. obviously.",
      "fine. you got lucky.",
    ],
    wrong: [
      "nope. it was {answer} obviously. I knew that.",
      "wrong!! haha. it's {answer}. not my fault.",
      "I didn't do anything. the answer is {answer}.",
      "eh, it was {answer}. I knew that already.",
      "that's not right. {answer} is correct. duh.",
      "lol nope. {answer}. I'm not explaining why.",
    ],
  },
} as const;

function pickComment(
  character: 'mia' | 'mimi',
  phase: 'question' | 'correct' | 'wrong',
  answer?: string
): string {
  const key = phase === 'correct' ? 'correct' : phase === 'wrong' ? 'wrong' : 'question';
  const arr: readonly string[] = COMMENTS[character][key];
  const template = arr[Math.floor(Math.random() * arr.length)];
  return answer ? template.replace('{answer}', answer) : template;
}
// --- end comments ---

type GamePhase = 'loading' | 'start' | 'playing' | 'result' | 'complete';

type Progress = {
  exp: number;
  level: number;
  nextLevelExp: number;
};

function getExpForLevel(level: number): number {
  if (level <= LEVEL_TABLE.length) return LEVEL_TABLE[level - 1];
  return 1350 + (level - 10) * 275;
}

function getQuestionTypeLabel(type: GameQuestion['type']): string {
  if (type === 'ja_select') return 'JP Meaning';
  if (type === 'en_select') return 'EN Word';
  return 'Fill in Blank';
}

function getQuestionTypeDescription(type: GameQuestion['type']): string {
  if (type === 'ja_select') return 'Choose the correct Japanese meaning';
  if (type === 'en_select') return 'Choose the correct English word';
  return 'Fill in the blank';
}

export default function GamePage() {
  const [vocabOwnerId] = useState(() => {
    if (typeof window === 'undefined') return '';
    const stored = localStorage.getItem('mia_vocab_owner_id');
    if (stored) return stored;
    const nextId = crypto.randomUUID();
    localStorage.setItem('mia_vocab_owner_id', nextId);
    return nextId;
  });
  const [phase, setPhase] = useState<GamePhase>('loading');
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [totalExpGained, setTotalExpGained] = useState(0);
  const [progress, setProgress] = useState<Progress>({ exp: 0, level: 1, nextLevelExp: 50 });
  const [leveledUp, setLeveledUp] = useState(false);
  const [savingExp, setSavingExp] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const totalExpRef = useRef(0);

  async function fetchProgress(id: string) {
    if (!id) return;
    const res = await fetch(`/api/game/exp?vocabOwnerId=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const data = await res.json();
    setProgress(data);
  }

  async function loadQuestions(id: string) {
    const res = await fetch(`/api/game/questions?vocabOwnerId=${encodeURIComponent(id)}`);
    if (!res.ok) {
      setQuestions([]);
      return;
    }
    const { questions: nextQuestions } = await res.json();
    setQuestions(Array.isArray(nextQuestions) ? nextQuestions : []);
  }

  useEffect(() => {
    if (!vocabOwnerId) return;
    const init = async () => {
      await Promise.all([fetchProgress(vocabOwnerId), loadQuestions(vocabOwnerId)]);
      setPhase('start');
    };
    init();
  }, [vocabOwnerId]);

  function showQuestion(idx: number, sourceQuestions = questions) {
    const question = sourceQuestions[idx];
    if (!question) return;

    setCurrentIdx(idx);
    setSelectedOption(null);
    setSaveState('idle');
    setComment(pickComment(question.character, 'question'));
    setPhase('playing');
  }

  async function startGame() {
    if (questions.length === 0) {
      setPhase('loading');
      await loadQuestions(vocabOwnerId);
      setPhase('start');
      return;
    }
    totalExpRef.current = 0;
    setScore(0);
    setTotalExpGained(0);
    setLeveledUp(false);
    showQuestion(0, questions);
  }

  function handleSelectAnswer(option: string) {
    if (phase !== 'playing' || selectedOption !== null) return;
    const question = questions[currentIdx];
    if (!question) return;

    const correct = option === question.answer;
    setSelectedOption(option);

    if (correct) {
      setScore((prev) => prev + 1);
      const gained = EXP_TABLE[question.type];
      totalExpRef.current += gained;
      setTotalExpGained(totalExpRef.current);
    }

    const answerLabel = question.answer ?? question.word;
    setComment(pickComment(question.character, correct ? 'correct' : 'wrong', answerLabel));
    setPhase('result');
  }

  async function handleNext() {
    if (phase !== 'result') return;

    const nextIdx = currentIdx + 1;
    if (nextIdx < questions.length) {
      showQuestion(nextIdx);
      return;
    }

    if (savingExp) return;

    setSavingExp(true);
    if (vocabOwnerId && totalExpRef.current > 0) {
      const res = await fetch('/api/game/exp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vocabOwnerId, expGained: totalExpRef.current }),
      });

      if (res.ok) {
        const data = await res.json();
        setProgress({ exp: data.exp, level: data.level, nextLevelExp: data.nextLevelExp });
        setLeveledUp(!!data.leveledUp);
      }
    }

    setSavingExp(false);
    setPhase('complete');
  }

  async function handleRestart() {
    setPhase('loading');
    totalExpRef.current = 0;
    setSelectedOption(null);
    setComment('');
    setSaveState('idle');
    await Promise.all([fetchProgress(vocabOwnerId), loadQuestions(vocabOwnerId)]);
    setPhase('start');
  }

  async function handleSaveCurrentWord() {
    if (!question || !vocabOwnerId || saveState === 'saving' || saveState === 'saved') return;

    setSaveState('saving');
    try {
      const res = await fetch('/api/vocab-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ phrase: question.word, translation: question.meaning }],
          sessionId: vocabOwnerId,
        }),
      });

      if (!res.ok) throw new Error('save failed');
      setSaveState('saved');
    } catch {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 2500);
      return;
    }

    setTimeout(() => setSaveState('idle'), 2500);
  }

  const question = questions[currentIdx];
  const prevLevelExp = getExpForLevel(progress.level);
  const expBarWidth =
    progress.nextLevelExp > prevLevelExp
      ? Math.min(100, Math.max(0, ((progress.exp - prevLevelExp) / (progress.nextLevelExp - prevLevelExp)) * 100))
      : 100;

  if (phase === 'loading') {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <div className="flex gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-2 w-2 animate-bounce rounded-full bg-purple-400"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
        <p className="mt-3 text-sm text-gray-500">Loading quiz...</p>
      </div>
    );
  }

  if (phase === 'start') {
    return (
      <div className="flex h-screen flex-col bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <header className="flex items-center px-5 py-4 backdrop-blur-sm bg-white/80 border-b border-purple-100 dark:bg-gray-800/90 dark:border-gray-700">
          <Link href="/" className="text-purple-500 transition-colors hover:text-purple-700">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </Link>
          <h1 className="mx-auto text-base font-bold text-gray-800 dark:text-gray-100">English Quiz</h1>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <div>
            <div className="text-5xl font-black text-purple-600 dark:text-purple-400">Lv.{progress.level}</div>
            <p className="mt-1 text-sm text-gray-500">EXP {progress.exp} / {progress.nextLevelExp}</p>
            <div className="mt-2 h-2 w-48 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div className="h-full rounded-full bg-purple-400 transition-all" style={{ width: `${expBarWidth}%` }} />
            </div>
          </div>

          <div className="flex items-end gap-6">
            {(['mia', 'mimi'] as const).map((character) => (
              <div key={character} className="flex flex-col items-center gap-1">
                <div className="h-16 w-16 overflow-hidden rounded-full shadow-md">
                  <CatAvatar variant={character} size={64} />
                </div>
                <span className="text-xs text-gray-500">{character === 'mia' ? 'Mia' : 'Mimi'}</span>
              </div>
            ))}
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">5-question challenge</h2>
            <p className="mt-1 text-sm text-gray-500">TOEIC 700 word quiz</p>
          </div>

          <div className="w-full max-w-xs space-y-3">
            <div className="flex justify-around text-center text-xs text-gray-500">
              <div><div className="font-bold text-purple-600">+10 EXP</div><div>JP meaning</div></div>
              <div><div className="font-bold text-purple-600">+15 EXP</div><div>EN word</div></div>
              <div><div className="font-bold text-purple-600">+25 EXP</div><div>Fill blank</div></div>
            </div>
            <button
              onClick={startGame}
              disabled={questions.length === 0}
              className="w-full rounded-2xl bg-purple-600 py-4 text-lg font-bold text-white shadow-lg transition-all hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
            >
              Start
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'complete') {
    return (
      <div className="flex h-screen flex-col bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <header className="flex items-center px-5 py-4 backdrop-blur-sm bg-white/80 border-b border-purple-100 dark:bg-gray-800/90 dark:border-gray-700">
          <Link href="/" className="text-purple-500 transition-colors hover:text-purple-700">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </Link>
          <h1 className="mx-auto text-base font-bold text-gray-800 dark:text-gray-100">Results</h1>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          {leveledUp && (
            <div className="rounded-2xl border border-yellow-300 bg-yellow-100 px-6 py-3 text-center dark:border-yellow-700 dark:bg-yellow-900/30">
              <div className="text-2xl">Level up!</div>
              <div className="font-bold text-yellow-700 dark:text-yellow-400">You reached Lv.{progress.level}</div>
            </div>
          )}

          <div className="text-center">
            <div className="text-6xl font-black text-purple-600 dark:text-purple-400">{score}/5</div>
            <p className="mt-1 text-gray-500">Correct answers</p>
          </div>

          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white/80 p-5 shadow-sm dark:bg-gray-800/80">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Gained</span>
              <span className="font-bold text-purple-600">+{totalExpGained} EXP</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Level</span>
              <span className="font-bold text-gray-800 dark:text-gray-100">Lv.{progress.level}</span>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-gray-400">
                <span>{progress.exp} EXP</span>
                <span>{progress.nextLevelExp} EXP</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div className="h-full rounded-full bg-purple-400 transition-all duration-700" style={{ width: `${expBarWidth}%` }} />
              </div>
            </div>
          </div>

          <div className="flex w-full max-w-sm flex-col gap-3">
            <button
              onClick={handleRestart}
              className="w-full rounded-2xl bg-purple-600 py-3 font-bold text-white shadow-md transition-all hover:bg-purple-700 active:scale-95"
            >
              Play again
            </button>
            <Link
              href="/"
              className="w-full rounded-2xl border border-purple-200 bg-white py-3 text-center font-bold text-purple-600 shadow-md transition-all active:scale-95 dark:border-gray-600 dark:bg-gray-700 dark:text-purple-300"
            >
              Back to chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="flex h-screen flex-col bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <header className="flex items-center gap-3 border-b border-purple-100 bg-white/80 px-5 py-3 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/90">
        <Link href="/" className="text-purple-400 transition-colors hover:text-purple-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </Link>

        <div className="mx-auto flex gap-1.5">
          {questions.map((_, idx) => (
            <span
              key={idx}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                idx < currentIdx ? 'bg-purple-500' : idx === currentIdx ? 'bg-purple-400' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>

        <span className="whitespace-nowrap text-xs font-bold text-purple-600 dark:text-purple-400">Lv.{progress.level}</span>
      </header>

      <div className="h-1 bg-gray-100 dark:bg-gray-700">
        <div className="h-full bg-purple-400 transition-all duration-500" style={{ width: `${expBarWidth}%` }} />
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-500 dark:bg-purple-900/30">
            {getQuestionTypeLabel(question.type)}
          </span>
          <span className="text-xs text-gray-400">Q{currentIdx + 1}/5 · +{EXP_TABLE[question.type]} EXP</span>
        </div>

        {/* Character comment bubble */}
        <div className={`flex items-end gap-3 ${question.character === 'mimi' ? 'flex-row-reverse' : 'flex-row'}`}>
          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full shadow-md">
            <CatAvatar variant={question.character} size={48} />
          </div>
          <div
            className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
              question.character === 'mia'
                ? 'rounded-bl-sm border border-purple-200 bg-purple-100 text-gray-800 dark:border-purple-700 dark:bg-purple-900/30 dark:text-gray-100'
                : 'rounded-br-sm border border-orange-200 bg-orange-100 text-gray-800 dark:border-orange-700 dark:bg-orange-900/20 dark:text-gray-100'
            }`}
          >
            <p>{comment}</p>
          </div>
        </div>

        {/* Question card */}
        <div className="rounded-2xl border border-purple-100 bg-white/90 p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800/90">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400">{getQuestionTypeDescription(question.type)}</p>
            <button
              onClick={handleSaveCurrentWord}
              disabled={saveState === 'saving' || saveState === 'saved'}
              className={`flex-shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                saveState === 'saved'
                  ? 'border-green-300 bg-green-50 text-green-600 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300'
                  : saveState === 'error'
                    ? 'border-red-200 bg-red-50 text-red-500 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300'
                    : 'border-purple-200 bg-purple-50 text-purple-500 hover:bg-purple-100 dark:border-purple-700 dark:bg-purple-900/20 dark:text-purple-300'
              } disabled:cursor-not-allowed disabled:opacity-80`}
            >
              {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Failed' : 'Save to notebook'}
            </button>
          </div>

          {question.type === 'ja_select' && (
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{question.word}</p>
            </div>
          )}

          {question.type === 'en_select' && (
            <div className="text-center">
              <p className="text-base font-semibold leading-relaxed text-gray-800 dark:text-gray-100 break-words">
                {question.meaning}
              </p>
            </div>
          )}

          {question.type === 'reorder' && (
            <div className="space-y-2 text-center">
              {/* Sentence with styled blank */}
              <p className="text-base font-semibold leading-relaxed text-gray-800 dark:text-gray-100">
                {question.sentence?.split('___').map((part, i, arr) => (
                  <span key={i}>
                    {part}
                    {i < arr.length - 1 && (
                      <span className="mx-1 inline-block min-w-[64px] border-b-2 border-purple-500 align-bottom text-purple-400">
                        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                      </span>
                    )}
                  </span>
                ))}
              </p>
              {/* Japanese translation as hint */}
              <p className="text-sm text-gray-500 dark:text-gray-400">{question.sentenceTranslation}</p>
            </div>
          )}
        </div>

        {/* Answer options — all types use the same 4-choice grid */}
        <div className="grid grid-cols-2 gap-3">
          {(question.options ?? []).map((option) => {
            let style =
              'border-gray-200 bg-white text-gray-800 hover:bg-purple-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600';

            if (phase === 'result') {
              if (option === question.answer) {
                style =
                  'border-green-400 bg-green-100 text-green-800 dark:border-green-600 dark:bg-green-900/30 dark:text-green-200';
              } else if (option === selectedOption) {
                style =
                  'border-red-400 bg-red-100 text-red-800 dark:border-red-600 dark:bg-red-900/30 dark:text-red-200';
              } else {
                style =
                  'border-gray-200 bg-white text-gray-400 opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-500';
              }
            }

            return (
              <button
                key={option}
                onClick={() => handleSelectAnswer(option)}
                disabled={phase !== 'playing'}
                className={`rounded-xl border px-3 py-4 text-sm font-medium shadow-sm transition-all ${style}`}
              >
                {option}
              </button>
            );
          })}
        </div>

        {phase === 'result' && (
          <button
            onClick={handleNext}
            disabled={savingExp}
            className="w-full rounded-2xl bg-purple-600 py-3 font-bold text-white shadow-md transition-all hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
          >
            {currentIdx + 1 >= questions.length ? (savingExp ? 'Saving...' : 'Finish') : 'Next'}
          </button>
        )}
      </div>
    </div>
  );
}
