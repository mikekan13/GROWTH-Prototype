/**
 * FINDING 62a (ruling assumed 2026-11-05): a character is WATCHER-VOICED from the moment the Watcher gives it SPEECH (a quote with that
 * speaker) or a first-person DEED (an `::action::` written for it) until the session ends. Narrating ABOUT a character ("Violet didn't
 * answer what she wanted") does not voice it; thoughts alone do not either (a thought is a being's own to have). Pure.
 */

/** The beings a Watcher line voices: speakers of its quotes and actors of its non-owned actions. */
export function voicedByLine(parsed: { actions?: Array<{ actorId: string; owned?: boolean }>; quotes?: Array<{ speakerId: string | null }> }): string[] {
  return [...new Set([
    ...(parsed.quotes ?? []).map((q) => q.speakerId).filter((id): id is string => !!id),
    ...(parsed.actions ?? []).filter((a) => !a.owned && !!a.actorId).map((a) => a.actorId),
  ])];
}

/** The same, read back from a recorded declaration payload (speech rows carry speakerId or actorId; actions carry actorId, owned = not a deed). */
export function voicedByDeclaration(p: { speech?: Array<{ speakerId?: string | null; actorId?: string | null }>; actions?: Array<{ actorId?: string | null; owned?: boolean }> } | null | undefined): string[] {
  if (!p) return [];
  return [...new Set([
    ...(Array.isArray(p.speech) ? p.speech : []).map((s) => s.speakerId ?? s.actorId).filter((id): id is string => !!id),
    ...(Array.isArray(p.actions) ? p.actions : []).filter((a) => !a.owned && !!a.actorId).map((a) => a.actorId as string),
  ])];
}
