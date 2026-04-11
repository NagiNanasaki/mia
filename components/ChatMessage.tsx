'use client';

import { useState, useRef } from 'react';
import CatAvatar from './CatAvatar';
import Stamp from './Stamp';
import VocabSelectModal, { type VocabCandidate } from './VocabSelectModal';
import { STAMP_BY_NAME } from '@/lib/stamps';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  character?: 'mia' | 'mimi' | 'hint';
  created_at?: string;
}

interface ChatMessageProps {
  message: Message;
  vocabOwnerId?: string;
}

const CHARACTERS = {
  mia: {
    voiceId: 'mHX7OoPk2G45VMAuinIt',
    avatar: '✨',
    avatarBg: 'from-purple-400 to-pink-400',
    bubbleBg: 'bg-purple-100 border-purple-200 text-gray-800',
    name: 'Mia',
  },
  mimi: {
    voiceId: 'hO2yZ8lxM3axUxL8OeKX',
    avatar: '🔥',
    avatarBg: 'from-orange-400 to-pink-500',
    bubbleBg: 'bg-orange-100 border-orange-200 text-gray-800',
    name: 'Mimi',
  },
  hint: {
    voiceId: '',
    avatar: '💡',
    avatarBg: 'from-teal-400 to-green-400',
    bubbleBg: 'bg-teal-50 border-teal-200 text-gray-800',
    name: 'hint君',
  },
};

