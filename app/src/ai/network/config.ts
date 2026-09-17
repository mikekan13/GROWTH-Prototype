/**
 * ai/network/config — THE one env surface for every AI lane.
 *
 * All model/endpoint selection reads from here; no other module should read
 * AI-related env vars directly. Legacy vars (ANTHROPIC_MODEL, DAYA_L1_*,
 * OLLAMA_*) keep working as fallbacks so nothing breaks mid-migration.
 *
 * Env surface (all optional — defaults are the shipped configuration):
 *   ANTHROPIC_API_KEY / ANTHROPIC_API_URL
 *   AI_JUDGMENT_MODEL   (default claude-sonnet-4-6; legacy ANTHROPIC_MODEL)
 *   AI_CLASSIFY_MODEL   (default claude-haiku-4-5-20251001; legacy ANTHROPIC_CLASSIFIER_MODEL)
 *   AI_GRUNT_MODEL      (default claude-haiku-4-5-20251001)
 *   AI_GODHEAD_MODEL    (default = judgment model)
 *   JEWL_WORK_CYCLE_LANE ('judgment' default | 'grunt' — flip when proven)
 *   AI_LOCAL_BASE_URL   (OpenAI-compatible; serverless vLLM endpoint or dev vLLM.
 *                        For RunPod serverless: https://api.runpod.ai/v2/<id>/openai/v1
 *                        Legacy fallback: DAYA_L1_URL)
 *   AI_LOCAL_MODEL      (served-model-name; legacy DAYA_L1_MODEL)
 *   AI_LOCAL_API_KEY    (RunPod api key for serverless; legacy DAYA_L1_API_KEY / RUNPOD_API_KEY)
 */

import type { LaneName, ResolvedLane } from './types';

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

export function anthropicApiKey(): string | undefined {
  return env('ANTHROPIC_API_KEY');
}

export function anthropicBaseUrl(): string | undefined {
  return env('ANTHROPIC_API_URL');
}

export function judgmentModel(): string {
  return env('AI_JUDGMENT_MODEL') ?? env('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6';
}

export function classifyModel(): string {
  return env('AI_CLASSIFY_MODEL') ?? env('ANTHROPIC_CLASSIFIER_MODEL') ?? 'claude-haiku-4-5-20251001';
}

export function gruntModel(): string {
  return env('AI_GRUNT_MODEL') ?? 'claude-haiku-4-5-20251001';
}

export function godheadModel(): string {
  return env('AI_GODHEAD_MODEL') ?? judgmentModel();
}

/** Which lane JEWL_WORK_CYCLE dispatches run on. Default stays 'judgment'
 *  (Sonnet) — genesis builds are judgment work; flip to 'grunt' via env once
 *  the cheap lane is proven on cycle chores. */
export function workCycleLane(): LaneName {
  return env('JEWL_WORK_CYCLE_LANE') === 'grunt' ? 'grunt' : 'judgment';
}

/** Which lane TABLE-FACING dispatches run on (GM_TEXT, voice, ambient —
 *  everything that carries raw play content). Default 'judgment'; set
 *  JEWL_TABLE_LANE=local for blind-play/privacy-wall operation (Mike
 *  directive 2026-08-29: the local model fronts play upfront; Claude is
 *  reachable only through the sanitize membrane). */
export function tableLane(): LaneName {
  return env('JEWL_TABLE_LANE') === 'local' ? 'local' : 'judgment';
}

export interface LocalLaneConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

/** The local (company-compute) lane. Null until the serverless endpoint (or a
 *  dev vLLM) is configured — callers must handle absence (fail-closed). */
export function localLane(): LocalLaneConfig | null {
  const baseUrl = env('AI_LOCAL_BASE_URL') ?? env('DAYA_L1_URL');
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    model: env('AI_LOCAL_MODEL') ?? env('DAYA_L1_MODEL') ?? 'local',
    apiKey: env('AI_LOCAL_API_KEY') ?? env('DAYA_L1_API_KEY') ?? env('RUNPOD_API_KEY'),
  };
}

/** Resolve a lane name to its transport + model. */
export function resolveLane(lane: LaneName): ResolvedLane {
  switch (lane) {
    case 'judgment':
      return { lane, provider: 'anthropic', model: judgmentModel(), crossesWall: true };
    case 'classify':
      return { lane, provider: 'anthropic', model: classifyModel(), crossesWall: true };
    case 'grunt':
      return { lane, provider: 'anthropic', model: gruntModel(), crossesWall: true };
    case 'godhead':
      return { lane, provider: 'anthropic', model: godheadModel(), crossesWall: true };
    case 'local': {
      const cfg = localLane();
      if (!cfg) {
        throw new Error(
          'Local lane not configured — set AI_LOCAL_BASE_URL (+ AI_LOCAL_MODEL / AI_LOCAL_API_KEY)',
        );
      }
      return {
        lane,
        provider: 'openai-compat',
        model: cfg.model,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        crossesWall: false,
      };
    }
  }
}
