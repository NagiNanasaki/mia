'use client';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-end gap-2 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-xl shadow-md">
          ✨
        </div>
      )}

      {/* Bubble */}
      <div
        className={`max-w-[75%] px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-purple-100 text-gray-800 rounded-bl-sm border border-purple-200'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>

      {/* User avatar placeholder */}
      {isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-blue-400 flex items-center justify-center text-xl shadow-md">
          🙂
        </div>
      )}
    </div>
  );
}
