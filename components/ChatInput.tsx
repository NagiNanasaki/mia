'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import StampPicker from './StampPicker';
import { STAMP_BY_NAME } from '@/lib/stamps';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [showStamps, setShowStamps] = useState(false);
  const [previewStamp, setPreviewStamp] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // 1st tap: show preview
  const handleStampSelect = (stampName: string) => {
    if (disabled) return;
    setShowStamps(false);
    setPreviewStamp(stampName);
  };

  // 2nd tap: send
  const handlePreviewSend = () => {
    if (!previewStamp || disabled) return;
    onSend(`[user-stamp:${previewStamp}]`);
    setPreviewStamp(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {showStamps && (
        <StampPicker
          onSelect={handleStampSelect}
          onClose={() => setShowStamps(false)}
        />
      )}

      {/* Stamp preview overlay (2-tap to send) */}
      {previewStamp && (() => {
        const info = STAMP_BY_NAME[previewStamp];
        if (!info) return null;
        return (
          <>
            {/* Backdrop — tap to cancel */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setPreviewStamp(null)}
            />
            {/* Preview card */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 z-50 mb-3 flex flex-col items-center gap-2">
              <button
                onClick={handlePreviewSend}
                className="flex flex-col items-center gap-2 p-4 rounded-3xl bg-white dark:bg-gray-800 shadow-2xl border-2 border-purple-300 dark:border-purple-600 active:scale-95 transition-transform"
                title="タップして送信"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/stamps/${info.file}`}
                  alt={info.label}
                  className="h-36 w-36 object-contain select-none"
                  draggable={false}
                />
                <span className="text-xs text-purple-500 dark:text-purple-300 font-semibold">タップして送信</span>
              </button>
            </div>
          </>
        );
      })()}
      <div className="flex items-end gap-2 bg-white dark:bg-gray-800 border border-purple-200 dark:border-gray-600 rounded-2xl p-3 shadow-sm focus-within:ring-2 focus-within:ring-purple-300 transition-all">
        {/* Stamp button */}
        <button
          onClick={() => setShowStamps((v) => !v)}
          disabled={disabled}
          className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            showStamps
              ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300'
              : 'text-gray-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-gray-700'
          }`}
          aria-label="スタンプを送る"
          title="スタンプ"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onFocus={() => setShowStamps(false)}
          disabled={disabled}
          placeholder="Type a message... (Enter to send)"
          rows={1}
          className="flex-1 resize-none bg-transparent text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-base outline-none leading-relaxed max-h-28 overflow-y-auto disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white flex items-center justify-center shadow-md hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          aria-label="Send message"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
