'use client';

import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import ChatMessage, { Message } from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import CatAvatar from '@/components/CatAvatar';

const INITIAL_MESSAGES: Message[] = [
  {
    role: 'assistant',
    character: 'mia',
    content:
      "Hiya! I'm Mia! Brilliant to meet you, mate! I'm absolutely mad about anime and love chatting with new people. I'm here to help you practise your English — don't be nervous, we'll just have a proper good chat! (^▽^)\n\nSo, tell me about yourself — what are you into? Any anime fans here?",
  },
  {
    role: 'assistant',
    character: 'mimi',
    content:
      "YO!! I'm Mimi!! (≧▽≦) Mia's my bestie and we're BOTH here to hype you up!! omg this is gonna be SO fun — don't be shy ok!! What anime have you been watching lately?? I NEED to know (ﾟ∀ﾟ)",
  },
];

function getSessionId(): string {
  let id = localStorage.getItem('mia_session_id');
  if (!id) {
    id = uuidv4();
    localStorage.setItem('mia_session_id', id);
  }
  return id;
}

// Build Claude API messages for a specific character
function buildApiMessages(
  history: Message[],
  character: 'mia' | 'mimi',
  otherCharacterResponse?: string
) {
  // Keep user messages + this character's assistant messages only
  const filtered = history
    .filter((m) => m.role === 'user' || m.character === character)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // For mimi, append mia's current response as context in the last user message
  if (character === 'mimi' && otherCharacterResponse) {
    const lastUserIdx = filtered.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx >= 0) {
      filtered[lastUserIdx] = {
        role: 'user',
        content: `${filtered[lastUserIdx].content}\n\n(Mia just said: "${otherCharacterResponse}")`,
      };
    }
  }

  return filtered;
}

async function streamResponse(
  apiMessages: { role: 'user' | 'assistant'; content: string }[],
  character: 'mia' | 'mimi',
  onChunk: (accumulated: string) => void
): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: apiMessages, character }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    accumulated += decoder.decode(value, { stream: true });
    onChunk(accumulated);
  }

  return accumulated;
}

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingCharacter, setStreamingCharacter] = useState<'mia' | 'mimi' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionIdRef = useRef<string>('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const sessionId = getSessionId();
      sessionIdRef.current = sessionId;

      const { data, error } = await supabase
        .from('messages')
        .select('role, content, character, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        setMessages(
          data.map((m) => ({
            ...m,
            character: (m.character as 'mia' | 'mimi') ?? 'mia',
          }))
        );
      } else {
        setMessages(INITIAL_MESSAGES);
      }
      setIsLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveMessage = async (msg: { role: string; content: string; character?: string }) => {
    await supabase.from('messages').insert({
      session_id: sessionIdRef.current,
      role: msg.role,
      content: msg.content,
      character: msg.character ?? null,
    });
  };

  const isInitialMessages = (msgs: Message[]) =>
    msgs.length === INITIAL_MESSAGES.length &&
    msgs.every((m, i) => m.content === INITIAL_MESSAGES[i].content);

  const sendMessage = async (userText: string) => {
    const userMessage: Message = {
      role: 'user',
      content: userText,
      created_at: new Date().toISOString(),
    };
    const historyBase = isInitialMessages(messages) ? [] : messages;
    const updatedMessages = [...historyBase, userMessage];
    setMessages(updatedMessages);
    setIsStreaming(true);

    await saveMessage({ role: 'user', content: userText });

    // === Mia responds first ===
    setStreamingCharacter('mia');
    const miaPlaceholder: Message = { role: 'assistant', character: 'mia', content: '' };
    setMessages([...updatedMessages, miaPlaceholder]);

    let miaResponse = '';
    try {
      const miaApiMessages = buildApiMessages(updatedMessages, 'mia');
      miaResponse = await streamResponse(miaApiMessages, 'mia', (accumulated) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', character: 'mia', content: accumulated };
          return updated;
        });
      });

      const now = new Date().toISOString();
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', character: 'mia', content: miaResponse, created_at: now };
        return updated;
      });
      await saveMessage({ role: 'assistant', content: miaResponse, character: 'mia' });
    } catch (err) {
      console.error(err);
      miaResponse = "Oh no, something went a bit dodgy there! (＞＜) Could you try sending that again, mate? Cheers!";
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', character: 'mia', content: miaResponse };
        return updated;
      });
    }

    // === Mimi responds second ===
    setStreamingCharacter('mimi');
    const afterMia = [...updatedMessages, { role: 'assistant' as const, character: 'mia' as const, content: miaResponse }];
    const mimiPlaceholder: Message = { role: 'assistant', character: 'mimi', content: '' };
    setMessages([...afterMia, mimiPlaceholder]);

    try {
      const mimiApiMessages = buildApiMessages(updatedMessages, 'mimi', miaResponse);
      const mimiResponse = await streamResponse(mimiApiMessages, 'mimi', (accumulated) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', character: 'mimi', content: accumulated };
          return updated;
        });
      });

      const now = new Date().toISOString();
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', character: 'mimi', content: mimiResponse, created_at: now };
        return updated;
      });
      await saveMessage({ role: 'assistant', content: mimiResponse, character: 'mimi' });
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          character: 'mimi',
          content: "omg something broke lol (｡>﹏<｡) sorry!! try again??",
        };
        return updated;
      });
    }

    setIsStreaming(false);
    setStreamingCharacter(null);
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-4 bg-white/80 backdrop-blur-sm border-b border-purple-100 shadow-sm">
        <div className="flex -space-x-2">
          <div className="w-11 h-11 rounded-full overflow-hidden shadow-md border-2 border-white z-10">
            <CatAvatar variant="mia" size={44} />
          </div>
          <div className="w-11 h-11 rounded-full overflow-hidden shadow-md border-2 border-white">
            <CatAvatar variant="mimi" size={44} />
          </div>
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-800 leading-tight">Mia &amp; Mimi</h1>
          <p className="text-xs text-purple-500 font-medium">
            Your English practice squad ·
            <span className="text-purple-400"> Manchester, UK</span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400 bg-purple-50 px-3 py-1.5 rounded-full border border-purple-100">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
          Anime fans &amp; English helpers
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex gap-1 items-center text-purple-400">
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <ChatMessage key={idx} message={msg} />
            ))}

            {/* Typing indicator */}
            {isStreaming && messages[messages.length - 1]?.content === '' && streamingCharacter && (
              <div className="flex items-end gap-2 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden shadow-md">
                  <CatAvatar variant={streamingCharacter} size={40} />
                </div>
                <div className={`rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border ${
                  streamingCharacter === 'mia'
                    ? 'bg-purple-100 border-purple-200'
                    : 'bg-orange-100 border-orange-200'
                }`}>
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <footer className="px-4 pb-5 pt-3 bg-white/70 backdrop-blur-sm border-t border-purple-100">
        <div className="max-w-3xl mx-auto">
          <ChatInput onSend={sendMessage} disabled={isStreaming || isLoading} />
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
