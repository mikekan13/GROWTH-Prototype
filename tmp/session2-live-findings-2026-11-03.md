# Session 2 live (composer build) — findings, logged while Michael plays

Session cmw0f79vn00002o48rk9varj1, started 08:22:58 (DB time). Production :3001, built at daf2202. Michael: "Hope you are logging all this... Lots of mistakes."

Fix nothing live: the source can change, but :3001 is rebuilt only after the session.

## Seen so far

1. **A placeholder leaked onto the page.** Kristopher's far-side card: "I don't know if I expect Person-A to come to the door".
   - The voice order swapped 0 names, so "Person-A" was already in the local plan's gist.
   - Likely cause: the order prompts show "Person-A, Place-B, Thing-C" as examples. A call with no person names in its text (the far-side beat's event is "Her phone rings.") lets the model borrow "Person-A" for Violet. With nothing in the map, it is never swapped back.
   - Worse case: where the map DOES hold a Person-A, the borrowed placeholder is silently restored as the WRONG person.
   - FIX: no concrete example placeholders in the prompts. After translateBack, any placeholder left becomes "someone" / "somewhere" / "something" by kind, with a count-only warning.
2. **Kristopher misreads his own call.** Card: "The ringing from the other night is still somewhere in my ears". The far-side beat reached him, but its event says "Her phone rings." (the adjudicator's sound text, using the item name "Her phone"). He can't tell whose phone it is, or that it is his call, now.
   - FIX: the far side names the holder ("Violet's phone rings") and says it is the call he placed.
3. **The table line reads "Her phone rings."** The world-sound narration uses the item's name. It should read "Violet's phone rings."
4. **Violet's voice is a formula.** Card after card opens with "I think I notice…", "I think I am…". The voice agent leans on her voice notes as a template. Rosemary Marsh comes up in nearly every card.
5. **A stray "clinically"** in a card ("I am checking, clinically, whether the quiet is resolution…") reads like a report, not a person.

(more as the session goes)
6. **Kristopher's card said "Person-A didn't pick up" while the phone was still ringing.** The plan closed off something still going.
   - FIX: the composer rule "something still going is still going; never think it ended unless the perception says it stopped".
7. **Violet's line-3 thought was nonsense** ("I check my pockets again … the five-dollar bill is gone"). The fact check misfired ("three vs five") and re-voiced her COMPOSED thought through the OLD single-monologue prompt, which bypasses the composer.
   - FIX: when composing, a competing sentence is dropped, never re-voiced.
8. **Rosemary came up in nearly every card of Violet's.** FIX: the recall agent sees the recent thoughts; a memory already in them wakes again only if the moment truly calls for it.

## Fixed after the session (commits after daf2202)

Items 1, 2, 3, 4 (the voice is told the openings to avoid, and is asked once more if it repeats one), 6, 7 and 8. Item 5 is covered by the voice rules. The world was restored to before session 2, :3001 rebuilt, and the pod warmed.

## Session 2 live, second run (2026-11-03 evening, build 8456b51) — logged while Michael plays

Michael: "Still having trouble with these cards." Nothing live touched; probes ran as side calls against synthetic pieces.

9. **Violet's first card: "It rang twice before I picked up"** — she never picked up. **Kristopher's: "Four rings now, maybe five. She's not going to pick up, and I already knew that before I dialed"** — the still-going fault again, in the first beat.
   - Probes: Qwen's plan on clean pieces (3 runs) never invents the deed; the cloud voice on a clean gist (4 runs) never adds one. The fault is in the PIECES handed in:
   - (a) **Two orphan `being_thought` rows from last night's killed replay** (03:26:58 Violet "My thumb hovers, trembling, over the glass"; 03:27:02 Kristopher "The ringing stops… I didn't expect her to answer"; sessionId null) predate the 03:46 snapshot, so the restore left them. `recentVoiceOf` handed them to both beings as their most recent thoughts, so each opened tonight already past the call.
   - (b) **`recentVoiceOf` has no time bound.** Session-1 thoughts from two days ago in-world ("I am still holding the door", the receipt) are "recent" and unaged; the voice continues them as the present: "He has not knocked yet" (21:39 card).
   - FIX (after the session): delete the two orphans; "recent" = thoughts since this session (or the last clock jump); older thoughts, if given at all, carry their age like memories. The in-memory listening state (innerState) must reset at a session start too.
10. **Rosemary Marsh again** ("Rosemary Marsh would have had a theory", 21:39) — she was not in the recent thoughts this time, so the recall fix did not apply; one mention is fair. Watch it.
11. **The pieces were not on the record** — the log showed only timings. Added: composer logs perceived / felt / wakes / recent and gist / thought per beat (source only; in the next build).
12. **Rosemary Marsh in 4 of 7 Violet cards** — not from recall. `identityNarrative` is a 3,982-char chronology with Rosemary six times, and the composer prompt carries ALL of it every beat ("Who Violet is: …"); the mood order gets its first 400 chars as temperament. The plan reaches for the most vivid named figure in front of it. FIX: the composer gets a short standing identity (who she is now, a few sentences); the chronology is memory, and only the recall agent wakes it.
13. **Kristopher: "I know her well enough to know that — I built that skill reading people…"** (21:42:53) — he met her once. Invented familiarity; the plan/voice had no fact saying how well he knows her. Watch after #12 (less biography in the prompt) and the recent-thought bound.
14. **Violet after the text chime** (21:42:39): the chime is not in the thought at all; the next card (21:42:56) has "Something chimed." and "The bill is still by the door" again (#9b). 21:44:31: "Something is vibrating in my hand … The screen keeps asking" — a text chime treated like a ringing call (the signal stays live 600 s for any signal; a chime is one sound, then a notification that sits).
15. **Session end did not stop the pod** (still RUNNING 1081 s after session_end); stopped by hand.
16. Good: the voicemail line landed right in Kristopher ("The voicemail picks up and I don't leave one. I just listen to her recorded voice"); the voice sounds like her ("which is also, technically, an answer"); no placeholder leaks; "Violet's phone rings/goes quiet/chimes" on the table.
   - Correction to #15: the server DID stop the pod one second after session_end ("[text-pod] … stopped after 18 min — released"); my status check landed in that same second. Not a fault.

## After the session — Michael: "We keep trying to bandaid fix things"
Fix pass stopped. Plan written: GROUNDED-BEATS-PLAN-2026-11-03.md (a beat is a record of resolved references, the local model chooses, the cloud writes; the table test replaces live sessions as the test). Tonight's source changes are kept, uncommitted and unbuilt, as Day 1 material.
