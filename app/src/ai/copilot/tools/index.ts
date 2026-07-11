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
import './forge-blueprint';
import './memory';
import './npc-speak';
import './mistake-corpus';
import './actors';
import './time-metrics';
import './place-on-canvas';
import './remove-from-canvas';
import './list-canvas-characters';

export { getJewlTool, listJewlTools, registerJewlTool } from './registry';
export type { JewlTool, JewlToolContext, JewlToolHandlerResult, JewlToolAffectedObjects } from './types';
