"use client";

import { useEffect, useState } from 'react';
import type { CharacterSheetFacts } from '@/lib/character-sheet-facts';
import type { InventoryTiers } from '@/services/inventory';

/**
 * Live reads behind the character card / sheet / Tapestry tab (2026-10-12
 * audit): the blocks genesis made (+ age, TKV, memories, vines) and the
 * 3-tier inventory. `null` while loading or when the read is refused.
 * Refetches when `growth:character-facts-refresh` fires for this id.
 */
function useJson<T>(url: string | null, characterId: string | null | undefined): { data: T | null; loaded: boolean } {
  const [state, setState] = useState<{ url: string | null; data: T | null; loaded: boolean }>({ url: null, data: null, loaded: false });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!characterId) return;
    const onRefresh = (e: Event) => {
      const id = (e as CustomEvent<{ characterId?: string }>).detail?.characterId;
      if (!id || id === characterId) setTick(t => t + 1);
    };
    window.addEventListener('growth:character-facts-refresh', onRefresh);
    return () => window.removeEventListener('growth:character-facts-refresh', onRefresh);
  }, [characterId]);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const json = res.ok ? ((await res.json()) as T) : null;
        if (!cancelled) setState({ url, data: json, loaded: true });
      } catch {
        if (!cancelled) setState({ url, data: null, loaded: true });
      }
    })();
    return () => { cancelled = true; };
  }, [url, tick]);

  return state.url === url ? { data: state.data, loaded: state.loaded } : { data: null, loaded: false };
}

export function useCharacterSheetFacts(characterId: string | null | undefined, enabled = true) {
  const url = characterId && enabled ? `/api/characters/${characterId}/blocks` : null;
  return useJson<CharacterSheetFacts>(url, characterId);
}

export function useCharacterInventory(characterId: string | null | undefined, enabled = true) {
  const url = characterId && enabled ? `/api/characters/${characterId}/inventory` : null;
  const r = useJson<{ inventory: InventoryTiers }>(url, characterId);
  return { data: r.data?.inventory ?? null, loaded: r.loaded };
}
