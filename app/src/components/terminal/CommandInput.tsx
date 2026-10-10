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

  // Same slot and look as the TABLE speak bar (drawer v7, 2026-10-08).
  const empty = !value.trim();
  return (
    <div style={{ flex: 'none', backgroundColor: '#fafaf8', borderTop: '3px solid #000', padding: '8px 10px 10px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value); setHistoryIndex(-1); }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder || 'Type a message or /command...'}
          // 16px below md: anything smaller makes iOS zoom the page on focus.
          className="text-[16px] md:text-[14px]"
          style={{
            flex: 1, minWidth: 0, height: 48, outline: 0,
            fontFamily: 'var(--font-comfortaa), Comfortaa, sans-serif',
            color: '#000', backgroundColor: '#fff', border: 0, borderLeft: '4px solid #002f6c', padding: '6px 8px',
            caretColor: '#002f6c',
          }}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || empty}
          style={{
            width: 68, minHeight: 36, border: 0, cursor: empty ? 'default' : 'pointer',
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.06em',
            backgroundColor: '#002f6c', color: '#ffcc78', opacity: disabled || empty ? 0.55 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
});

export default CommandInput;
