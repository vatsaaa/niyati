import React from 'react';
import { Sparkles } from 'lucide-react';

const ChatMessage = ({ message, isLoading }) => {
  const isBot = message.sender === 'bot';

  return (
    <div className={`message ${isBot ? 'bot-message' : 'user-message'} flex gap-3 ${!isBot ? 'justify-end' : ''} animate-fade-in`}>
      {isBot && (
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-amber-500 flex items-center justify-center shadow-md flex-shrink-0">
          <Sparkles className="text-white w-5 h-5" />
        </div>
      )}
      <div className={`max-w-[75%] rounded-2xl px-5 py-3 shadow-md ${isBot
          ? 'bg-slate-800/80 border border-slate-700/50 text-slate-200'
          : 'bg-gradient-to-r from-purple-600 to-amber-600 text-white'
        }`}>
        {/* Render image if present */}
        {message.image && (
          <div className="mb-3">
            <img
              src={message.image}
              alt="Payment QR Code"
              className="rounded-lg max-w-full h-auto border border-slate-600"
              style={{ maxHeight: '250px' }}
            />
          </div>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>
        {isLoading && isBot && (
          <div className="flex gap-1 mt-2">
            <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        )}
        <p className="text-xs opacity-60 mt-1">
          {message.timestamp ? message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </p>
      </div>
    </div>
  );
};

export default ChatMessage;
