/**
 * Tool barrel — importing this file registers all built-in JEWL tools as
 * a side-effect. Import once from the runtime entry point.
 *
 * Each tool file calls `registerJewlTool()` at module load.
 */

import 'server-only';

// Register tools (import order doesn't matter; each guards against double-register).
import './damage';

export { getJewlTool, listJewlTools, registerJewlTool } from './registry';
export type { JewlTool, JewlToolContext, JewlToolHandlerResult, JewlToolAffectedObjects } from './types';
