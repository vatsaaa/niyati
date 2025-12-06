import React from 'react';
import ChatMessage from './ChatMessage';

const MessageList = ({ messages, isLoading, messagesEndRef }) => {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
      {isLoading && (
        <div className="text-slate-500 text-xs p-4 animate-pulse">
          Niyati is consulting the stars...
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;
