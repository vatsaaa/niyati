import React from 'react';
import { Send } from 'lucide-react';

const ChatInput = ({ 
  value, 
  onChange, 
  onSubmit, 
  isLoading,
  placeholder = "Ask about your birth chart, compatibility, or life path..." 
}) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim() || isLoading) return;
    onSubmit(e);
  };

  return (
    <div className="p-4 bg-slate-900/90 border-t border-slate-700 rounded-b-2xl">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="bg-gradient-to-r from-purple-600 to-amber-600 hover:from-purple-700 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl shadow-md transition-all duration-200 flex items-center gap-2"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

export default ChatInput;
