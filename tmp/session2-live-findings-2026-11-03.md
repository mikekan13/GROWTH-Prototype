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
