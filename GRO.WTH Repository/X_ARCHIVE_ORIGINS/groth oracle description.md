# Oracle Scribe (Co-GM) — Technical Architecture & Implementation Brief

> Goal: Deliver an always-present, privacy-respectful, AI “co-GM” that captures in-game speech, ignores table talk, reframes Murky Mirror meta strategy as in-character canon, manages rules/state, and gives real-time assistance while keeping GROWTH’s complexity invisible.

---

## 1) User Roles & Modes

**Roles:** GM, Player, Oracle Scribe (system agent)

**Modes:**

- **IC (In-Character):** Keep transcript + derive state.
- **Murky Mirror (MM):** Distill player meta into character intent/dialogue; keep distilled form only.
- **OOC:** Drop entirely (no transcript, no embeddings).

**Session Privacy Profiles:**

- **Local-Only (default):** All compute + storage local.
- **Co-op Cloud (opt-in):** Sync derived notes/state (not raw audio) across GM devices.
- **Streamer Mode (opt-in):** Adds on-screen indicators + redaction.

---

## 2) System Architecture

```
+--------------------+          +------------------------+
|  Table Clients     |          |  GM Console (Electron |
|  (Web/Mobile)      |<-------->|  / Tauri / Web)       |
|  Player Portal     |          |  - Overlay UI         |
+--------------------+          |  - Retcon controls    |
        ^   ^                   |  - Consent mgmt       |
        |   |                   +-----------^------------+
        |   |                               |
        |   | WebSocket/HTTPS               |
        |   v                               v
+--------------------+            +------------------------------+
|  Edge Listener     |            |  Co-GM Service (Local)       |
|  (Local service)   |            |  - Rules engine              |
|  - VAD/ASR         |            |  - Reframer (MM->IC)         |
|  - Diarization     |            |  - Initiative/turn tracker   |
|  - IC/MM/OOC clsf. |----------->|  - Inventory/state sync      |
|  - Policy gate     |   events   |  - Suggestion generator      |
+--------------------+            +-----------^------------------+
        |                                    |
        | gRPC/IPC                            | reads/writes
        v                                    v
+--------------------+            +------------------------------+
|  Campaign Store    |<---------->|  Sync (opt-in)               |
|  (SQLite+CRDT)     |   CRDT     |  - E2E encrypted notes/state |
|  - transcripts*    |            |  - No raw audio              |
|  - derived state   |            +------------------------------+
|  - audit log       |
+--------------------+
```

\*Transcripts retained per policy; raw audio never persisted.

---

## 3) Core Pipelines

### Audio → Event Pipeline

1. Capture → VAD → ASR (on-device) → Diarization.
2. IC/MM/OOC Classifier (rules + ML) outputs label & confidence.
3. Policy gate: IC kept, MM distilled, OOC dropped.
4. Derivers update initiative, HP/conditions, inventory, quest notes.
5. Events streamed to Co-GM service + UI.

### Murky Mirror Reframing

- Input: MM chunk + context.
- Output: In-character lines + intent objects.
- GM approval for major consequences.

### Retcon/Undo Stack

- Rolling window of events + dependency graph.
- Soft retcon (flavor only) or hard retcon (mechanics & state).
- Voice/command triggers for retcons.

---

## 4) Data Model (Examples)

**SessionEvent**

```json
{
  "id": "evt_9x1",
  "label": "MM",
  "aboutness": 0.74,
  "text": "Hold the east gate",
  "scene_id": "scene_barovia_gate"
}
```

**MM Distillation**

```json
{
  "ic_dialogue": [{"character":"Al'thrick","line":"I hold the east gate."}],
  "intents": [{"character":"Al'thrick","type":"position","where":"east_gate"}]
}
```

**Character Dossier**

```json
{
  "character_id": "althrick",
  "sheet": {"hp":27,"max_hp":35},
  "inventory": [{"id":"glaive","qty":1}]
}
```

---

## 5) API Surface

**Local Event Bus (WebSocket)**

- `session.events` — stream of SessionEvent, DeriveEvent, RetconApplied.
- `session.controls` — pause, resume, forget, retcon.

**REST (Localhost)**

- `/session/state` — get scene, initiative, resources, dossiers.
- `/session/retcon` — patch event with soft/hard retcon.
- `/config/privacy` — set profile, retention.

**Sync (Opt-in Cloud)**

- CRDT doc sync over HTTPS; E2E encryption per-campaign.

---

## 6) Co-GM Behaviors

- Beat awareness (combat/exploration/social).
- Context-triggered rules hints.
- Initiative & turn management.
- Inventory/loot proposals.
- Lore recall for NPCs, promises, callbacks.
- Narrative glue for retcons.

---

## 7) Classifier Spec

**Inputs:** transcript chunk, scene context, turn info. **Features:** lexicon matches, mechanics verbs, grammatical mood, OOC cues. **Outputs:** label (IC/MM/OOC), confidence, rationale. **Thresholds:** IC ≥ 0.6, MM 0.4–0.6 or rule-hit, OOC < 0.4. **Training Data:** 20–50h labeled sessions + synthetic augmentation.

---

## 8) Privacy & Consent

- Raw audio never persisted.
- IC transcripts retained X days (default 30), MM kept as distilled, OOC dropped.
- Consent per-campaign, revoke = purge.
- Indicators: green = IC, purple = MM, gray = paused/OOC.
- Privacy log: counts only, no OOC text stored.

---

## 9) UI/UX Elements

- Overlay HUD: scene, initiative, resources, suggestions.
- Mini transcript: IC only, MM marked.
- Controls: hotkeys & voice commands for mode switches, retcons, purges.
- GM Console: extended retcon tools, privacy controls.

---

## 10) Extensibility & Integration

- Plugin API for custom mechanics.
- Data export in JSON/Markdown/PDF.
- LLM provider abstraction.
- CRDT-based cloud sync with encryption.

---

## 11) Development Priorities

1. Local-first MVP with IC/MM/OOC classification & MM reframing.
2. Privacy & consent framework.
3. Retcon/undo stack.
4. Co-GM assistance core.
5. Minimal-intrusion UI overlays.

---

## 12) Success Criteria

- ≥90% F1 IC/OOC classification.
- 0 raw audio persisted.
- Retcon propagation consistent across state/logs.
- Players/GM report Oracle as "co-GM at table."

---

**End of Technical Brief**

