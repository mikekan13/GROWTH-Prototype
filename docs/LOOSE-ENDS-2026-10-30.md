# Loose ends — full inventory, 30 Oct 2026

Swept from all 352 memory files, `ROADMAP.md` and `docs/` on 30 Oct 2026 (449 marker hits across 164 files, read in context, checked against the 10-26 → 10-29 files for resolutions). Companion to `ASSESSMENT-2026-10-30.md`, which triages this list.

Status key: **M** = design decision owed by Michael · **O** = open · **U** = built but untested/unmeasured · **S** = superseded or resolved. Dates = first seen.

## Table / DAYA being engine
1. ORDINARY COMPETENCE: the daily routine (go, unlock, open, take, pay, tip) as a plan advanced one step per beat. hw11-handoff, 10-29, **M**.
2. The player layer behind the character (the "(spirit)" that keeps the table moving). daya-player-behind-character, 10-17, **M**.
3. Violet's fixation on the bill before the knock. hw11, 10-29, **M**.
4. Her mind runs ahead of the world ("the lock clicked / he's already inside"). hw10, 10-29, O.
5. Whether Violet opens the door now that the lock is hers. hw10, 10-29, U.
6. Five HW11 fixes in 3c8675d (grid snap, thoughts stay put, knock survives adverbs, answer knows impulse, money direction). 10-29, U.
7. Speed: 17 s/beat; listen waits on renderer + ~6.7 s soul call; full-card step 5. hw10, 10-29, O.
8. The growing thought shows raw tokens before the filter. hw11, 10-29, O.
9. Doubled name "Violet violet tries the Entry door"; source not found. hw10, 10-29, O.
10. An act's consequence in the world (a call rings the callee's phone) — `sound` op built 10-29, unverified live. hw9, U.
11. HW9 speed work (page follows seed, card follows thought, growing thought) never measured on a real beat. 10-29, U.
12. Standing beat fed by routines and the clock ("Violet gets her side before the knock"). truth-record, 10-25, O.
13. Handing over the bill should settle the intention; DONE is never set for routines. intentions-layer, 10-25, O.
14. Wisdom recall budget (2 at Wisdom 14) calibration. 10-25, **M**.
15. PTSD memory encoded at arousal 0.12 so it never climbs to survival (ingest-tagging). 10-25, O.
16. Goals-rung stoplist (`goalsTouched` counts "from"/"that"). 10-25, **M**.
17. Time jumps: DORMANT beings and beings with no active goal live nothing; top goal only. 10-24, **S** 10-31 — `services/stretch-live` lives the span for every crystallized character (routines in their hour, intentions, the account of the day, sleep); see ROADMAP 2026-10-31 (later).
18. Per-action durations and base durations (speech 6 s, action 1 min, rests). first-test-plan C1, 10-17, **M**.
19. Perceived elapsed time as a stimulus. STATE 10-23, O.
20. The answerer's monologue should carry the ask's words. 10-23, O.
21. Card for the being Mike voices on the other's reply: held vs blended. 10-23, **M**.
22. Being replies not delivered through perception (no reach check). 10-23 (HW5), O.
23. A being's spoken claims never checked against world facts (partly: claim-vs-fact built 10-26). hw8-run6, O.
24. Familiarity ledger empty between Kristopher and Violet; stimulus leaks the speaker's name. 10-23, O.
25. Promised design talk never held: card shape, stock-image voice filter, one prose block for both sides of a door, speech on a standing beat, movement and time on the table path, NOT PAID meaning, "they" for a known woman, knock counts. 10-23, **M**.
26. Unskilled-attempt governor: provisional keyword table. 10-26, **M**.
27. Skill choice only when a skill is named in the act. 10-26, **M**.
28. Turn order outside encounters. ruling-rolls, 10-26, **M**.
29. OOC/table-talk filter: ruled, not built. 10-06, O.
30. U2c-5 (JEWL's "mistake or new?" on spoken chunks). 10-06, O.
31. Planning board in memory only; no U3 board UI. 10-09, O.
32. Narration reads speech only, matches entities by name. 10-17, O.
33. Seating a human in Violet has no UI. 10-17, O.
34. Kristopher's attributes "weak in some, too high in others". 10-28, **M**.
35. Kristopher's DayaAffect/mood provenance. 10-23, O.
36. Recall-miss filler stored as memory (bug 27). 10-23, O.
37. A voiced being hears narration about itself. 10-23, O.
38. Stale-repeat display unconfirmed. 10-23, O.
39. GM improvisation limit / canon-rewrite restrictions. fluid-canon, 09-26, **M**.
40. JEWL economics ("part of the subscription"). 08-07, **M**.
41. F3 JEWL work-sessions spec: 4 [QUESTION]s. 08-07, **M**.
42. The REAL Effort issue and the size of the priority "bit". 09-05/09-17, **M**.
43. Mid-round reactions and grapple (Unit 2). 09-05, O.
44. IMPROV_TUNING / BRIDGE_TUNING placeholders; full-fidelity expansion of a bridged stretch. 09-26, O.
45. Incubator AI GM / WatcherGM engine. 09-02, parked.
46. Multiple spirit packages per body. 08-04, parked.
47. `BEINGS_ANSWER='when-asked'`: a due routine step should grant a turn (new, 10-30). O.
48. Intention deriver over-fires on description ("the drawers stick in summer" is PENDING) and never makes a routine due (new, 10-30). O.
49. Survival recall rung is cue-blind (new, 10-30). O.
50. DAYA role names (`soul` = felt state, `spirit` = thinking) predate the Jan 2026 swap (new, 10-30). **M**.
51. The tagger runs on Claude inside the beat whenever `ANTHROPIC_API_KEY` is set (new, 10-30). O.

## Canvas / map / spatial
52. The walk cap (top speed × span; actions × distance in combat). 10-28, O.
53. GM drag has no grid snap. 10-29, O.
54. Hearing uses room adjacency not distance; no facing or darkness. 10-28, O.
55. Clock charged for the walk AND the table's move-line estimate. 10-28, O.
56. A being filed only at the home shell stands "nowhere" (roomForFiled partial). 10-28, O.
57. Player waypoints beside intentions: deferred to combat. 10-28.
58. The entry closet should be a room with its own door. 10-28, O.
59. Laundry basket position vs the fact "by the bathroom door". 10-28, O.
60. Story board wall-mounted, no floor spot. 10-28, O.
61. Main Room "~420 sq ft" sentence. 10-28, O.
62. Roll20-class map later. 10-17, O.
63. Canvas resize kinks (B-7). 08-04, O.
64. Folder chrome only for the focal scene; ENTER on a location opens the encounter map. 10-01, O.
65. Long-press empty canvas shadowed by the dice overlay. 10-06, **M**.
66. Where Violet sits (Main Room shift of 286). 10-06, **M**, likely stale.
67. Real-mouse feel pass; unverified gestures. 08-03, U.
68. "Inside" relationship (eating etc.). 10-16, O.
- S: "the door" with two doors (wayOutDoor, HW10); tokens avoiding each other (10-28); canvas never updates (10-28).

## Perception / fog
69. A world reset must also clear LastKnown (built into reset 10-28; keep watching). O.
70. Fog only visible on a Trailblazer account or SEEN BY. 10-28, note.
71. Sight witnesses get the full readout or only the outcome. 10-27, **M**.
72. Does a GM-spoken "roll perception" trigger a check. 10-06, **M**.
73. Sense-skill governors. 10-26, **M**.
74. Perceptive hearing (`audibleOnly` → mirror hint). 10-25, O.
75. Low-fidelity sight giving wrong impressions: how often. 10-09, **M**.
76. Source of mind-reading senses. 10-09, **M**.
77. A Broken head without eyes/ears dims the senses? 10-09, **M**.
78. Old lines re-label as names are learned: OK? 10-09, **M**.
79. Encounter participants' pools leak to members. 10-09, O.
80. Attunement flat at 0.8: which attribute. 09-26, **M**.
81. U4 (mirror overlay, fog follows memory, GM see-in). 10-17, O (fog built 10-28; overlay not).
82. PERCEPTION_FEED / PERCEPTION_REACH default OFF; never played by a real Trailblazer (new, 10-30). O.

## JEWL
83. `request_tool` grants die at the turn's end; carry into the next dispatch. 10-29, O.
84. JEWL tightening list ("saved for later"). 10-28, O.
85. JEWL interjects by force-opening his chat box (built 10-26 for questions; general case). 10-25, O.
86. Hold estimate should scale with the thing (75 KRMA for a receipt). 10-25, O.
87. JEWL's sim check reads items not canon history. 10-23, O.
88. JEWL control gaps. 10-17, O.
89. GM-edit JEWL flood (fixed 10-23 for sheet edits; watch). O.
90. Timestamp-prefix leak; formatter not found. 10-23, O.
91. JEWL has no roll/check/narrate tool. 10-17, O.
92. Route `jewl-work` questions into the roll popup. 10-26, O.
93. JEWL tab body light out of session; warm-up for the Watcher only. 10-26, O.
94. Prods to a seated Trailblazer (built 10-16; verify). O.
95. Possessions asked-not-assumed; blueprints become items. 10-23, **M**.
96. Mistake corpus should feed drafting. 10-12, O.
97. Do Locations and Items follow the proper-noun ban. 10-12, partly ruled, O.
98. GM one-off generic block during genesis needs an escape. 10-12, O.
99. Popup job types guessed from goal text. 10-12, O.
100. JEWL sees appearance for memories? 10-12, **M**.
101. Written Self fugue revision: Forge edit vs JEWL draft. 10-12, **M**.
102. Campaign wallet/economy in JEWL's perception. 08-25, O.
103. First-open JEWL startup wizard (F-1). 07-31, O.
104. JEWL image generation for locations (N-1). 08-02, O.
105. Mistake-bounty transaction type and UI. 06-17, O.
106. Multimodal images on the chip. 06-17, O.
107. How Mike's rulings propagate across tables. 06-03, **M**.

## Game rules / mechanics / balance
108. KRMA rate per level after the re-base. 10-29, **M**.
109. Short Rest rescale. 10-29, **M**.
110. Characters without block links still on the old scale (Tara, other campaigns). 10-29, O.
111. Audit every mechanic that assumes 10 is average. 10-28, O.
112. `ACTION_DIVISOR = 25` in `sim/round/action-economy.ts`; ruled 75 (new, 10-30). O.
113. DR ladder for obstacles. 10-26, **M**.
114. "30 seconds" has no canonical unit conversion. 10-26, **M**.
115. Governor buffing not fully covered. 10-17, O.
116. Material life can make you weaker: deferred debate. 10-16, **M**.
117. Seed augs missing from sheets. 10-17, O (re-base 10-29 touched augs; verify).
118. Violet has 3 vines, should have 4. 10-25, O.
119. Triggered effects becoming blossoms. 08-24, **M**.
120. Lien sizing at imposition. 08-19, **M**.
121. Unique spell signatures. 08-21, parked.
122. Species maturation two-clocks. 08-19, **M** parked.
123. Mental-illness thorn framing. 08-04, **M**.
124. Seed scope for modern Earth. 08-04, **M**.
125. Vehicles and electronics structure. 08-04, **M**.
126. Fated-age formula seed-KV term. 08-04, **M**.
127. Library lands as draft or published. 08-04, **M**.
128. Allocatable grants (M-1); per-type lifecycle constraints. 07-31, **M**.
129. Magic advancement and spell-schema sign-off. 07-15, **M**.
130. Six questions from 06-10 (combat-death fails, Decay target, Sephirot parentage, duplicate campaign, Prime funding, custodian placement). **M**.
131. Time-system questions (clock format, harvest, JEWL inference UX, history log shape). 06-08, partly answered, **M**.
132. Pillar MOD values formula. 06-06, **M**.
133. Non-humanoid bodies and creature size for beta. 05-13, O.
134. Ghost frequency rebuild. 05-19, O.
135. Exact TKV formula. 10-17, **M**.
136. Owned items count toward TKV? 10-12, **M**.
137. Stock archetypes named as plurals → singular catalog pass. 10-16, **M**.
138. Repository WIP-15 seed augs. 10-29, O.

## KRMA economy
139. What Root/Branch `accumulatedWealth` becomes if cash holds no KRMA. 10-17, **M**.
140. Bank balances as a belief ledger? 10-17, **M**.
141. KV is not price: separate PRICE, container volume/capacity; stock_goods not run on Violet. 10-16, **M**.
142. Ability KVs above item price (83 items). 10-16, **M**.
143. Sketch KRMA: charge now or hold; Fated Age 188 floor; 1–20 range; auto-deepen. 10-12, **M**.
144. Funding the display via a proper ledger transfer. 08-24, **M**.
145. GM utilization widget; basis excludes the drip? 07-12, **M**.
146. Violet's character wallet is 0. 10-17, O.
147. Master-reference TODOs: fingerprint hashing, novelty distance, attribution shares, passive creator income; KRMA as equity needs lawyers. O.

## Memory system
148. Old-biography duplicates (rows 1–30; conflicting Rosemary death day). 10-17, **M**.
149. Godhead/sephirah/school seating; domain attention; is Godhead memory fallible. 09-22, **M**.
150. Correction rule (memory re-rendered from truth) accepted, not built. 10-06, O.
151. Pattern Stability ledger not designed. 10-17, O.
152. Block-instance ↔ memory link (two ledgers). 08-19, O.
153. NPC memory-ledger seeding bounces. O.
154. Rosemary: dead or alive (DRAFT NPC). 10-17, **M**.
155. Routines as a third (procedural) memory kind (new, 10-30). **M**.

## Portraits / image
156. Bust framing for the 2:3 frame; proofs need a repaint. 10-17, **M**.
157. Approve a crop, then turn on GENESIS_PORTRAIT_GATE. 10-17, **M**.
158. Live portrait decisions: licence path, warm-worker cost, ~$2 spend, mood approach. 10-16, **M**.
159. What "live portrait" means. 07-11, **M**.
160. FIGURE (full body) not in the UI. 10-16, O.
161. Items get images as portrait refs; remove hard-coded patches then. 10-17, **M**.
162. Spin the worker down on appearance-tab leave. 10-14, O.
163. Bright scenes drift anime (v2 culling); untried realism levers. 10-14, O.
164. Photo preparer second line of defence. 10-14, O.
165. Restyle/describe A/B on 10 subjects. 10-13, O.
166. Realignment proposal after deep-end testing stopped. 10-13, **M**.
167. Corpus plan "needs Mike's go". 10-13, **M**.
168. Edits single-pass. 10-13, U.
169. Tapestry section names are placeholders. 10-13, **M**.
170. FLUX licence (Dev vs Schnell), CatVTON HF token, poses untested. **M**.

## Infra / cost / GPU
171. Full GPU card: weights live in US-NE-1. 10-29, O.
172. Cloud per-line cost unmeasured; instrument it. 10-29, O.
173. Lane surfaces "throttled" (built); probes pile into the queue (purge is manual). 10-27, O.
174. Dynamic idle (short out of session, warm in). 10-17, O.
175. Local spend floor because billing lags ~1 h. 10-23, O.
176. Production build for play sessions; memory headroom. 10-23/10-27, **M**.
177. Dev server reaped on the 16 GB box (run `npm run dev` in Mike's terminal). 10-29, O.
178. Leftover probe session in the Session table. 10-28, O.
179. Tailscale Serve for the phone mic. 10-06, **M**.
180. Worker in-flight job count unverified. 10-12, U.
181. Pod bring-up automation (O-2). 08-07, O (dev-pod.mjs covers the dev pod).
182. `merge/fork-portrait-pipeline` not merged to master. 10-17, O.
183. Serverless endpoint still rents H100s; pin to L40S/RTX 6000 Ada before an unattended table. 10-29, O.

## Privacy wall
184. The full swap set ("names aren't the only thing"). 10-16, **M**.
185. Real public places as aesthetic: confirm. 10-16, **M**.
186. Anonymity translator not built or tested. 10-17, O.
187. Username leaks to the model ("Owner:"). 10-17, O.
188. DISCONNECTED → META switch UX and consent. 09-20, **M**.
189. INV-120: minors' audio stays on the device. 08-23, **M**.
190. META consent false, so traces go to quarantine. 10-17, **M**.

## UI / record readability
191. Vitals & Equipment design pass. 10-17, **M**.
192. Inventory tab specifics. 10-17, **M**.
193. Glitch load, roll popup, act-as-card, JEWL on a contradicted door, narrated thoughts: not seen live. 10-27, U.
194. "Fully loaded" definition and ticker cadence. 10-26, **M**.
195. Is the ticker's VOICE flat too. 10-28, **M**.
196. Narrator voice option in GM settings. 10-26, **M**.
197. Seed build-up compile step (entity tokens). 10-25, O.
198. Readability: the hour repeats; cards alternate. 10-25, O.
199. Receipt placeholders; no street address or phones in the world. 10-23, **M**.
200. Tooltip restyle to the rulebook palette; phone header A/B. 10-06, deferred.
201. Mic indicator and narration grouping. 10-06, O.
202. Readability deep scan (S-3), Forge visual upgrade (S-2), folder UI (S-4). 07-31, O.
203. GM settings local-generation wizard. 07-15, O.
204. Accent-token rename. 07-12, **M**.
205. Server-side dice; settled values wired back. O.
206. Canvas sheet cleanup list (#1 remove Possessions from the main card). 10-17, O.

## Campaign / onboarding / commercial
207. Novels-as-worlds consistency hook; novel campaigns empty. 10-16, **M**.
208. Violet's identityNarrative still has the novella. 10-17, **M**.
209. Character creation overhaul (S-1). 07-31, O.
210. Designer persistence, age-slider default, genesis churn. 10-23, O.
211. Genesis writes NPCs as PLAYER_CHARACTER. O.
212. Campaign page JSON 500 (self-heals). 04-14, deferred.
213. Wizard can't preload characterDesc (T12/T35). 07-12, **M**.
214. Narrative Map: 41 contradictions and 135 questions. 07-08, **M**.
215. Triu/Sylva rename. 05-26, **M**.
216. Tara's CS 6.0 numbers and mother threads. **M**.
217. The Wretched GDD ingest. 07-10, parked.
218. No success criterion written for a hello world (new, 10-30). **M**.

## Docs / repo drift (new, 10-30)
219. `docs/system_map.md` last updated 2026-07-12; `docs/ai_systems.md` header 2026-04-04; `ROADMAP.md` header 10-25 with entries to 10-29; M1–M9 milestones all stubs and abandoned.
220. Prisma models missing from `database_schema.md`: `Reconciliation`, `CanonRevision`, `AiCall`.
221. Services not in the registry: block-conditions, canon-rewrite, character-genesis-born, gpu-budget, portrait-lock, seat-labels, thorn-imposition, vine-slots. Lib: auth-tokens, creature-size, damage-targeting, pending-checks, prime-campaign, prod-reply, safe-json, seed-catalog, vine-slots.
222. ~40 routes undocumented; `godhead/[id]/invoke` is `[name]` on disk.
223. `ai_systems.md:259` says the Qwen-2.1 endpoint is not built; code reads `RUNPOD_QWEN_ENDPOINT_ID`.
224. Flags undocumented: `GPU_DAILY_BUDGET_USD`, `JEWL_DISABLE_DISPATCH`, `NEXT_PUBLIC_REVEAL_JEWL`, `DAYA_RECALL_RERANK`, `DAYA_DISABLE_THINKING`, `STRIPE_LIVE_MODE`.
225. No `typecheck` script; the 57-error baseline is unpinned. Only 3 TODO comments in `src`.
226. `tmp/` = 191 untracked scripts; `app/data/archive/` 22 snapshots; `style-refs/` untracked.
227. Outer repo tracks the nested Repository's files; the Repository's own commits show as modified forever.

## Misc
228. Tell Michael: the 10-17 push-the-door law changed (a lock is worked from the inside). 10-29. **Told 10-30.**
229. Pizza-holder canon ("her number"). S (reset puts the pizza with Kristopher).
- S: GPU cap back to $3 (10-23); fog-of-war talk (built 10-28); TABLE_SPLIT_LOOP (on since 10-23 — delete the serial path); scale conversation (divisor 75 + re-base 10-29).

## The ten oldest decisions still owed by Michael
1. Pillar MOD values formula (06-06).
2. The six questions of 06-10 and the time-system questions (06-08).
3. Narrative Map's 41 contradictions and 135 questions (07-08).
4. What "live portrait" means (07-11).
5. GM utilization widget, accent tokens (07-12).
6. Magic advancement and spell schema (07-15).
7. Allocatable-grant lifecycle per type (07-31).
8. Content-gen 1–5: thorn framing, vehicles, fated-age term, Earth seeds, library state (08-04).
9. JEWL economics and the F3 spec questions (08-07).
10. Species maturation (08-19), lien sizing (08-19), triggered effects → blossoms (08-24).


## Added 2026-10-31 — living a stretch (see `docs/TIME-STRETCH-DESIGN-2026-10-31.md`)
230. JEWL's prep for the two-day jump, with his own tools: Kristopher's hotel room and Chess Pizza as undrawn Locations from the facts; his rig placed in the hotel; fresh pizzas stocked at the pizza place (the only pizza is in Violet's hands; the walker reports the lack and will not send him to take it back); re-derive his routine so "the customer" is Violet. **M**/JEWL.
231. The canvas's reading of a being ELSEWHERE (filed in an undrawn Location, point cleared): token greyed at last known per the fog ruling, "elsewhere: …" on the tooltip. U.
232. The stretch's bounded exchange (cap 4) and the account-of-the-day path unverified live. U.
233. `stretch-live.hears` is room adjacency (the door's two sides / the sound's room), not the reach judge; a sound through a wall or from the street is not heard. O.
234. A Watcher-voiced (DORMANT) entity lives a stretch like an ACTIVE one (Michael 10-31: every crystallized entity); at the table it stays GM-voiced. The first stretch will show whether its listens read well. U.
235. Characters not yet crystallized (DRAFT, e.g. Rosemary Marsh) are posted "not yet crystallized" and live nothing. O (rule when one matters).
236. Body across a stretch (hunger, fatigue) still deferred per the 10-24 addendum; night is a sleep window with a dream tick. **M**.
237. The intention deriver's time words: `quarterInWords` reads evening/night/morning/afternoon markers; "after work", "at six" and clock times are not read. O.
