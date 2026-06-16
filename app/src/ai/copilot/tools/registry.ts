/**
 * JEWL tool registry.
 *
 * Services register tools at module load. The runtime imports the registry,
 * exposes the tool list to Claude, and dispatches whatever Claude calls.
 *
 * See [[jewl-built-as-we-fix-canvas-2026-06-14]].
 */

import 'server-only';
import type { JewlTool } from './types';

const REGISTRY = new Map<string, JewlTool>();

export function registerJewlTool(tool: JewlTool): void {
  if (REGISTRY.has(tool.name)) {
    throw new Error(`JEWL tool already registered: ${tool.name}`);
  }
  REGISTRY.set(tool.name, tool);
}

export function getJewlTool(name: string): JewlTool | undefined {
  return REGISTRY.get(name);
}

export function listJewlTools(): JewlTool[] {
  return Array.from(REGISTRY.values());
}
