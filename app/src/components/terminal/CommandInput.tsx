"use client";

import React, { useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';

export interface CommandInputHandle {
  prefill: (text: string) => void;
  focus: () => void;
}

interface CommandInputProps {
  onSubmit: (input: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const CommandInput = forwardRef<CommandInputHandle, CommandInputProps>(function CommandInput({ onSubmit, disabled, placeholder }, ref) {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    prefill: (text: string) => {
      setValue(text);
      setHistoryIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    focus: () => inputRef.current?.focus(),
  }));

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;

    onSubmit(trimmed);

    // Add to history (avoid duplicates at the top)
    setHistory(prev => {
      const filtered = prev.filter(h => h !== trimmed);
      return [trimmed, ...filtered].slice(0, 50);
    });
    setHistoryIndex(-1);
    setValue('');
  }, [value, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // History navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const newIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(newIndex);
      setValue(history[newIndex]);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setValue('');
        return;
      }
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setValue(history[newIndex]);
      return;
    }
  }, [handleSubmit, history, historyIndex]);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t" style={{
      borderColor: 'rgba(34, 171, 148, 0.3)',
      backgroundColor: '#0d0d1a',
    }}>
      <span className="text-[13px] flex-shrink-0" style={{
        fontFamily: 'var(--font-terminal), Consolas, monospace',
        color: '#22ab94',
      }}>{'>'}</span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => { setValue(e.target.value); setHistoryIndex(-1); }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder || 'Type a message or /command...'}
        className="flex-1 bg-transparent outline-none text-[13px]"
        style={{
          fontFamily: 'var(--font-terminal), Consolas, monospace',
          color: '#ccc',
          caretColor: '#22ab94',
        }}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="text-[13px] px-2 py-1 uppercase tracking-wider transition-colors"
        style={{
          fontFamily: 'var(--font-terminal), Consolas, monospace',
          color: value.trim() ? '#22ab94' : 'rgba(34,171,148,0.3)',
          border: `1px solid ${value.trim() ? 'rgba(34,171,148,0.4)' : 'rgba(34,171,148,0.15)'}`,
          backgroundColor: 'transparent',
          borderRadius: '2px',
          cursor: value.trim() ? 'pointer' : 'default',
        }}
      >
        {'\u23CE'}
      </button>
    </div>
  );
});

export default CommandInput;
