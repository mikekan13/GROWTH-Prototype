# Oracle_Scribe_System.md

**Status:** #needs-validation  
**Source:** groth oracle description.md  
**Security:** PUBLIC  
**Last Updated:** 2025-08-10

---

# Oracle Scribe (AI Co-GM) System

The Oracle Scribe is an AI-powered Co-GM assistant that provides real-time game support while maintaining strict privacy controls and seamless integration with GROWTH mechanics.

## Core Functionality

### Audio Processing Pipeline
**Voice Activity Detection (VAD):** Captures speech from table participants  
**Automatic Speech Recognition (ASR):** Converts audio to text locally  
**Speaker Diarization:** Identifies who said what at the table  
**Content Classification:** Distinguishes between game content and table talk

### Speech Classification System
- **In-Character (IC):** Game dialogue and character actions - transcribed and processed
- **Murky Mirror (MM):** Meta-gaming reframed into character intent - distilled and kept
- **Out-of-Character (OOC):** Table talk - immediately dropped, never stored

### Privacy Framework
**Core Privacy Principle:** Raw audio is never persisted to storage  
**Retention Policy:** IC transcripts retained per campaign settings, OOC content never stored  
**Consent Management:** Per-campaign privacy controls with ability to revoke and purge  
**Local Processing:** All audio processing happens on local devices

## Co-GM Assistance Features

### Real-Time Game Support
- **Rules Assistance:** Context-aware rules hints and clarifications
- **Initiative Tracking:** Automated turn order management
- **Resource Management:** Tracking HP, conditions, inventory, and character states
- **Narrative Support:** Lore recall, NPC management, and story continuity

### State Derivation
The Oracle automatically updates:
- Character health and conditions from combat descriptions
- Inventory changes from item usage and loot distribution
- Quest progress and narrative beats
- Relationship tracking between characters and NPCs

### Retcon and Undo System
**Soft Retcon:** Flavor changes that don't affect mechanics  
**Hard Retcon:** Mechanical changes that alter game state  
**Dependency Tracking:** Maintains event relationships for consistent rollbacks  
**Voice Commands:** Quick retcon triggers via speech recognition

## Technical Architecture

### System Components
- **Edge Listener:** Local audio processing service
- **Co-GM Service:** Rules engine and state management
- **Campaign Store:** SQLite database with CRDT sync capabilities
- **GM Console:** Management interface with overlay controls

### API Surface
**WebSocket Events:** Real-time session events and state updates  
**REST Endpoints:** Campaign management and configuration  
**Privacy Controls:** Session modes and data retention settings

### Integration Points
The Oracle Scribe integrates directly with:
- [[Terminal_Interface]] for skill resolution
- [[KRMA_System]] for character advancement tracking
- [[Combat_Hit_Locations]] and damage systems
- [[Character_Sheet_JSON_Schema]] for state management

---

## Links
- Technical: [[Oracle_Technical_Architecture]]
- Related: [[Terminal_Interface]], [[KRMA_System]]
- Development: [[Character_Sheet_JSON_Schema]]