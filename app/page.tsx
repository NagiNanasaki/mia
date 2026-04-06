'use client';

import { useState, useRef, useEffect } from 'react';
import ChatMessage, { Message } from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content:
    "Hiya! I'm Mia! 👋 Brilliant to meet you, mate! I'm absolutely mad about anime and love chatting with new people. I'm here to help you practise your English — don't be nervous, we'll just have a proper good chat! ✨\n\nSo, tell me about yourself — what are you into? Any anime fans here? 😄",
};

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (userText: string) => {
    const userMessage: Message = { role: 'user', content: userText };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsStreaming(true);

    // Add placeholder for streaming response
    const assistantPlaceholder: Message = { role: 'assistant', content: '' };
    setMessages([...updatedMessages, assistantPlaceholder]);

    try {
      // Build API messages (skip the initial greeting so the API sees only actual conversation turns)
      const apiMessages = updatedMessages
        .slice(1)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: accumulated,
          };
          return updated;
        });
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content:
            "Oh no, something went a bit dodgy there! 😅 Could you try sending that again, mate? Cheers!",
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-4 bg-white/80 backdrop-blur-sm border-b border-purple-100 shadow-sm">
        <div className="relative">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-2xl shadow-md">
            ✨
          </div>
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-800 leading-tight">Mia</h1>
          <p className="text-xs text-purple-500 font-medium">
            English practice buddy · Manchester, UK 🇬🇧
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400 bg-purple-50 px-3 py-1.5 rounded-full border border-purple-100">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
          Anime fan &amp; English helper
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        {messages.map((msg, idx) => (
          <ChatMessage key={idx} message={msg} />
        ))}

        {/* Typing indicator - show only when streaming and last message is empty */}
        {isStreaming && messages[messages.length - 1]?.content === '' && (
          <div className="flex items-end gap-2 mb-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-xl shadow-md">
              ✨
            </div>
            <div className="bg-purple-100 border border-purple-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-5">
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <footer className="px-4 pb-5 pt-3 bg-white/70 backdrop-blur-sm border-t border-purple-100">
        <div className="max-w-3xl mx-auto">
          <ChatInput onSend={sendMessage} disabled={isStreaming} />
          <p className="text-center text-xs text-gray-400 mt-2">
            Press{' '}
            <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-mono text-xs">
              Enter
            </kbd>{' '}
            to send ·{' '}
            <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-mono text-xs">
              Shift+Enter
            </kbd>{' '}
            for new line
          </p>
        </div>
      </footer>
    </div>
  );
}
