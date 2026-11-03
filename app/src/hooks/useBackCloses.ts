'use client';
import { useEffect, useRef } from 'react';
import { createBackStack } from '@/lib/back-stack';

let shared: ReturnType<typeof createBackStack> | null = null;
function stack() {
  if (typeof window === 'undefined') return null;
  return (shared ??= createBackStack(window));
}

/** While `open`, the browser Back button closes this overlay instead of leaving the page. */
export function useBackCloses(open: boolean, onClose: () => void, key: string) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!open) return;
    const s = stack();
    if (!s) return;
    const id = s.open(key, () => cb.current());
    return () => s.close(id);
  }, [open, key]);
}