function formatTime(isoString?: string): string {
  const date = isoString ? new Date(isoString) : new Date();
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatMessage({ message, vocabOwnerId }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const char = isUser ? null : CHARACTERS[message.character ?? 'mia'];

  const [isPlaying, setIsPlaying] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'extracting' | 'selecting' | 'saving' | 'saved' | 'none'>('idle');
  const [vocabCandidates, setVocabCandidates] = useState<VocabCandidate[]>([]);

  const handleSave = async () => {
    if (!vocabOwnerId || saveState !== 'idle') return;
    const text = displayText.trim();
    if (!text) return;
    setSaveState('extracting');
    try {
      const res = await fetch('/api/vocab-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        setSaveState('none');
        setTimeout(() => setSaveState('idle'), 2500);
        return;
      }
      const { items } = await res.json();
      if (!items || items.length === 0) {
        setSaveState('none');
        setTimeout(() => setSaveState('idle'), 2500);
        return;
      }
      setVocabCandidates(items);
      setSaveState('selecting');
    } catch {
      setSaveState('none');
      setTimeout(() => setSaveState('idle'), 2500);
    }
  };

  const handleVocabSave = async (selected: VocabCandidate[]) => {
    setSaveState('saving');
    setVocabCandidates([]);
    if (selected.length === 0) { setSaveState('idle'); return; }
    try {
      await fetch('/api/vocab-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selected, sessionId: vocabOwnerId }),
      });
      setSaveState('saved');
    } catch {
      setSaveState('idle');
      return;
    }
    setTimeout(() => setSaveState('idle'), 2500);
  };

  const toggleTranslation = async () => {
    if (translation !== null) { setTranslation(null); return; }
    setIsTranslating(true);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message.content, character: message.character ?? null }),
      });
      const { result } = await res.json();
      setTranslation(result);
    } catch {
      setTranslation('翻訳できませんでした');
    } finally {
      setIsTranslating(false);
    }
  };

  const activeRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // iOS requires audio.play() to be called synchronously within a user gesture.
  // After await fetch(), the gesture context is lost and play() gets blocked.
  // Fix: create the Audio element and call play() immediately (sync) to unlock it,
  // then swap in the real src after fetch completes.
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  // Minimal silent WAV — used to unlock iOS audio in the gesture context
  const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

  const toggleAudio = async () => {
    if (activeRef.current) {
      activeRef.current = false;
      abortRef.current?.abort();
      audioRef.current?.pause();
      audioRef.current = null;
      setIsPlaying(false);
      return;
    }

    activeRef.current = true;
    setIsPlaying(true);
    const controller = new AbortController();
    abortRef.current = controller;

    // iOS: unlock audio synchronously before any await
    let audio: HTMLAudioElement | null = null;
    if (isIOS) {
      audio = new Audio(SILENT_WAV);
      audioRef.current = audio;
      audio.play().catch(() => {});
    }

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message.content, voiceId: char?.voiceId }),
        signal: controller.signal,
      });
      if (!res.ok || !activeRef.current) throw new Error('TTS failed');

      const supportsMediaSource =
        !isIOS &&
        typeof MediaSource !== 'undefined' &&
        MediaSource.isTypeSupported('audio/mpeg');

      if (supportsMediaSource) {
        if (!res.body) throw new Error('No body');
        const mediaSource = new MediaSource();
        const url = URL.createObjectURL(mediaSource);
        const msAudio = new Audio(url);
        audioRef.current = msAudio;
        msAudio.onended = () => {
          activeRef.current = false;
          setIsPlaying(false);
          URL.revokeObjectURL(url);
        };
        mediaSource.addEventListener('sourceopen', () => {
          const sb = mediaSource.addSourceBuffer('audio/mpeg');
          const reader = res.body!.getReader();
          const pump = () => {
            reader.read().then(({ done, value }) => {
              if (!activeRef.current) { reader.cancel(); mediaSource.endOfStream(); return; }
              if (done) { mediaSource.endOfStream(); return; }
              sb.appendBuffer(value);
            });
          };
          sb.addEventListener('updateend', pump);
          pump();
        });
        msAudio.play();
      } else {
        // Blob path (always used on iOS)
        const blob = await res.blob();
        if (!activeRef.current) return;
        const url = URL.createObjectURL(blob);

        if (isIOS && audio) {
          // Reuse the already-unlocked audio element
          audio.pause();
          audio.src = url;
          audio.load();
          audio.onended = () => {
            activeRef.current = false;
            setIsPlaying(false);
            URL.revokeObjectURL(url);
          };
          await audio.play();
        } else {
          const blobAudio = new Audio(url);
          audioRef.current = blobAudio;
          blobAudio.onended = () => {
            activeRef.current = false;
            setIsPlaying(false);
            URL.revokeObjectURL(url);
          };
          blobAudio.play();
        }
      }
    } catch {
      activeRef.current = false;
      setIsPlaying(false);
    }
  };

  // Parse markers: [img:url], [stamp:name] (emoji), [sticker:name] (AI image), [user-stamp:name] (user image)
  const imgRegex = /\[img:(https?:\/\/[^\]]+)\]/g;
  const stampRegex = /\[stamp:\s*([a-zA-Z]+)\s*\]/g;
  const stickerRegex = /\[sticker:\s*([a-zA-Z0-9]+)\s*\]/g;
  const userStampRegex = /\[user-stamp:\s*([a-zA-Z0-9]+)\s*\]/g;
  const images: string[] = [];
  const stamps: string[] = [];
  const stickers: string[] = [];   // AI image stickers
  const userStamps: string[] = []; // user image stamps

  // Check if message is purely a user-stamp (no other content)
  const isUserStampOnly = isUser && /^\[user-stamp:[a-zA-Z0-9]+\]$/.test(message.content.trim());

  const displayText = message.content
    .replace(imgRegex, (_, url: string) => { images.push(url); return ''; })
    .replace(stampRegex, (_, name: string) => { stamps.push(name.toLowerCase()); return ''; })
    .replace(stickerRegex, (_, name: string) => { stickers.push(name); return ''; })
    .replace(userStampRegex, (_, name: string) => { userStamps.push(name); return ''; })
    .trimStart();

  const hasText = !!(displayText.trim() || images.length > 0);
  const hasStamps = stamps.length > 0;
  const hasStickers = stickers.length > 0;
  const hasUserStamps = userStamps.length > 0;

  const isHint = message.character === 'hint';

  const avatar = !isUser && char ? (
    isHint ? (
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-green-400 flex items-center justify-center shadow-md text-xl">
        💡
      </div>
    ) : (
      <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden shadow-md">
        <CatAvatar variant={message.character as 'mia' | 'mimi'} size={40} />
      </div>
    )
  ) : null;

  const userAvatar = isUser ? (
    <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden shadow-md">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/avatar-user.jpg" alt="you" width={40} height={40} style={{ width: 40, height: 40, objectFit: 'cover' }} />
    </div>
  ) : null;

  return (
    <>
    {saveState === 'selecting' && (
      <VocabSelectModal
        items={vocabCandidates}
        onSave={handleVocabSave}
        onClose={() => setSaveState('idle')}
      />
    )}

    {/* User image stamp (LINE-style) */}
    {hasUserStamps && (
      <div className={`flex items-end gap-2 ${hasText ? 'mb-1' : 'mb-4'} ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {avatar}
        <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
          <div className="flex flex-wrap gap-2">
            {userStamps.slice(0, 1).map((name, i) => {
              const info = STAMP_BY_NAME[name];
              if (!info) return null;
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={`/stamps/${info.file}`}
                  alt={info.label}
                  className="h-24 w-24 object-contain select-none"
                  draggable={false}
                />
              );
            })}
          </div>
          {!hasText && (
            <span className="text-[10px] text-gray-400">{formatTime(message.created_at)}</span>
          )}
        </div>
        {userAvatar}
      </div>
    )}

    {/* AI image sticker row ([sticker:name]) */}
    {hasStickers && (
      <div className={`flex items-end gap-2 ${hasText || hasStamps ? 'mb-1' : 'mb-4'} ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {avatar}
        <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
          {!isUser && char && (
            <span className="text-[11px] font-semibold text-gray-500 px-1">{char.name}</span>
          )}
          <div className="flex flex-wrap gap-2">
            {stickers.slice(0, 1).map((name, i) => {
              const info = STAMP_BY_NAME[name];
              if (!info) return null;
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={`/stamps/${info.file}`}
                  alt={info.label}
                  className="h-24 w-24 object-contain select-none"
                  draggable={false}
                />
              );
            })}
          </div>
          {!hasText && !hasStamps && (
            <span className="text-[10px] text-gray-400">{formatTime(message.created_at)}</span>
          )}
        </div>
        {userAvatar}
      </div>
    )}

    {/* AI emoji stamp row */}
    {hasStamps && (
      <div className={`flex items-end gap-2 ${hasText ? 'mb-1' : 'mb-4'} ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {avatar}
        <div className={`flex flex-col gap-1 max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
          {!isUser && char && (
            <span className="text-[11px] font-semibold text-gray-500 px-1">{char.name}</span>
          )}
          <div className="flex flex-wrap gap-2">
            {stamps.slice(0, 1).map((name, i) => <Stamp key={i} name={name} />)}
          </div>
          {/* Timestamp on stamp row only when no text follows */}
          {!hasText && (
            <span className="text-[10px] text-gray-400">{formatTime(message.created_at)}</span>
          )}
        </div>
        {userAvatar}
      </div>
    )}

    {/* Text / image row (skip if message was purely a user-stamp) */}
    {hasText && !isUserStampOnly && (
      <div className={`flex items-end gap-2 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {avatar}
        <div className={`flex flex-col gap-1 max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
          {/* Character name only when no stamp row above */}
          {!isUser && char && !hasStamps && (
            <span className="text-[11px] font-semibold text-gray-500 px-1">{char.name}</span>
          )}

          <div
            className={`px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed ${
              isUser
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : `${char?.bubbleBg} rounded-bl-sm border dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100`
            }`}
          >
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {images.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={`/api/image-proxy?url=${encodeURIComponent(url)}`}
                    alt=""
                    className="rounded-xl max-h-40 object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ))}
              </div>
            )}
            <p className="whitespace-pre-wrap break-words">{displayText}</p>
          </div>

          {/* Translation hint */}
          {!isUser && translation !== null && (
            <div className="text-xs text-gray-600 dark:text-gray-300 bg-yellow-50 dark:bg-gray-700 border border-yellow-200 dark:border-gray-600 rounded-xl px-3 py-2 leading-relaxed whitespace-pre-wrap">
              {translation}
            </div>
          )}

          {/* Timestamp + buttons row */}
          <div className={`flex items-center gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
            <span className="text-[10px] text-gray-400">{formatTime(message.created_at)}</span>
            {!isUser && !isHint && (
              <>
                <button
                  onClick={toggleAudio}
                  className="text-purple-400 hover:text-purple-600 transition-colors"
                  title="Read aloud"
                >
                  {isPlaying ? (
                    <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                  )}
                </button>
                <button
                  onClick={toggleTranslation}
                  className={`text-xs font-bold transition-colors ${translation !== null ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-yellow-500'}`}
                  title="日本語訳を見る"
                >
                  {isTranslating ? '...' : '訳'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveState !== 'idle'}
                  className={`transition-colors text-xs ${saveState === 'saved' ? 'text-green-400' : saveState === 'none' ? 'text-gray-400' : 'text-gray-400 hover:text-purple-500'}`}
                  title={saveState === 'saved' ? '保存しました' : saveState === 'none' ? '単語なし' : '単語を選んで保存'}
                >
                  {(saveState === 'extracting' || saveState === 'saving') ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  ) : saveState === 'none' ? (
                    <span>単語なし</span>
                  ) : saveState === 'saved' ? (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17 3H7a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2z"/></svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 3H7a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2z"/></svg>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
        {userAvatar}
      </div>
    )}
    </>
  );
}
