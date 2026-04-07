'use client';

import { useState, useRef } from 'react';
import CatAvatar from './CatAvatar';
import Stamp from './Stamp';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  character?: 'mia' | 'mimi';
  created_at?: string;
}

interface ChatMessageProps {
  message: Message;
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
};

function formatTime(isoString?: string): string {
  const date = isoString ? new Date(isoString) : new Date();
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatMessage({ message, sessionId }: ChatMessageProps & { sessionId?: string }) {
  const isUser = message.role === 'user';
  const char = isUser ? null : CHARACTERS[message.character ?? 'mia'];

  const [isPlaying, setIsPlaying] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'none'>('idle');

  const handleSave = async () => {
    if (!sessionId || saveState !== 'idle') return;
    setSaveState('saving');
    const res = await fetch('/api/vocab-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: displayText.trim(), sessionId }),
    });
    const { saved } = await res.json();
    setSaveState(saved > 0 ? 'saved' : 'none');
    setTimeout(() => setSaveState('idle'), 2500);
  };

  const toggleTranslation = async () => {
    if (translation !== null) { setTranslation(null); return; }
    setIsTranslating(true);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message.content }),
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

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message.content, voiceId: char?.voiceId }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body || !activeRef.current) throw new Error('TTS failed');

      const supportsMediaSource =
        typeof MediaSource !== 'undefined' &&
        MediaSource.isTypeSupported('audio/mpeg');

      if (supportsMediaSource) {
        const mediaSource = new MediaSource();
        const url = URL.createObjectURL(mediaSource);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
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

        audio.play();
      } else {
        const blob = await res.blob();
        if (!activeRef.current) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          activeRef.current = false;
          setIsPlaying(false);
          URL.revokeObjectURL(url);
        };
        audio.play();
      }
    } catch {
      activeRef.current = false;
      setIsPlaying(false);
    }
  };

  // Parse [img:url] and [stamp:name] markers out of content
  const imgRegex = /\[img:(https?:\/\/[^\]]+)\]/g;
  const stampRegex = /\[stamp:([a-z]+)\]/gi;
  const images: string[] = [];
  const stamps: string[] = [];
  const displayText = message.content
    .replace(imgRegex, (_, url: string) => { images.push(url); return ''; })
    .replace(stampRegex, (_, name: string) => { stamps.push(name.toLowerCase()); return ''; })
    .trimStart();

  return (
    <div className={`flex items-end gap-2 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {!isUser && char && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden shadow-md">
          <CatAvatar variant={message.character ?? 'mia'} size={40} />
        </div>
      )}

      {/* Bubble + timestamp */}
      <div className={`flex flex-col gap-1 max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Character name label */}
        {!isUser && char && (
          <span className="text-[11px] font-semibold text-gray-500 px-1">{char.name}</span>
        )}

        <div
          className={`px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed ${
            isUser
              ? 'bg-indigo-600 text-white rounded-br-sm'
              : `${char?.bubbleBg} rounded-bl-sm border`
          }`}
        >
          {stamps.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {stamps.map((name, i) => <Stamp key={i} name={name} />)}
            </div>
          )}
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
          <div className="text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 leading-relaxed whitespace-pre-wrap">
            {translation}
          </div>
        )}

        {/* Timestamp + buttons row */}
        <div className={`flex items-center gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-[10px] text-gray-400">{formatTime(message.created_at)}</span>
          {!isUser && (
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
                className={`transition-colors ${saveState === 'saved' ? 'text-green-400' : saveState === 'none' ? 'text-gray-300' : 'text-gray-400 hover:text-purple-500'}`}
                title={saveState === 'saved' ? '保存しました' : saveState === 'none' ? '該当なし' : '単語帳に一括保存'}
              >
                {saveState === 'saving' ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
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

      {/* User avatar */}
      {isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden shadow-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/avatar-user.jpg" alt="you" width={40} height={40} style={{ width: 40, height: 40, objectFit: 'cover' }} />
        </div>
      )}
    </div>
  );
}
