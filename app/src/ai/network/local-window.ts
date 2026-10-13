/**
 * ai/network/local-window — fit a LOCAL-lane request inside the model's window.
 *
 * Incident 2026-10-12: a table-lane chat reply sent ~24.6k prompt tokens with
 * max_tokens 8192 to a vLLM worker whose MAX_MODEL_LEN is 32768. vLLM counts
 * prompt + max_tokens against the window and rejected it (400); RunPod's sync
 * proxy rewrapped that as a 502 HTML page. Raising MAX_MODEL_LEN invalidates
 * the worker's compile cache (cold start 100 s → 6 min), so the app fits the
 * request instead:
 *
 *   1. estimate prompt tokens (chars / 3.6, +10% margin — no tokenizer dep),
 *   2. if clamping max_tokens would leave < 1,024 output tokens, TRIM the
 *      input first: oldest chat history before the newest user turn, then
 *      ellipsised tool results — never the system block, never the newest
 *      user message, never the current round after it,
 *   3. clamp max_tokens = min(requested, window − estPrompt − 512).
 *
 * Pure: no I/O, no server-only — the transports call it and log the result.
 */

export const DEFAULT_LOCAL_MAX_MODEL_LEN = 32_768;
/** Headroom for chat-template tokens the estimate can't see. */
export const LOCAL_WINDOW_RESERVE = 512;
/** Below this many output tokens a request is useless — trim input instead. */
export const LOCAL_MIN_OUTPUT_TOKENS = 1_024;
/** When trimming, aim to leave this much room for the answer (capped by the request). */
export const LOCAL_TRIM_TARGET_OUTPUT = 4_096;

const CHARS_PER_TOKEN = 3.6;
const SAFETY = 1.1;
/** Per-message role/template overhead (tokens). */
const PER_MESSAGE_OVERHEAD = 6;

export function localMaxModelLen(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.AI_LOCAL_MAX_MODEL_LEN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_LOCAL_MAX_MODEL_LEN;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil((text.length / CHARS_PER_TOKEN) * SAFETY);
}

/** OpenAI-dialect content parts (vision turns on the local lane). */
export type LocalContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** The OpenAI-dialect message shape both local transports send. */
export interface LocalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null | LocalContentPart[];
  tool_calls?: Array<{ function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

/** Char-equivalent charged per image part (≈1.5k tokens at 768 px on Qwen VL). */
const IMAGE_PART_CHARS = 5_400;

function messageChars(m: LocalMessage): number {
  let n = 0;
  if (typeof m.content === 'string') n = m.content.length;
  else if (Array.isArray(m.content)) {
    for (const p of m.content) n += p.type === 'text' ? p.text.length : IMAGE_PART_CHARS;
  }
  for (const tc of m.tool_calls ?? []) n += tc.function.name.length + tc.function.arguments.length;
  return n;
}

export function estimateMessagesTokens(messages: LocalMessage[], extraText = ''): number {
  let chars = extraText.length;
  for (const m of messages) chars += messageChars(m);
  return Math.ceil((chars / CHARS_PER_TOKEN) * SAFETY) + messages.length * PER_MESSAGE_OVERHEAD;
}

/** max_tokens the window can still afford after the prompt (may be ≤ 0). */
export function clampMaxTokens(requested: number, estPrompt: number, window = DEFAULT_LOCAL_MAX_MODEL_LEN): number {
  return Math.min(requested, window - estPrompt - LOCAL_WINDOW_RESERVE);
}

export interface FitResult<M extends LocalMessage> {
  messages: M[];
  droppedMsgs: number;
  trimmedChars: number;
  estTokens: number;
  fits: boolean;
}

/** Ellipsis caps tried in turn on tool results, largest first. */
const TOOL_RESULT_CAPS = [6_000, 3_000, 1_500, 600, 200];

/**
 * Trim `messages` until their estimated size (plus `extraText`, e.g. the
 * tool specs) is ≤ `budgetTokens`. Order: drop the oldest history before the
 * newest user message (an assistant tool-call turn goes with its tool
 * results, so no orphan tool messages are left); then ellipsise tool
 * results, oldest first, at shrinking caps. System messages, the newest user
 * message and assistant text are never touched.
 */
export function fitToLocalWindow<M extends LocalMessage>(
  messages: M[],
  budgetTokens: number,
  extraText = '',
): FitResult<M> {
  let msgs = messages.map(m => ({ ...m }));
  const startChars = msgs.reduce((n, m) => n + messageChars(m), 0);
  const est = () => estimateMessagesTokens(msgs, extraText);
  let droppedMsgs = 0;

  const newestUser = (): number => {
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'user') return i;
    return -1;
  };

  // Phase 1 — drop the oldest history (strictly before the newest user turn).
  while (est() > budgetTokens) {
    const nu = newestUser();
    const first = msgs.findIndex(m => m.role !== 'system');
    if (first < 0 || nu < 0 || first >= nu) break;
    let end = first + 1;
    // An assistant turn with tool calls takes its tool results with it;
    // a leading orphan tool message goes on its own.
    if (msgs[first].role === 'assistant' && msgs[first].tool_calls?.length) {
      while (end < nu && msgs[end].role === 'tool') end++;
    }
    droppedMsgs += end - first;
    msgs = [...msgs.slice(0, first), ...msgs.slice(end)];
  }

  // Phase 2 — ellipsise tool results, oldest first, at shrinking caps.
  for (const cap of TOOL_RESULT_CAPS) {
    if (est() <= budgetTokens) break;
    for (let i = 0; i < msgs.length && est() > budgetTokens; i++) {
      const m = msgs[i];
      if (m.role !== 'tool' || typeof m.content !== 'string' || !m.content || m.content.length <= cap) continue;
      const cut = m.content.length - cap;
      msgs[i] = { ...m, content: `${m.content.slice(0, cap)}… [trimmed ${cut} chars to fit the local window]` };
    }
  }

  const endChars = msgs.reduce((n, m) => n + messageChars(m), 0);
  const estTokens = est();
  return {
    messages: msgs as M[],
    droppedMsgs,
    trimmedChars: Math.max(0, startChars - endChars),
    estTokens,
    fits: estTokens <= budgetTokens,
  };
}

