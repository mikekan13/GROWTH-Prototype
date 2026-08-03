/**
 * Tool barrel — importing this file registers all built-in JEWL tools as
 * a side-effect. Import once from the runtime entry point.
 *
 * Each tool file calls `registerJewlTool()` at module load.
 */

import 'server-only';

// Register tools (import order doesn't matter; each guards against double-register).
import './damage';
import './time';
import './attribute-set';
import './condition';
import './move-character';
import './create-location';
import './read-location';
import './update-location';
import './place-item';
import './establish-world-facts';
import './edit-character-sheet';
import './forge-blueprint';
import './memory';
import './npc-speak';
import './mistake-corpus';
import './actors';
import './time-metrics';
import './place-on-canvas';
import './remove-from-canvas';
import './list-canvas-characters';
import './cast';
import './daya-ledger-read';
import './daya-affect-read';
import './daya-sheet-diff';
import './daya-routing-log';
import './daya-world-inspect';
import './daya-pov-view';
import './daya-recall-probe';
import './daya-author-entity';
import './daya-seed-memory';

export { getJewlTool, listJewlTools, registerJewlTool } from './registry';
export type { JewlTool, JewlToolContext, JewlToolHandlerResult, JewlToolAffectedObjects } from './types';
