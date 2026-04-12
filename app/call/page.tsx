'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import CatAvatar from '@/components/CatAvatar';
import VocabSelectModal, { type VocabCandidate } from '@/components/VocabSelectModal';
import { pickFirstCharacter, type ChatCharacter } from '@/lib/chat-characters';
import {
  CALL_FOLLOW_UP_GREETINGS,
  CALL_GREETING_OPTIONS,
  CALL_VOICE_IDS,
  getOrCreateStoredId,
  pickRandomLine,
  sanitizeCallReply,
  toCallHistory,
} from '@/lib/call';

type CallStatus =
  | 'waiting-start'
  | 'connecting'
  | 'mia-speaking'
  | 'mimi-speaking'
  | 'user-turn'
  | 'listening'
  | 'processing'
  | 'ended';

type CallMessage = {
  character: ChatCharacter | 'user';
  content: string;
  id: string;
};

type RecognitionLike = {
  start: () => void;
  stop: () => void;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

const MOBILE_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
const SILENCE_DELAY_MS = 2000;

function getStatusLabel(status: CallStatus): string {
  switch (status) {
    case 'waiting-start':
      return 'Ready when you are';
    case 'connecting':
      return 'Connecting...';
    case 'mia-speaking':
      return 'Mia is speaking...';
    case 'mimi-speaking':
      return 'Mimi is speaking...';
    case 'user-turn':
      return 'Your turn';
    case 'listening':
      return 'Listening...';
    case 'processing':
      return 'Thinking...';
    case 'ended':
      return 'Call ended';
    default:
      return '';
  }
}

export default function CallPage() {
  const router = useRouter();
  const [status, setStatus] = useState<CallStatus>('waiting-start');
  const [messages, setMessages] = useState<CallMessage[]>([]);
  const [interimText, setInterimText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isUnsupported, setIsUnsupported] = useState(false);
  const [username, setUsername] = useState('');
  const [vocabCandidates, setVocabCandidates] = useState<VocabCandidate[] | null>(null);
  const [isExtractingVocab, setIsExtractingVocab] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<ChatCharacter | null>(null);

  const messagesRef = useRef<CallMessage[]>([]);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);
  const ownerIdRef = useRef('');
  const sessionIdRef = useRef('');
  const isMutedRef = useRef(false);
  const statusRef = useRef<CallStatus>('waiting-start');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const startedRef = useRef(false);

  const hasEnded = () => statusRef.current === 'ended';

  // globals.css sets overflow:hidden on body. Override for this page.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasSpeechRecognition = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    if (MOBILE_REGEX.test(window.navigator.userAgent) || !hasSpeechRecognition) {
      setIsUnsupported(true);
      router.replace('/');
      return;
    }

    ownerIdRef.current = getOrCreateStoredId('mia_vocab_owner_id');
    sessionIdRef.current = getOrCreateStoredId('mia_session_id');
    setUsername(localStorage.getItem('mia_username') ?? '');

    return () => {
      mountedRef.current = false;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current?.stop();
      audioRef.current?.pause();
      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
      }
    };
  }, [router]);

  const addMessage = (character: ChatCharacter | 'user', content: string) => {
    const cleaned = sanitizeCallReply(content);
    const nextMessage: CallMessage = {
      character,
      content: cleaned,
      id: crypto.randomUUID(),
    };

    messagesRef.current = [...messagesRef.current, nextMessage];
    setMessages(messagesRef.current);
  };

  const saveMessage = async (message: { role: 'user' | 'assistant'; content: string; character?: ChatCharacter | null }) => {
    if (!sessionIdRef.current) return;

    await supabase.from('messages').insert({
      session_id: sessionIdRef.current,
      role: message.role,
      content: message.content,
      character: message.character ?? null,
    });
  };

  const patchProfileSession = async () => {
    if (!ownerIdRef.current || !sessionIdRef.current) return;

    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner_id: ownerIdRef.current,
        last_session_id: sessionIdRef.current,
      }),
    }).catch(() => {});
  };

  const fetchTTSBlob = async (text: string, character: ChatCharacter): Promise<Blob | null> => {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId: CALL_VOICE_IDS[character] }),
    });

    if (!response.ok) return null;
    return response.blob();
  };

  const playBlob = async (blob: Blob | null, character: ChatCharacter) => {
    if (!blob || !mountedRef.current) return;

    setActiveSpeaker(character);
    setStatus(character === 'mia' ? 'mia-speaking' : 'mimi-speaking');

    const url = URL.createObjectURL(blob);
    currentAudioUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;

    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });

    audioRef.current = null;
    setActiveSpeaker(null);
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
  };

  const fetchCharacterReply = async (
    character: ChatCharacter,
    otherReply?: string
  ): Promise<string> => {
    const response = await fetch('/api/call/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: toCallHistory(messagesRef.current),
        character,
        otherReply,
        ownerID: ownerIdRef.current,
      }),
    });

    const data = await response.json() as { reply?: string };
    return sanitizeCallReply(data.reply ?? '');
  };

  const autoListen = () => {
    if (isMutedRef.current) return;
    if (!recognitionRef.current) return;

    const currentStatus = statusRef.current;
    if (currentStatus === 'processing' || currentStatus === 'mia-speaking' || currentStatus === 'mimi-speaking' || currentStatus === 'ended') {
      return;
    }

    try {
      recognitionRef.current.start();
      setStatus('listening');
    } catch {
      // Ignore duplicate start attempts.
    }
  };

  const sendUserMessage = async (text: string) => {
    const trimmed = sanitizeCallReply(text);
    if (!trimmed || !mountedRef.current) return;

    setInterimText('');
    addMessage('user', trimmed);
    await saveMessage({ role: 'user', content: trimmed, character: null });

    try {
      setStatus('processing');

      const first = pickFirstCharacter(trimmed);
      const second: ChatCharacter = first === 'mia' ? 'mimi' : 'mia';

      const firstReply = await fetchCharacterReply(first);
      if (!mountedRef.current || hasEnded()) return;

      addMessage(first, firstReply);
      await saveMessage({ role: 'assistant', content: firstReply, character: first });

      const firstTTSPromise = fetchTTSBlob(firstReply, first);
      const secondReplyPromise = fetchCharacterReply(second, firstReply);

      const firstBlob = await firstTTSPromise;
      if (hasEnded()) return;
      await playBlob(firstBlob, first);

      const secondReply = await secondReplyPromise;
      if (!mountedRef.current || hasEnded()) return;

      addMessage(second, secondReply);
      await saveMessage({ role: 'assistant', content: secondReply, character: second });

      const secondBlob = await fetchTTSBlob(secondReply, second);
      if (hasEnded()) return;
      await playBlob(secondBlob, second);

      if (!mountedRef.current || hasEnded()) return;

      setStatus('user-turn');
      autoListen();
    } catch {
      if (!mountedRef.current || hasEnded()) return;
      setStatus('user-turn');
    }
  };

  const initRecognition = () => {
    if (typeof window === 'undefined') return;
    if (recognitionRef.current) return;

    type RecognitionCtor = new () => RecognitionLike;

    const SpeechRecognitionCtor = (((window as Window & {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    }).SpeechRecognition)
      ?? ((window as Window & {
        SpeechRecognition?: RecognitionCtor;
        webkitSpeechRecognition?: RecognitionCtor;
      }).webkitSpeechRecognition)) as RecognitionCtor | undefined;

    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalTranscript = '';

    recognition.onresult = (event: unknown) => {
      const speechEvent = event as {
        results: ArrayLike<{
          isFinal: boolean;
          0: { transcript: string };
        }>;
      };

      finalTranscript = '';
      let interim = '';

      for (let index = 0; index < speechEvent.results.length; index++) {
        const result = speechEvent.results[index];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) finalTranscript += transcript;
        else interim += transcript;
      }

      setInterimText(`${finalTranscript}${interim}`.trim());

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        const combined = `${finalTranscript}${interim}`.trim();
        if (combined) recognition.stop();
      }, SILENCE_DELAY_MS);
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      const finalText = finalTranscript.trim();
      setInterimText('');
      finalTranscript = '';

      if (finalText) {
        void sendUserMessage(finalText);
        return;
      }

      if (!isMutedRef.current && mountedRef.current && (statusRef.current === 'listening' || statusRef.current === 'user-turn')) {
        autoListen();
      }
    };

    recognition.onerror = (event: { error?: string }) => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      if (event.error === 'not-allowed') {
        setStatus('ended');
        return;
      }

      if (!isMutedRef.current && mountedRef.current && (event.error === 'no-speech' || event.error === 'aborted')) {
        autoListen();
      }
    };

    recognitionRef.current = recognition;
  };

  const startCall = async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    try {
      initRecognition();
      await patchProfileSession();
      setStatus('connecting');

      const first: ChatCharacter = Math.random() < 0.5 ? 'mia' : 'mimi';
      const second: ChatCharacter = first === 'mia' ? 'mimi' : 'mia';

      const firstGreeting = pickRandomLine(CALL_GREETING_OPTIONS[first]);
      const secondGreeting = pickRandomLine(CALL_FOLLOW_UP_GREETINGS[second]);

      addMessage(first, firstGreeting);
      await saveMessage({ role: 'assistant', content: firstGreeting, character: first });
      if (hasEnded()) return;
      await playBlob(await fetchTTSBlob(firstGreeting, first), first);

      addMessage(second, secondGreeting);
      await saveMessage({ role: 'assistant', content: secondGreeting, character: second });
      if (hasEnded()) return;
      await playBlob(await fetchTTSBlob(secondGreeting, second), second);

      if (!mountedRef.current || hasEnded()) return;

      setStatus('user-turn');
      autoListen();
    } catch {
      if (!mountedRef.current || hasEnded()) return;
      setStatus('user-turn');
    }
  };

  const toggleMute = () => {
    const next = !isMutedRef.current;
    isMutedRef.current = next;
    setIsMuted(next);

    if (next) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current?.stop();
      setStatus('user-turn');
      return;
    }

    autoListen();
  };

  const endCall = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    recognitionRef.current?.stop();
    audioRef.current?.pause();
    setInterimText('');
    setActiveSpeaker(null);
    setStatus('ended');
  };

  const handleExtractVocab = async () => {
    const aiText = messagesRef.current
      .filter((message) => message.character === 'mia' || message.character === 'mimi')
      .map((message) => message.content)
      .join('\n');

    if (!aiText.trim()) {
      setVocabCandidates([]);
      return;
    }

    setIsExtractingVocab(true);
    try {
      const response = await fetch('/api/vocab-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: aiText }),
      });
      const data = await response.json() as { items?: VocabCandidate[] };
      setVocabCandidates(data.items ?? []);
    } catch {
      setVocabCandidates([]);
    } finally {
      setIsExtractingVocab(false);
    }
  };

  const handleVocabSave = async (selected: VocabCandidate[]) => {
    if (selected.length === 0) {
      setVocabCandidates(null);
      return;
    }

    await fetch('/api/vocab-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: selected,
        sessionId: ownerIdRef.current,
        source: 'call',
      }),
    });

    setVocabCandidates(null);
  };

  if (isUnsupported) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 px-4 py-6 text-gray-900">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Group Voice Call</h1>
            <p className="text-sm text-gray-500">Talk with Mia and Mimi in real time.</p>
          </div>
          <Link href="/" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 shadow-sm transition hover:border-purple-200 hover:text-purple-600">
            Back to chat
          </Link>
        </div>

        <div className="mb-4 rounded-3xl border border-white/70 bg-white/85 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">Status</p>
              <p className="mt-1 text-lg font-semibold">{getStatusLabel(status)}</p>
              {username && <p className="mt-1 text-sm text-gray-500">Calling as {username}</p>}
            </div>
            <div className="flex items-center gap-2">
              {status === 'waiting-start' ? (
                <button
                  onClick={() => void startCall()}
                  className="rounded-2xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-700"
                >
                  Start call
                </button>
              ) : (
                <>
                  <button
                    onClick={toggleMute}
                    disabled={status === 'ended'}
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${isMuted ? 'bg-gray-700 text-white hover:bg-gray-800' : 'bg-white text-gray-700 border border-gray-200 hover:border-purple-300 hover:text-purple-600'} disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {isMuted ? 'Unmute mic' : 'Mute mic'}
                  </button>
                  <button
                    onClick={endCall}
                    disabled={status === 'ended'}
                    className="rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    End call
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-lg backdrop-blur">
          <div className="mb-4 flex items-center gap-3">
            <div className={`overflow-hidden rounded-full shadow-md ring-2 ${activeSpeaker === 'mia' ? 'ring-purple-300' : 'ring-transparent'}`}>
              <CatAvatar variant="mia" size={48} />
            </div>
            <div className={`overflow-hidden rounded-full shadow-md ring-2 ${activeSpeaker === 'mimi' ? 'ring-orange-300' : 'ring-transparent'}`}>
              <CatAvatar variant="mimi" size={48} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">Live transcript</p>
              <p className="text-xs text-gray-400">
                {status === 'listening' ? 'Mic is live' : status === 'processing' ? 'AI is replying' : 'Waiting for the next turn'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {messages.map((message) => {
              const isUser = message.character === 'user';
              const isMia = message.character === 'mia';
              const label = isUser ? (username || 'You') : isMia ? 'Mia' : 'Mimi';

              return (
                <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    isUser
                      ? 'rounded-br-sm bg-gray-800 text-white'
                      : isMia
                        ? 'rounded-bl-sm border border-purple-200 bg-purple-100 text-gray-800'
                        : 'rounded-bl-sm border border-orange-200 bg-orange-100 text-gray-800'
                  }`}>
                    <p className="mb-1 text-[11px] font-semibold opacity-70">{label}</p>
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  </div>
                </div>
              );
            })}

            {interimText && status === 'listening' && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Listening</p>
                  <p className="whitespace-pre-wrap break-words">{interimText}</p>
                </div>
              </div>
            )}
          </div>

          {status === 'ended' && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => void handleExtractVocab()}
                  disabled={isExtractingVocab}
                  className="rounded-2xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isExtractingVocab ? 'Extracting...' : 'Save useful vocab'}
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="text-sm text-gray-500 transition hover:text-gray-700"
                >
                  Return to chat
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {vocabCandidates !== null && (
        <VocabSelectModal
          items={vocabCandidates}
          onSave={(selected) => void handleVocabSave(selected)}
          onClose={() => setVocabCandidates(null)}
        />
      )}
    </div>
  );
}