export interface LocalRequestPlan<M extends LocalMessage> {
  messages: M[];
  maxTokens: number;
  estPrompt: number;
  /** Set when max_tokens was lowered below the request. */
  clampedFrom?: number;
  /** Set when input was trimmed. */
  trimmed?: { droppedMsgs: number; trimmedChars: number };
  /** Set when even the trimmed prompt leaves < 1,024 output tokens by estimate. */
  overBudget?: boolean;
}

/**
 * Plan one local request. `fraction` < 1 is the harder retry (0.7): the
 * input is trimmed to that share of the window's input budget even if it
 * would nominally fit.
 */
export function planLocalRequest<M extends LocalMessage>(
  messages: M[],
  requestedMax: number,
  opts: { window?: number; extraText?: string; fraction?: number } = {},
): LocalRequestPlan<M> {
  const window = opts.window ?? DEFAULT_LOCAL_MAX_MODEL_LEN;
  const extraText = opts.extraText ?? '';
  const fraction = opts.fraction ?? 1;
  let msgs = messages;
  let estPrompt = estimateMessagesTokens(msgs, extraText);
  let trimmed: LocalRequestPlan<M>['trimmed'];

  const wantOut = Math.min(requestedMax, LOCAL_TRIM_TARGET_OUTPUT);
  const needsTrim = fraction < 1 || clampMaxTokens(requestedMax, estPrompt, window) < Math.min(requestedMax, LOCAL_MIN_OUTPUT_TOKENS);
  if (needsTrim) {
    const inputBudget = Math.floor((window - LOCAL_WINDOW_RESERVE - wantOut) * fraction);
    const fit = fitToLocalWindow(msgs, inputBudget, extraText);
    if (fit.droppedMsgs || fit.trimmedChars) trimmed = { droppedMsgs: fit.droppedMsgs, trimmedChars: fit.trimmedChars };
    msgs = fit.messages;
    estPrompt = fit.estTokens;
  }

  // Still over budget after every trim (the fixed system block + tool specs
  // alone can fill the window): the estimate is deliberately pessimistic, so
  // send with the minimum useful output and let vLLM be the arbiter — a
  // rejection takes the retry path and then the honest error.
  const clamped = clampMaxTokens(requestedMax, estPrompt, window);
  const floor = Math.min(requestedMax, LOCAL_MIN_OUTPUT_TOKENS);
  const overBudget = clamped < floor;
  const maxTokens = overBudget ? floor : clamped;
  return {
    messages: msgs,
    maxTokens,
    estPrompt,
    ...(overBudget ? { overBudget: true } : {}),
    ...(maxTokens < requestedMax ? { clampedFrom: requestedMax } : {}),
    ...(trimmed ? { trimmed } : {}),
  };
}

/** Log the plan's one-liners (clamp / trim) — shared by both transports. */
export function logLocalPlan(plan: LocalRequestPlan<LocalMessage>, log: (line: string) => void = console.warn): void {
  if (plan.trimmed) log(`[local] trimmed history ${plan.trimmed.droppedMsgs} msgs, ${plan.trimmed.trimmedChars} chars`);
  if (plan.overBudget) log(`[local] prompt≈${plan.estPrompt} still over the window after trimming (system + tool specs); sending with max_tokens ${plan.maxTokens}`);
  else if (plan.clampedFrom !== undefined) log(`[local] clamped max_tokens ${plan.clampedFrom}→${plan.maxTokens} (prompt≈${plan.estPrompt})`);
}

/**
 * True when a failed local response is the window-overflow / proxy-rewrap
 * shape worth one retry with a harder trim: a non-JSON (HTML) body from the
 * RunPod sync proxy, or vLLM's own context-length 400.
 */
export function isRetryableLocalFailure(status: number, body: string): boolean {
  const trimmed = body.trimStart();
  const nonJson = !(trimmed.startsWith('{') || trimmed.startsWith('['));
  if (nonJson && status >= 400) return true;
  return /maximum context length|context length|too many tokens/i.test(body);
}

export function upstreamErrorMessage(status: number): string {
  return `Local lane upstream error (${status}) — likely request too large or worker restarting`;
}

/** What the table sees when the local lane fails even after the shorter retry. */
export const LOCAL_LANE_USER_MESSAGE =
  "JEWL couldn't answer — the local model rejected the request; a retry with a shorter context also failed.";
