# Oracle_Technical_Architecture.md

**Status:** #needs-validation  
**Source:** groth oracle description.md  
**Security:** PUBLIC  
**Last Updated:** 2025-08-10

---

# Oracle Scribe Technical Architecture

Technical implementation details for the Oracle Scribe AI Co-GM system.

## System Architecture Diagram

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

*Transcripts retained per policy; raw audio never persisted.

## Core Pipeline Implementation

### Audio → Event Pipeline
1. **Capture** → VAD → ASR (on-device) → Diarization
2. **IC/MM/OOC Classifier** (rules + ML) outputs label & confidence
3. **Policy Gate:** IC kept, MM distilled, OOC dropped
4. **Derivers** update initiative, HP/conditions, inventory, quest notes
5. **Events** streamed to Co-GM service + UI

### Murky Mirror Reframing
- **Input:** MM chunk + context
- **Output:** In-character lines + intent objects
- **GM Approval:** Required for major consequences

### Classifier Specifications
**Inputs:** Transcript chunk, scene context, turn info  
**Features:** Lexicon matches, mechanics verbs, grammatical mood, OOC cues  
**Outputs:** Label (IC/MM/OOC), confidence, rationale  
**Thresholds:** IC ≥ 0.6, MM 0.4–0.6 or rule-hit, OOC < 0.4

## Data Models

### SessionEvent
```json
{
  "id": "evt_9x1",
  "label": "MM",
  "aboutness": 0.74,
  "text": "Hold the east gate",
  "scene_id": "scene_barovia_gate"
}
```

### MM Distillation
```json
{
  "ic_dialogue": [{"character":"Al'thrick","line":"I hold the east gate."}],
  "intents": [{"character":"Al'thrick","type":"position","where":"east_gate"}]
}
```

### Character Dossier
```json
{
  "character_id": "althrick",
  "sheet": {"hp":27,"max_hp":35},
  "inventory": [{"id":"glaive","qty":1}]
}
```

## API Specifications

### Local Event Bus (WebSocket)
- `session.events` — Stream of SessionEvent, DeriveEvent, RetconApplied
- `session.controls` — Pause, resume, forget, retcon commands

### REST API (Localhost)
- `/session/state` — Get scene, initiative, resources, dossiers
- `/session/retcon` — Patch event with soft/hard retcon
- `/config/privacy` — Set profile, retention policies

### Sync Service (Opt-in Cloud)
- CRDT document sync over HTTPS
- End-to-end encryption per campaign
- No raw audio data transmitted

## Privacy Implementation

### Data Retention
- **Raw Audio:** Never persisted (processed in memory only)
- **IC Transcripts:** Retained X days (default 30)
- **MM Distilled:** Kept as processed character content
- **OOC Content:** Immediately dropped, never stored

### Consent Framework
- **Per-Campaign Settings:** Individual privacy controls
- **Revocation Rights:** Purge all data on request
- **Audit Logging:** Privacy events tracked (counts only, no content)

### Visual Indicators
- **Green Light:** In-Character mode active
- **Purple Light:** Murky Mirror processing
- **Gray Light:** Paused/Out-of-Character

<!-- SECRET: The Oracle system will eventually integrate with the KRMA attribution chain to track creative contributions during play sessions, but this functionality is not revealed to players/GMs initially -->

## Development Priorities

1. **Local-First MVP** with IC/MM/OOC classification
2. **Privacy & Consent Framework** implementation
3. **Retcon/Undo Stack** with dependency tracking
4. **Co-GM Assistance Core** features
5. **Minimal-Intrusion UI** overlays

## Success Metrics

- ≥90% F1 IC/OOC classification accuracy
- 0 raw audio persisted violations
- Consistent retcon propagation across state/logs
- Player/GM acceptance as "co-GM at table"

---

## Links
- System: [[Oracle_Scribe_System]]
- Integration: [[Character_Sheet_JSON_Schema]], [[Dice_Rolling_API]]
- Related: [[Design_Philosophy_and_Visual_Guidelines]]