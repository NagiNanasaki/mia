'use client';

import { useState, useRef } from 'react';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

interface ChatMessageProps {
  message: Message;
}

function formatTime(isoString?: string): string {
  const date = isoString ? new Date(isoString) : new Date();
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [isPlaying, setIsPlaying] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

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
    // 再生中なら止める
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
        body: JSON.stringify({ text: message.content }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body || !activeRef.current) throw new Error('TTS failed');

      const supportsMediaSource =
        typeof MediaSource !== 'undefined' &&
        MediaSource.isTypeSupported('audio/mpeg');

      if (supportsMediaSource) {
        // ストリーミング再生（Chrome / Android）
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
        // フォールバック: blob再生（iOS Safari）
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

  return (
    <div className={`flex items-end gap-2 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-xl shadow-md">
          ✨
        </div>
      )}

      {/* Bubble + timestamp */}
      <div className={`flex flex-col gap-1 max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed ${
            isUser
              ? 'bg-indigo-600 text-white rounded-br-sm'
              : 'bg-purple-100 text-gray-800 rounded-bl-sm border border-purple-200'
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
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
            </>
          )}
        </div>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-blue-400 flex items-center justify-center text-xl shadow-md">
          🙂
        </div>
      )}
    </div>
  );
}
