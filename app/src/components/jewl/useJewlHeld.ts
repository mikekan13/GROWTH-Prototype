"use client";

/**
 * useJewlHeld — the one place a Watcher answers a ticket JEWL stopped the table on (Mike 2026-10-26).
 * TableSpeakBar and JewlInterruptPopup share it: post the answer to /reconcile, then on "continue" re-send the held
 * words to /table carrying the confirmed ticket. Also picks up a PENDING ticket on mount, so a reload (or the phone)
 * still lands on the question.
 */
import { useCallback, useEffect, useState } from 'react';

export interface JewlTicket {
  id: string;
  status: string;
  kinds: string[];
  summary: string;
  question: string;
  plan: Array<{ kind: string; name: string; matchId: string | null; matchName: string | null; baseKrma: number }>;
  estimateKrma: number;
  fluidKrma: number;
  message: string;
}

interface AnsweredTicket extends JewlTicket {
  created?: Array<{ kind: string; name: string }>;
  moved?: string[];
  bridge?: { elapsedMinutes: number; stepEventIds: string[] } | null;
  refusedReason?: string;
}

export function useJewlHeld(opts: {
  campaignId: string;
  /** Re-send the held words, now carrying the confirmed ticket. */
  resend: (message: string, ticketId: string) => Promise<void>;
  /** Put the words back in the speak box (take it back, or refused). */
  restoreWords: (message: string) => void;
  onNote: (note: string) => void;
}) {
  const { campaignId, resend, restoreWords, onNote } = opts;
  const [held, setHeld] = useState<JewlTicket | null>(null);
  const [answering, setAnswering] = useState(false);

  // A ticket still PENDING when the page opens (reload, phone) is open again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/reconcile?status=PENDING`);
        if (!res.ok) return; // not the Watcher, or nothing to say
        const json = (await res.json()) as { tickets?: JewlTicket[] };
        const pending = json.tickets?.[0];
        if (!cancelled && pending) setHeld((cur) => cur ?? pending);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [campaignId]);

  const answer = useCallback(async (action: 'confirm' | 'dismiss', words: string) => {
    if (!held || answering) return;
    setAnswering(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ticketId: held.id, ...(words.trim() ? { answer: words.trim() } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) { onNote(json.error ?? 'JEWL did not get that'); return; }
      const ticket = json.ticket as AnsweredTicket;
      const message = held.message;
      setHeld(null);
      if (action === 'dismiss') { restoreWords(message); return; }
      if (ticket.status === 'REFUSED') { onNote(ticket.refusedReason ?? 'The world cannot afford this.'); restoreWords(message); return; }
      const spun = (ticket.created ?? []).map((c) => c.name).join(', ');
      const moved = (ticket.moved ?? []).join(', ');
      const bridged = ticket.bridge ? `; the sim bridged the jump (${ticket.bridge.elapsedMinutes} min, ${ticket.bridge.stepEventIds.length} steps)` : '';
      if (spun || moved) onNote(`JEWL spun up ${spun || 'nothing new'}${moved ? `; ${moved} now there` : ''}${bridged} — holding ${ticket.estimateKrma} KRMA until it sticks`);
      await resend(message, ticket.id);
    } catch (err) {
      onNote(err instanceof Error ? err.message : String(err));
    } finally {
      setAnswering(false);
    }
  }, [held, answering, campaignId, resend, restoreWords, onNote]);

  return { held, setHeld, answering, answer };
}
