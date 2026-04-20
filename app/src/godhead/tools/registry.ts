/**
 * God-Head Tool Registry — Typed tool definitions for agent tool use.
 *
 * Each tool has a Zod input schema, a handler function, and metadata.
 * The agent runtime uses this to build Claude's tool definitions and
 * execute tool calls. Tools throw typed errors that the agent sees
 * and can react to.
 *
 * A tool can be backed by:
 * - A deterministic function (no LLM)
 * - A database query
 * - Another LLM call (Sonnet for light tasks)
 * - An external API call
 *
 * The registry doesn't care — it just routes name → handler.
 */

import 'server-only';
import { z } from 'zod';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (input: unknown, context: ToolContext) => Promise<unknown>;
}

export interface ToolContext {
  godHeadId: string;
  godHeadName: string;
  invocationId: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

// ── Registry ──────────────────────────────────────────────────────────────

const tools = new Map<string, ToolDefinition>();

export function registerTool(def: ToolDefinition): void {
  if (tools.has(def.name)) {
    throw new Error(`Tool "${def.name}" already registered`);
  }
  tools.set(def.name, def);
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

export function getAllTools(): ToolDefinition[] {
  return Array.from(tools.values());
}

/**
 * Build Claude-compatible tool definitions from the registry.
 * Used when constructing the messages array for the API call.
 */
export function getClaudeToolDefinitions(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return getAllTools().map(t => ({
    name: t.name,
    description: t.description,
    input_schema: zodToJsonSchema(t.inputSchema),
  }));
}

/**
 * Execute a tool by name with input validation and error handling.
 * Returns a structured result that the agent runtime logs.
 */
export async function executeTool(
  name: string,
  rawInput: unknown,
  context: ToolContext,
): Promise<ToolResult> {
  const tool = tools.get(name);
  if (!tool) {
    return { success: false, error: `Unknown tool: ${name}`, durationMs: 0 };
  }

  const start = performance.now();

  // Validate input
  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid input: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
      durationMs: Math.round(performance.now() - start),
    };
  }

  // Execute
  try {
    const data = await tool.handler(parsed.data, context);
    return {
      success: true,
      data,
      durationMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.round(performance.now() - start),
    };
  }
}

// ── Zod → JSON Schema converter (minimal) ─────────────────────────────────

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Handle the common Zod types we use in tools
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodType;
      properties[key] = zodToJsonSchema(zodValue);
      if (!(zodValue instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return { type: 'object', properties, required };
  }

  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema((schema as z.ZodArray<z.ZodType>).element) };
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema((schema as z.ZodOptional<z.ZodType>).unwrap());
  }
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: Array.from(schema.options as Iterable<string>) };
  }

  // Fallback
  return { type: 'string' };
}
