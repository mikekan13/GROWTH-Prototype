'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { GrowthCharacter } from '@/types/growth';
import type { GrowthLocation } from '@/types/location';
import type { GrowthWorldItem } from '@/types/item';
import { calculateCharacterTKV, calculateItemKV, calculateLocationKV, type HeldItemForTKV } from '@/lib/kv-calculator';
import { recomputeAugments } from '@/lib/character-actions';
import type { CanvasFolder } from '@/types/canvas';
import { useCampaignStream } from '@/hooks/useCampaignStream';
import CampaignHeader from '@/components/canvas/CampaignHeader';
import { TABLE_FEED_EVENT } from '@/components/copilot/JewlChip';
import type { FeedEntity } from '@/components/terminal/table-feed/TableFeedRows';
import type { CampaignStreamEvent, EffortWagerPromptEvent } from '@/types/campaign-events';
import type { TerminalEvent } from '@/types/terminal';

const RelationsCanvas = dynamic(() => import('@/components/canvas/RelationsCanvas'), { ssr: false });
const CampaignTerminal = dynamic(() => import('@/components/terminal/CampaignTerminal'), { ssr: false });
const ForgeWorkshop = dynamic(() => import('@/components/forge/ForgeWorkshop'), { ssr: false });
const TapestryTab = dynamic(() => import('@/components/tapestry/TapestryTab'), { ssr: false });
const CharacterTab = dynamic(() => import('@/components/character/CharacterTab'), { ssr: false });
const EffortWagerModal = dynamic(() => import('@/components/campaign/EffortWagerModal'), { ssr: false });
const ContractsDock = dynamic(() => import('@/components/canvas/ContractsDock'), { ssr: false });
const DeathSaveDialog = dynamic(() => import('@/components/character/DeathSaveDialog'), { ssr: false });

interface CanvasNode {
  id: string;
  type: 'character' | 'npc' | 'location' | 'quest' | 'item';
  name: string;
  x: number;
  y: number;
  placedAt?: number;
  status?: string;
  color?: string;
  portrait?: string | null;
  characterData?: Record<string, unknown> | null;
  /** Character has a GodHead row (AI persona exists). */
  hasAIPersona?: boolean;
  /** AI is currently choosing this character's actions. */
  aiActionMode?: boolean;
  /** Current human owner/controller. Either a player or the GM's userId. */
  controllerUserId?: string;
  locationType?: string;
  locationData?: GrowthLocation | null;
  itemType?: string;
  itemData?: GrowthWorldItem | null;
  holderId?: string | null;
  holderName?: string;
  locationName?: string;
}

interface Connection {
  from: string;
  to: string;
  type: 'alliance' | 'conflict' | 'goal' | 'resistance' | 'opportunity' | 'owns' | 'located_at';
  strength: number;
}

/** A campaign trailblazer the GM can assign as a character's controller. */
export interface TrailblazerOption {
  userId: string;
  username: string;
}

interface CampaignCanvasProps {
  campaign: {
    id: string;
    name: string;
    inviteCode: string | null;
    genre: string | null;
    /** Server-side whole-canvas re-lay counter (JEWL organizing the canvas). */
    canvasLayoutEpoch?: number;
  };
  nodes: CanvasNode[];
  connections: Connection[];
  userId?: string;
  username?: string;
  userRole?: string;
  userCharacter?: { id: string; name: string; data: string } | null;
  /** Roster used by the canvas card controller dropdown. */
  trailblazers?: TrailblazerOption[];
  /** Server-generated folders from located_at relationships (e.g. Tree of
   *  Life containing its 10 Sephirot rooms). Merged with localStorage
   *  user-customized folders — user version wins per-id. */
  autoFolders?: CanvasFolder[];
  /** Parent/child spatial graph. Used to compute the focal-entity filter
   *  and the breadcrumb path during drill-in navigation. */
  locatedAtEdges?: Array<{ child: string; parent: string }>;
  /** Lookup of every entity's display name, INCLUDING parent Locations
   *  that were filtered out of `nodes` (they live only as folder headers
   *  now). Used by the breadcrumb. */
  entityNames?: Record<string, string>;
}

type Tab = 'canvas' | 'forge' | 'tapestry' | 'character';
// Tab was renamed from 'relations' to 'canvas' (2026-03-11), 'essence' to 'tapestry' (2026-03-14)

const MIN_TERMINAL_HEIGHT = 150;
const MAX_TERMINAL_FRACTION = 0.8;

interface CampaignEconomyData {
  fluid: string;
  crystallized: string;
  total: string;
}

/**
 * Layout epoch gate (2026-09-28, Mike: "please reset it for me"): when the
 * server has re-laid the whole canvas since this browser last looked, drop
 * everything this browser remembers about the campaign's canvas (positions,
 * folders, collapse states, drill-in focus, camera, zoom) and reload once, so
 * the server layout is what renders. Runs before any canvas state initializer
 * reads storage. Never loops: the new epoch is stored before the reload.
 */
function applyLayoutEpochGate(campaignId: string, serverEpoch: number | undefined): boolean {
  if (typeof window === 'undefined' || typeof serverEpoch !== 'number') return false;
  const key = `canvas-${campaignId}-layoutEpoch`;
  let seen = 0;
  try { seen = Number(localStorage.getItem(key) ?? '0') || 0; } catch { return false; }
  if (serverEpoch <= seen) return false;
  try {
    const prefix = `canvas-${campaignId}-`;
    for (const k of Object.keys(localStorage)) if (k.startsWith(prefix) && k !== key) localStorage.removeItem(k);
    localStorage.setItem(key, String(serverEpoch));
  } catch { return false; }
  window.location.reload();
  return true;
}

export default function CampaignCanvas({ campaign, nodes: initialNodes, connections, userId, username, userRole, userCharacter, trailblazers, autoFolders, locatedAtEdges = [], entityNames = {} }: CampaignCanvasProps) {
  const [epochReloading] = useState(() => applyLayoutEpochGate(campaign.id, campaign.canvasLayoutEpoch));
  void epochReloading;
  const [activeTab, setActiveTab] = useState<Tab>('canvas');
  // In-canvas character selection: when set, the Character tab loads THIS character
  // instead of the user's own PC. Cleared when navigating to a non-character tab so
  // the user's own PC shows next time the Character tab is opened without a selection.
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const handleSelectCharacter = useCallback((id: string) => {
    setSelectedCharacterId(id);
    setActiveTab('character');
  }, []);
  useEffect(() => {
    if (activeTab !== 'character') {
      setSelectedCharacterId(null);
    }
  }, [activeTab]);
  const [nodes, setNodes] = useState(initialNodes);
  const [showTerminal, setShowTerminal] = useState(false);
  // P1 mirror: the JEWL header shows "◆ table" while the mic feeds the table;
  // the TERMINAL toggle tab shows the same glyph so the GM sees it with JEWL
  // closed. Blue = feeding, gold = holding an unfinished sentence.
  const [tableFeed, setTableFeed] = useState<{ holding: boolean } | null>(null);
  useEffect(() => {
    const onFeed = (e: Event) => {
      const d = (e as CustomEvent<{ fed?: boolean; holding?: boolean }>).detail;
      setTableFeed(d?.fed ? { holding: !!d.holding } : null);
    };
    window.addEventListener(TABLE_FEED_EVENT, onFeed);
    return () => window.removeEventListener(TABLE_FEED_EVENT, onFeed);
  }, []);
  // The TABLE feed's world: portraits for the chips, names for the entity spans.
  const tableEntities = useMemo<FeedEntity[]>(() => nodes.flatMap((n): FeedEntity[] => {
    if (n.type === 'character' || n.type === 'npc') return [{ id: n.id, name: n.name, kind: n.type, portrait: n.portrait ?? null, status: n.status }];
    if (n.type === 'location') return [{ id: n.id, name: n.name, kind: 'location', subtype: n.locationType, description: n.locationData?.description }];
    if (n.type === 'item') return [{ id: n.id, name: n.name, kind: 'item', subtype: n.itemType, where: n.holderName ?? n.locationName, description: n.itemData?.description }];
    return [];
  }), [nodes]);
  // Tell floating chrome (the phone JEWL summon button in JewlChip) whether the
  // terminal drawer is open, so nothing floats over the table log during play.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('growth:terminal-drawer', { detail: { open: showTerminal } }));
  }, [showTerminal]);
  const [pendingWager, setPendingWager] = useState<EffortWagerPromptEvent | null>(null);
  // Stores check result data until the die settles, then posts to terminal
  const pendingCheckResultRef = useRef<Record<string, unknown> | null>(null);

  // ── Contested check state machine ──
  interface ContestedState {
    phase: 'selecting_defender' | 'attacker_wagering' | 'defender_wagering' | 'complete';
    attackerId: string;
    attackerName: string;
    attackerSkill: string;
    attackerGovernors: string[];
    revealDR: boolean;
    defenderId?: string;
    defenderName?: string;
    defenderSkill?: string;
    defenderGovernors?: string[];
    attackerTotal?: number;
    attackerResult?: Record<string, unknown>;
    defenderResult?: Record<string, unknown>;
  }
  const [contestedState, setContestedState] = useState<ContestedState | null>(null);

  const router = useRouter();

  // ── Refresh discipline (audit 2026-08-03) ──
  // Unthrottled router.refresh() calls (JEWL working events, drop
  // persists, chip watchers) remounted the canvas every ~3-4s and yanked
  // gestures out from under the pointer. ALL background refreshes go
  // through this gate: min 4s apart, and NEVER while a canvas gesture is
  // live (RelationsCanvas stamps window.__growthLastGestureAt).
  const lastRefreshAtRef = useRef(0);
  const pendingRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRefresh = useCallback(() => {
    const attempt = () => {
      const lastGesture = (window as unknown as { __growthLastGestureAt?: number }).__growthLastGestureAt ?? 0;
      const gestureLive = Date.now() - lastGesture < 600;
      const since = Date.now() - lastRefreshAtRef.current;
      if (gestureLive || since < 4000) {
        if (pendingRefreshRef.current) clearTimeout(pendingRefreshRef.current);
        pendingRefreshRef.current = setTimeout(attempt, gestureLive ? 800 : Math.max(500, 4000 - since));
        return;
      }
      lastRefreshAtRef.current = Date.now();
      pendingRefreshRef.current = null;
      router.refresh();
    };
    attempt();
  }, [router]);

  // ── Real-time SSE stream ──
  const streamEventsRef = useRef<TerminalEvent[]>([]);
  const [streamEventsTick, setStreamEventsTick] = useState(0);

  // F-2 construction-site feedback: while JEWL runs a build dispatch, a
  // visible badge shows what he's laying down; each committed tool
  // refreshes the page data (throttled) so his work materializes AS he
  // builds, not only when the reply lands.
  const [jewlWorking, setJewlWorking] = useState<{ active: boolean; label: string } | null>(null);
  const jewlRefreshAtRef = useRef(0);
  const jewlDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { connected, connectedUsers } = useCampaignStream({
    campaignId: campaign.id,
    onEvent: useCallback((event: CampaignStreamEvent) => {
      const { data } = event;

      // JEWL live-work ticker
      if (data.kind === 'jewl_working') {
        if (data.phase === 'done') {
          // Let the badge linger a beat so fast builds are still seen.
          if (jewlDoneTimerRef.current) clearTimeout(jewlDoneTimerRef.current);
          jewlDoneTimerRef.current = setTimeout(() => setJewlWorking(null), 1500);
          requestRefresh();
        } else {
          if (jewlDoneTimerRef.current) { clearTimeout(jewlDoneTimerRef.current); jewlDoneTimerRef.current = null; }
          setJewlWorking({
            active: true,
            label: data.phase === 'tool' && data.label ? data.label : 'working…',
          });
          // Materialize committed work progressively (gated).
          if (data.phase === 'tool') requestRefresh();
        }
      }

      // Handle terminal events — accumulate for the terminal to consume
      if (data.kind === 'terminal_event') {
        const te = data.event;
        // Avoid duplicates by ID
        if (!streamEventsRef.current.some(e => e.id === te.id)) {
          streamEventsRef.current = [...streamEventsRef.current, te];
          setStreamEventsTick(n => n + 1);
        }
      }

      // Perception unit 9: someone else's line happened — no text; the terminal re-reads its perceived feed.
      if (data.kind === 'perceived_feed_stale') {
        window.dispatchEvent(new CustomEvent('growth:perceived-feed-stale'));
      }

      // Handle effort wager prompts — show modal to the player
      if (data.kind === 'effort_wager_prompt') {
        setPendingWager(data);
      }

      // Clear contested state when checks resolve
      if (data.kind === 'check_result') {
        // For contested: the defender's result clears the line
        // Simple heuristic: if we're in contested mode and get a result, clear after a short delay
        if (contestedState) {
          setTimeout(() => setContestedState(null), 2000);
        }
      }

      // Handle character updates — refresh the page data
      if (data.kind === 'character_update') {
        requestRefresh();
      }

      // JEWL stage direction — relay to the canvas layer, which alone
      // knows live geometry (folder rects, fan-out positions).
      if (data.kind === 'jewl_focus' || data.kind === 'jewl_highlight') {
        window.dispatchEvent(new CustomEvent('growth:jewl-stage', { detail: data }));
      }
    }, [requestRefresh]),
  });

  // ── Post skill check result to terminal after die settles ──
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { source?: string };
      if (detail?.source !== 'service') return;
      const result = pendingCheckResultRef.current;
      if (!result) return;
      pendingCheckResultRef.current = null;

      // Normal skill check — post to terminal (contested checks are handled server-side)
      const showDR = result.revealDR;
      await fetch(`/api/campaigns/${campaign.id}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dice_roll',
          characterId: result.characterId,
          characterName: result.characterName,
          payload: {
            kind: 'dice_roll',
            context: showDR
              ? `${result.skillName || 'Unskilled'} check vs DR ${result.dr}`
              : `${result.skillName || 'Unskilled'} check`,
            skillName: result.skillName,
            skillLevel: result.isSkilled ? result.skillLevel : undefined,
            skillDie: { die: result.sdDie, value: result.sdResult, isFlat: String(result.sdDie).startsWith('flat') },
            fateDie: { die: result.fdDie, value: result.fdResult },
            effort: result.effort,
            effortAttribute: result.effortAttribute,
            total: result.total,
            dr: showDR ? result.dr : undefined,
            success: result.success,
            margin: showDR ? result.margin : undefined,
            isSkilled: result.isSkilled,
          },
        }),
      }).catch(() => {});
    };

    window.addEventListener('growth:dice-settled', handler);
    return () => window.removeEventListener('growth:dice-settled', handler);
  }, [campaign.id, contestedState]);

  // ── Contested check line (ref-based for smooth animation) ──
  const [defenderPickerTarget, setDefenderPickerTarget] = useState<{ id: string; name: string } | null>(null);
  const contestedLineRef = useRef<SVGLineElement>(null);
  const contestedDot1Ref = useRef<SVGCircleElement>(null);
  const contestedDot2Ref = useRef<SVGCircleElement>(null);
  const contestedMouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!contestedState) return;

    const onMouseMove = (e: MouseEvent) => { contestedMouseRef.current = { x: e.clientX, y: e.clientY }; };
    if (contestedState.phase === 'selecting_defender') {
      window.addEventListener('mousemove', onMouseMove);
    }

    let rafId: number;
    const update = () => {
      const line = contestedLineRef.current;
      const d1 = contestedDot1Ref.current;
      const d2 = contestedDot2Ref.current;
      if (line && d1 && d2) {
        const aEl = document.querySelector(`[data-node-id="${contestedState.attackerId}"]`);
        if (aEl) {
          const r = aEl.getBoundingClientRect();
          const ax = String(r.left + r.width / 2), ay = String(r.top + r.height / 2);
          line.setAttribute('x1', ax); line.setAttribute('y1', ay);
          d1.setAttribute('cx', ax); d1.setAttribute('cy', ay);
        }
        const dId = contestedState.defenderId;
        if (dId) {
          const dEl = document.querySelector(`[data-node-id="${dId}"]`);
          if (dEl) {
            const r = dEl.getBoundingClientRect();
            const dx = String(r.left + r.width / 2), dy = String(r.top + r.height / 2);
            line.setAttribute('x2', dx); line.setAttribute('y2', dy);
            d2.setAttribute('cx', dx); d2.setAttribute('cy', dy);
            d2.setAttribute('r', '5'); d2.setAttribute('opacity', '0.9');
            line.setAttribute('stroke-dasharray', 'none');
            line.setAttribute('stroke-width', '2.5'); line.setAttribute('opacity', '0.9');
          }
        } else {
          const m = contestedMouseRef.current;
          line.setAttribute('x2', String(m.x)); line.setAttribute('y2', String(m.y));
          d2.setAttribute('cx', String(m.x)); d2.setAttribute('cy', String(m.y));
          d2.setAttribute('r', '3'); d2.setAttribute('opacity', '0.4');
          line.setAttribute('stroke-dasharray', '8 4');
          line.setAttribute('stroke-width', '1.5'); line.setAttribute('opacity', '0.6');
        }
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);

    return () => { cancelAnimationFrame(rafId); window.removeEventListener('mousemove', onMouseMove); };
  }, [contestedState]);

  // ── Crystallization modal (planning → active) ────────────────────────────
  // Listens for 'growth:crystallize-location' from any folder's CRYSTALLIZE
  // button. Shows a confirmation modal with the subtree summary + KRMA cost.
  // On commit, PATCHes the location status with cascade=true.
  const [pendingLocationCommit, setPendingLocationCommit] = useState<{
    locationId: string;
    locationName: string;
    krmaReserve?: number;
    contentCounts?: { locations?: number; characters?: number; npcs?: number; items?: number };
  } | null>(null);
  const [crystallizing, setCrystallizing] = useState(false);
  const [crystallizeErr, setCrystallizeErr] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.locationId) return;
      setCrystallizeErr(null);
      setPendingLocationCommit(detail);
    };
    window.addEventListener('growth:crystallize-location', handler);
    return () => window.removeEventListener('growth:crystallize-location', handler);
  }, []);

  const commitCrystallize = useCallback(async () => {
    if (!pendingLocationCommit) return;
    setCrystallizing(true);
    setCrystallizeErr(null);
    try {
      const res = await fetch(`/api/locations/${pendingLocationCommit.locationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIVE', cascade: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        setCrystallizeErr(err.error || 'Failed to crystallize');
        return;
      }
      setPendingLocationCommit(null);
      router.refresh();
    } catch (err) {
      setCrystallizeErr(err instanceof Error ? err.message : 'Network error');
    } finally {
      setCrystallizing(false);
    }
  }, [pendingLocationCommit, router]);

  // ── Focal entity (drill-in navigation) ───────────────────────────────────
  // When set, the canvas shows only entities that are direct children of
  // this entity. null = campaign root (everything visible). Persisted per
  // campaign so the GM resumes where they were.
  const focalStorageKey = `canvas-${campaign.id}-focal`;
  // Initialize to null and restore from localStorage AFTER mount — reading
  // localStorage in the useState initializer makes the first client render
  // differ from the server render (React hydration mismatch).
  const [focalEntityId, setFocalEntityIdState] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(focalStorageKey);
      if (raw && raw !== 'null') setFocalEntityIdState(raw);
    } catch { /* ignore */ }
  }, [focalStorageKey]);
  const setFocalEntityId = useCallback((id: string | null) => {
    setFocalEntityIdState(id);
    try { localStorage.setItem(focalStorageKey, id ?? 'null'); } catch { /* ignore */ }
  }, [focalStorageKey]);

  // Compute the breadcrumb path by walking located_at edges upward from focal.
  const breadcrumb = useMemo(() => {
    if (!focalEntityId) return [];
    const childToParent = new Map(locatedAtEdges.map(e => [e.child, e.parent]));
    const path: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    let current: string | null = focalEntityId;
    while (current && !seen.has(current)) {
      seen.add(current);
      path.unshift({ id: current, name: entityNames[current] ?? '???' });
      current = childToParent.get(current) ?? null;
    }
    return path;
  }, [focalEntityId, locatedAtEdges, entityNames]);

  // ── Folder state (persisted to localStorage) ──
  const folderStorageKey = `canvas-${campaign.id}-folders`;
  const [folders, setFolders] = useState<CanvasFolder[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(folderStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as CanvasFolder[];
        // Migrate: initialize posX/posY for folders that don't have them
        let migrated = false;
        const result = parsed.map(f => {
          if (f.posX == null || f.posY == null) {
            migrated = true;
            // Compute from node positions if possible, otherwise use defaults
            const MIN_W = 620;
            const MIN_H = 120;
            return {
              ...f,
              posX: f.posX ?? -MIN_W / 2,
              posY: f.posY ?? (f.type === 'party' ? -(MIN_H + 40) : 100),
            };
          }
          return f;
        });
        if (migrated) {
          try { localStorage.setItem(folderStorageKey, JSON.stringify(result)); } catch { /* ignore */ }
        }
        return result;
      }
    } catch { /* ignore */ }
    return [];
  });

  const handleFoldersChange = useCallback((newFolders: CanvasFolder[]) => {
    // Stamp movedAt on folders whose position/size changed, so a later
    // server placement (JEWL) can be compared against the GM's last drag.
    setFolders((prev) => {
      const prevById = new Map(prev.map((f) => [f.id, f]));
      const now = Date.now();
      const stamped = newFolders.map((f) => {
        const p = prevById.get(f.id);
        const moved = !p || p.posX !== f.posX || p.posY !== f.posY || p.userWidth !== f.userWidth || p.userHeight !== f.userHeight;
        return moved ? { ...f, movedAt: now } : f;
      });
      try { localStorage.setItem(folderStorageKey, JSON.stringify(stamped)); } catch { /* ignore */ }
      return stamped;
    });
  }, [folderStorageKey]);

  // Keep folder nodeIds in sync — remove deleted nodes
  useEffect(() => {
    const nodeIds = new Set(nodes.map(n => n.id));
    const cleaned = folders.map(f => ({
      ...f,
      nodeIds: f.nodeIds.filter(id => nodeIds.has(id)),
    }));
    const changed = cleaned.some((f, i) => f.nodeIds.length !== folders[i].nodeIds.length);
    if (changed) handleFoldersChange(cleaned);
  }, [nodes, folders, handleFoldersChange]);

  // Effective folders = user-stored ∪ auto-generated (user wins per-id).
  // Auto-folders default to collapsed so the canvas reads calm by default —
  // GM expands when they want to look inside, per the world-design pillar.
  const allEffectiveFolders = useMemo(() => {
    // For auto-folders, the SERVER is the source of truth for membership
    // and location info — a cached folder object froze its nodeIds at
    // whatever the graph looked like when first stored, silently
    // discarding every later located_at change (bug-scout 2026-08-02:
    // all four apartment folders cached with nodeIds:[]). Only the
    // GM-authored layout fields persist from storage.
    const storedById = new Map(folders.map(f => [f.id, f]));
    const autoIds = new Set((autoFolders ?? []).map(af => af.id));
    const merged = folders.filter(f => !autoIds.has(f.id));
    for (const af of autoFolders ?? []) {
      const stored = storedById.get(af.id);
      // Position: the GM's stored drag wins UNLESS the server placed this
      // location more recently (JEWL organizing the canvas, the sim moving
      // things) — Mike 2026-09-26: "I do not see a change on the canvas".
      const serverStamp = af.placedAt ?? 0;
      const localStamp = stored?.movedAt ?? 0;
      const localPosWins = stored?.posX != null && stored?.posY != null && localStamp >= serverStamp;
      merged.push({
        // Server-fresh: nodeIds, locationInfo, name, type.
        ...af,
        // GM-authored overrides that should persist:
        ...(localPosWins ? { posX: stored!.posX, posY: stored!.posY } : {}),
        ...(stored?.userWidth != null ? { userWidth: stored.userWidth } : {}),
        ...(stored?.userHeight != null ? { userHeight: stored.userHeight } : {}),
        // Every Location renders as a container per the world-recursive
        // design — and OPEN by default: a location folder is a real AREA
        // like the party folder (Mike 2026-08-02), not a collapsed strip.
        collapsed: stored?.collapsed ?? af.collapsed ?? false,
        // Details panel stays compact unless the GM opened it (A6).
        ...(stored?.detailsOpen != null ? { detailsOpen: stored.detailsOpen } : {}),
      });
    }
    // Deterministic fan-out for Location folders without stored coords.
    // Seeded/imported children often have no canvasX/Y — without this they
    // all land on the same default point and stack into an unreadable pile
    // (the 10 Sephirot folders all rendered at one spot).
    const parentByChild = new Map(locatedAtEdges.map(e => [e.child, e.parent]));
    const folderIndexById = new Map(merged.map((f, i) => [f.id, i]));
    const siblingCounter = new Map<string, number>();
    for (let i = 0; i < merged.length; i++) {
      const f = merged[i];
      if (!f.id.startsWith('auto-') || typeof f.posX === 'number') continue;
      const locId = f.id.slice('auto-'.length);
      const parentId = parentByChild.get(locId);
      const parentIdx = parentId ? folderIndexById.get(`auto-${parentId}`) : undefined;
      const parent = parentIdx !== undefined ? merged[parentIdx] : undefined;
      const key = parentId ?? '__root__';
      const idx = siblingCounter.get(key) ?? 0;
      siblingCounter.set(key, idx + 1);
      const baseX = (typeof parent?.posX === 'number' ? parent.posX : 0) + 80;
      const baseY = (typeof parent?.posY === 'number' ? parent.posY : 0) + 180;
      merged[i] = { ...f, posX: baseX + (idx % 4) * 560, posY: baseY + Math.floor(idx / 4) * 240 };
    }
    return merged;
  }, [folders, autoFolders, locatedAtEdges]);

  // ── Focal-filtered nodes + folders ─────────────────────────────────────────
  // When focal is null: show everything (campaign root view).
  // When focal is set: show entities that are DIRECT children of focal.
  //   - A "child" = there exists a located_at edge from that entity to focal,
  //     OR (for top-level Locations the folder represents) the auto-folder
  //     id matches `auto-${focal}`.
  const focalView = useMemo(() => {
    if (!focalEntityId) {
      // Campaign root: an entity stays HIDDEN while any ancestor Location's
      // folder is collapsed — contents live "inside" the closed folder.
      // Expanding a folder reveals its children (recursively, until the next
      // collapsed level). Without this, child Location folders rendered at
      // root alongside their parents.
      const collapsedByLoc = new Map<string, boolean>();
      for (const f of allEffectiveFolders) {
        if (f.id.startsWith('auto-')) collapsedByLoc.set(f.id.slice('auto-'.length), !!f.collapsed);
      }
      const parentByChild = new Map(locatedAtEdges.map(e => [e.child, e.parent]));
      const hiddenByAncestorCollapse = (id: string): boolean => {
        let cur = parentByChild.get(id);
        // Seed with the entity's own id: a corrupted/cyclic parent chain
        // (e.g. Apartment ↔ Kitchen) must never let a folder hide ITSELF
        // by walking back around to its own collapsed state — that was
        // the collapse-makes-everything-vanish bug.
        const seen = new Set<string>([id]);
        while (cur && !seen.has(cur)) {
          if (collapsedByLoc.get(cur)) return true;
          seen.add(cur);
          cur = parentByChild.get(cur);
        }
        return false;
      };
      return {
        nodes: nodes.filter(n => !hiddenByAncestorCollapse(n.id)),
        folders: allEffectiveFolders.filter(f =>
          !f.id.startsWith('auto-') || !hiddenByAncestorCollapse(f.id.slice('auto-'.length)),
        ),
      };
    }
    const directChildIds = new Set<string>(
      locatedAtEdges.filter(e => e.parent === focalEntityId).map(e => e.child),
    );
    const filteredNodes = nodes.filter(n => directChildIds.has(n.id));
    // Folders whose parent (encoded in `auto-${parentId}`) is itself one of
    // the visible children — i.e. children that are themselves containers.
    const filteredFolders = allEffectiveFolders.filter(f => {
      if (!f.id.startsWith('auto-')) return false; // hide manual folders while drilled in
      const parentId = f.id.slice('auto-'.length);
      return directChildIds.has(parentId);
    });
    return { nodes: filteredNodes, folders: filteredFolders };
  }, [focalEntityId, nodes, allEffectiveFolders, locatedAtEdges]);

  // Forge items (published, for Canvas toolbox "Place from Forge")
  const [forgeItems, setForgeItems] = useState<Array<{ id: string; name: string; type: string; data: Record<string, unknown> }>>([]);

  // KRMA economy data (GM / Admin)
  const isGM = userRole === 'WATCHER' || userRole === 'ADMIN' || userRole === 'GODHEAD';
  const [economy, setEconomy] = useState<CampaignEconomyData | null>(null);

  useEffect(() => {
    if (!isGM) return;
    let cancelled = false;

    async function fetchEconomy() {
      try {
        const res = await fetch(`/api/krma/campaigns/${campaign.id}/economy`);
        if (!res.ok) return;
        if (!cancelled) {
          const data = await res.json();
          setEconomy({ fluid: data.fluid, crystallized: data.crystallized, total: data.total });
        }
      } catch { /* silent */ }
    }

    fetchEconomy();
    const interval = setInterval(fetchEconomy, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isGM, campaign.id]);

  // Fetch published forge items for Canvas toolbox
  useEffect(() => {
    if (!isGM) return;
    let cancelled = false;
    async function fetchForgeItems() {
      try {
        const res = await fetch(`/api/campaigns/${campaign.id}/forge?status=published&type=item`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setForgeItems((data.items || []).map((fi: Record<string, unknown>) => ({
          id: fi.id as string,
          name: fi.name as string,
          type: fi.type as string,
          data: (fi.data || {}) as Record<string, unknown>,
        })));
      } catch { /* silent */ }
    }
    fetchForgeItems();
    return () => { cancelled = true; };
  }, [isGM, campaign.id]);

  // ── Crystallization state ──
  const [crystallizedEntityIds, setCrystallizedEntityIds] = useState<Set<string>>(new Set());
  const [crystallizeTarget, setCrystallizeTarget] = useState<{
    nodeId: string;
    nodeType: string;
    nodeName: string;
    direction: 'crystallize' | 'dissolve';
    kv: number;
    previousY: number;
  } | null>(null);
  const [isCrystallizing, setIsCrystallizing] = useState(false);
  const moveNodeRef = useRef<((nodeId: string, y: number) => void) | null>(null);

  // Fetch crystallized entities on mount
  useEffect(() => {
    if (!isGM) return;
    let cancelled = false;
    async function fetchCrystallized() {
      try {
        const res = await fetch(`/api/krma/campaigns/${campaign.id}/crystallize`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setCrystallizedEntityIds(new Set(data.crystallizedEntityIds || []));
        }
      } catch { /* silent */ }
    }
    fetchCrystallized();
    return () => { cancelled = true; };
  }, [isGM, campaign.id]);

  // Held items for a character (filtered from canvas nodes); used for TKV item-contribution
  const getHeldItemsForCharacter = useCallback((charId: string, nodeList: CanvasNode[]): HeldItemForTKV[] => {
    return nodeList
      .filter(n => n.type === 'item' && n.holderId === charId && n.itemData)
      .map(n => ({
        id: n.id,
        name: n.name,
        type: n.itemType,
        data: n.itemData as unknown as import('@/types/item').GrowthWorldItem,
      }));
  }, []);

  // Calculate KV for an entity by looking it up in nodes
  const getEntityKV = useCallback((nodeId: string, nodeType: string): number => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return 0;
    if (nodeType === 'character' && node.characterData) {
      try {
        const charData = node.characterData as unknown as GrowthCharacter;
        if (charData?.attributes) {
          const heldItems = getHeldItemsForCharacter(nodeId, nodes);
          const tkv = calculateCharacterTKV(charData, heldItems);
          return tkv.total;
        }
      } catch { /* fallback */ }
      return 0;
    }
    if (nodeType === 'item' && node.itemData) {
      return calculateItemKV(node.itemData);
    }
    if (nodeType === 'location' && node.locationData) {
      return calculateLocationKV(node.locationData);
    }
    return 0;
  }, [nodes]);

  // Handle entity crossing the KRMA line
  const handleEntityCrossLine = useCallback((
    event: { nodeId: string; nodeType: string; nodeName: string; direction: 'crystallize' | 'dissolve'; previousY: number },
    moveNode: (nodeId: string, y: number) => void,
  ) => {
    if (!isGM) return;
    const kv = getEntityKV(event.nodeId, event.nodeType);
    moveNodeRef.current = moveNode;
    setCrystallizeTarget({ nodeId: event.nodeId, nodeType: event.nodeType, nodeName: event.nodeName, direction: event.direction, kv, previousY: event.previousY });
  }, [isGM, getEntityKV]);

  // Confirm crystallization/dissolution — entity stays where user dropped it
  const handleConfirmCrystallize = useCallback(async () => {
    if (!crystallizeTarget) return;
    setIsCrystallizing(true);
    try {
      const res = await fetch(`/api/krma/campaigns/${campaign.id}/crystallize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: crystallizeTarget.nodeId,
          entityType: crystallizeTarget.nodeType,
          entityName: crystallizeTarget.nodeName,
          karmicValue: crystallizeTarget.kv,
          action: crystallizeTarget.direction,
        }),
      });
      if (res.ok) {
        setCrystallizedEntityIds(prev => {
          const next = new Set(prev);
          if (crystallizeTarget.direction === 'crystallize') {
            next.add(crystallizeTarget.nodeId);
          } else {
            next.delete(crystallizeTarget.nodeId);
          }
          return next;
        });
      } else {
        const data = await res.json();
        alert(data.error || 'Crystallization failed');
        moveNodeRef.current?.(crystallizeTarget.nodeId, crystallizeTarget.previousY);
      }
    } catch {
      alert('Connection failed');
      moveNodeRef.current?.(crystallizeTarget.nodeId, crystallizeTarget.previousY);
    } finally {
      setIsCrystallizing(false);
      setCrystallizeTarget(null);
      moveNodeRef.current = null;
    }
  }, [crystallizeTarget, campaign.id]);

  // Cancel crystallization — snap entity back to where it was
  const handleCancelCrystallize = useCallback(() => {
    if (crystallizeTarget) {
      moveNodeRef.current?.(crystallizeTarget.nodeId, crystallizeTarget.previousY);
    }
    moveNodeRef.current = null;
    setCrystallizeTarget(null);
  }, [crystallizeTarget]);

  // Resizable terminal height — persisted per campaign
  const storageKey = `terminal-height-${campaign.id}`;
  const [terminalHeight, setTerminalHeight] = useState(() => {
    if (typeof window === 'undefined') return 350;
    try {
      const stored = localStorage.getItem(storageKey);
      const n = stored ? parseInt(stored, 10) : NaN;
      return Number.isFinite(n) && n >= 150 ? n : 350;
    } catch { return 350; }
  });
  const isResizing = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  // <main>'s live height — the drawer can never exceed a fraction of it
  // (rotation / mobile URL-bar changes re-clamp via the observer).
  const [mainHeight, setMainHeight] = useState(0);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    setMainHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setMainHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const clampTerminalHeight = useCallback((h: number, mainH: number) => {
    if (!mainH) return h;
    return Math.max(Math.min(MIN_TERMINAL_HEIGHT, mainH * MAX_TERMINAL_FRACTION), Math.min(mainH * MAX_TERMINAL_FRACTION, h));
  }, []);
  const effectiveTerminalHeight = clampTerminalHeight(terminalHeight, mainHeight);

  // Persist terminal height
  useEffect(() => {
    try { localStorage.setItem(storageKey, String(terminalHeight)); } catch { /* ignore */ }
  }, [terminalHeight, storageKey]);

  // Parse user's character data for terminal
  const parsedCharacter = userCharacter ? (() => {
    try {
      return {
        id: userCharacter.id,
        name: userCharacter.name,
        data: JSON.parse(userCharacter.data) as GrowthCharacter,
      };
    } catch { return null; }
  })() : null;

  // Compute TKV for character nodes
  const stampTKV = useCallback((nodeList: CanvasNode[]): CanvasNode[] => {
    return nodeList.map(n => {
      if (n.type !== 'character' || !n.characterData) return n;
      try {
        const charData = n.characterData as unknown as GrowthCharacter;
        if (charData?.attributes) {
          const heldItems = getHeldItemsForCharacter(n.id, nodeList);
          const tkv = calculateCharacterTKV(charData, heldItems);
          return { ...n, characterData: { ...n.characterData, tkv: tkv.total } as Record<string, unknown> };
        }
      } catch { /* keep original */ }
      return n;
    });
  }, [getHeldItemsForCharacter]);

  // Sync local nodes when server re-fetches (e.g. after revert)
  useEffect(() => {
    setNodes(stampTKV(initialNodes));
  }, [initialNodes, stampTKV]);

  // Debounced save: collect rapid changes and persist once after settling
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleCharacterUpdate = useCallback((nodeId: string, character: GrowthCharacter, changes: string[]) => {
    // Recompute augments from equipped items + traits before saving
    const { character: augmented } = recomputeAugments(character);

    // Compute TKV and update local state immediately for responsive UI
    let tkvValue = 0;
    try {
      if (augmented?.attributes) {
        const heldItems = getHeldItemsForCharacter(nodeId, nodes);
        tkvValue = calculateCharacterTKV(augmented, heldItems).total;
      }
    } catch { /* fallback to 0 */ }
    const charWithTKV = { ...augmented, tkv: tkvValue } as unknown as Record<string, unknown>;
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, characterData: charWithTKV } : n
    ));

    // Debounce the API save (300ms) so rapid slider drags don't spam requests
    const existing = saveTimersRef.current.get(nodeId);
    if (existing) clearTimeout(existing);

    saveTimersRef.current.set(nodeId, setTimeout(async () => {
      saveTimersRef.current.delete(nodeId);
      let saved = false;
      try {
        const res = await fetch(`/api/characters/${nodeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: augmented }),
        });
        saved = res.ok;
      } catch {
        // Silent fail — next interaction will retry
      }
      // Fire-and-forget observation event so JEWL witnesses manual character
      // edits. Debounced save collapses rapid edits into one observation;
      // that's fine — the change list reflects whatever landed.
      // See [[jewl-is-the-interface-2026-06-15]].
      if (saved && changes.length > 0) {
        const changeStr = changes.join(', ');
        const compact = changeStr.length > 300 ? `${changeStr.slice(0, 300)}…` : changeStr;
        void fetch(`/api/campaigns/${campaign.id}/observation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mutationKind: 'character-edit',
            targetType: 'character',
            targetId: nodeId,
            summary: `GM edited character ${nodeId}: ${compact}`,
          }),
        }).catch(() => { /* best-effort */ });
      }
    }, 300));
  }, [campaign.id]);

  const handleCreateCharacter = useCallback(async (name: string) => {
    try {
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, campaignId: campaign.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create character');
        return;
      }
      router.refresh();
      void fetch(`/api/campaigns/${campaign.id}/observation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mutationKind: 'create-character',
          targetType: 'campaign',
          targetId: campaign.id,
          summary: `GM created character "${name}"`,
        }),
      }).catch(() => { /* best-effort observation */ });
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  // Right-click "Create NPC here" on a Location card. Prompts for a name,
  // POSTs a new character wired as a located_at child of the parent. The
  // canvas folder system auto-nests the result, so River Styx / Undead Army
  // / any flat Location promotes to a folder the moment the first child lands.
  const handleCreateChildCharacterAtLocation = useCallback(async (parentLocationId: string, worldX: number, worldY: number) => {
    const name = typeof window !== 'undefined' ? window.prompt('Name the NPC:') : null;
    if (!name || !name.trim()) return;
    try {
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), campaignId: campaign.id, parentLocationId, canvasX: worldX, canvasY: worldY }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to create NPC');
        return;
      }
      const json = await res.json().catch(() => ({}));
      const newId: string | undefined = json?.character?.id;
      router.refresh();
      // After the server-rendered page refreshes, pan the canvas camera to
      // either the new NPC or its parent folder so the user sees what they
      // just authored. RelationsCanvas listens for growth:focus-canvas-node
      // and tweens the viewport to that entity (or its auto-folder).
      if (typeof window !== 'undefined') {
        const target = newId ?? parentLocationId;
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('growth:focus-canvas-node', { detail: { entityId: target } }));
        }, 800);
      }
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  // Place (or reposition) an existing campaign character onto the canvas.
  // Optimistic: add/move the node locally so it appears instantly, then persist
  // canvas coordinates via the server (PATCH-equivalent) so it survives reloads.
  const handlePlaceCharacter = useCallback(async (characterId: string, x: number, y: number) => {
    // Optimistic local update — if the node already exists, reposition; otherwise fetch + add.
    setNodes(prev => {
      const existingIdx = prev.findIndex(n => n.id === characterId && n.type === 'character');
      if (existingIdx >= 0) {
        return prev.map(n => n.id === characterId ? { ...n, x, y } : n);
      }
      return prev;
    });

    // If the character isn't already on the canvas, hydrate its data and add a node.
    if (!nodes.some(n => n.id === characterId && n.type === 'character')) {
      try {
        const res = await fetch(`/api/characters/${characterId}`);
        if (res.ok) {
          const { character } = await res.json();
          const parsed = (() => {
            try { return typeof character.data === 'string' ? JSON.parse(character.data) : character.data; }
            catch { return null; }
          })();
          setNodes(prev => {
            if (prev.some(n => n.id === characterId)) return prev;
            return stampTKV([
              ...prev,
              {
                id: characterId,
                type: 'character' as const,
                name: character.name,
                x, y,
                status: character.status,
                portrait: character.portrait,
                characterData: parsed,
              },
            ]);
          });
        }
      } catch {
        // Silent — server persist below is still attempted.
      }
    }

    // Persist position
    try {
      await fetch(`/api/characters/${characterId}/canvas-position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y }),
      });
    } catch {
      // Persistence failed; the optimistic node will revert on reload.
    }
  }, [nodes, stampTKV]);

  const handleCreateLocation = useCallback(async (input: {
    name: string;
    type?: string;
    canvasX?: number;
    canvasY?: number;
    description?: string;
    krmaReserve?: number;
    environment?: string;
    population?: string;
    dangerLevel?: number;
    controlledBy?: string;
    notes?: string;
    tags?: string[];
  }) => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create location');
        return;
      }
      router.refresh();
      void fetch(`/api/campaigns/${campaign.id}/observation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mutationKind: 'create-location',
          targetType: 'campaign',
          targetId: campaign.id,
          summary: `GM created location "${input.name}"${input.description ? ` — ${input.description.slice(0, 120)}` : ''}`,
        }),
      }).catch(() => { /* best-effort observation */ });
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  const handleCreateItem = useCallback(async (name: string, type: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create item');
        return;
      }
      router.refresh();
      void fetch(`/api/campaigns/${campaign.id}/observation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mutationKind: 'create-item',
          targetType: 'campaign',
          targetId: campaign.id,
          summary: `GM created ${type} "${name}"`,
        }),
      }).catch(() => { /* best-effort observation */ });
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  const handleDeleteLocation = useCallback(async (nodeId: string) => {
    if (!confirm('Delete this draft location?')) return;
    // Snapshot the name before delete so JEWL's observation has a usable label.
    const snapshotName = nodes.find(n => n.id === nodeId)?.name ?? 'location';
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/locations/${nodeId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || 'Failed to delete location');
        return;
      }
      router.refresh();
      void fetch(`/api/campaigns/${campaign.id}/observation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mutationKind: 'delete-location',
          targetType: 'location',
          targetId: nodeId,
          summary: `GM deleted location "${snapshotName}"`,
        }),
      }).catch(() => { /* best-effort observation */ });
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, nodes, router]);

  /** EDIT commit from the JEWL dialog: merge the revised fields into the
   *  Location's existing data JSON (preserving canvas coords, timescale
   *  override, etc.) and PATCH. */
  const handleEditLocation = useCallback(async (locationId: string, input: {
    name: string;
    description?: string;
    krmaReserve?: number;
    environment?: string;
    population?: string;
    dangerLevel?: number;
    controlledBy?: string;
    notes?: string;
    tags?: string[];
    timescaleId?: string;
  }) => {
    try {
      const getRes = await fetch(`/api/campaigns/${campaign.id}/locations/${locationId}`);
      if (!getRes.ok) { alert('Failed to load location for edit'); return; }
      const payload = await getRes.json();
      const current = payload.location ?? payload; // route may wrap
      const currentData = (typeof current.data === 'string'
        ? JSON.parse(current.data) : current.data) ?? {};
      const mergedData = {
        ...currentData,
        description: input.description ?? '',
        krmaReserve: input.krmaReserve,
        environment: input.environment,
        population: input.population,
        dangerLevel: input.dangerLevel,
        controlledBy: input.controlledBy,
        notes: input.notes,
        tags: input.tags ?? [],
        timescaleId: input.timescaleId, // undefined = inherit (key dropped by stringify)
      };
      const res = await fetch(`/api/campaigns/${campaign.id}/locations/${locationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.name, data: mergedData }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || 'Failed to update location');
        return;
      }
      router.refresh();
      void fetch(`/api/campaigns/${campaign.id}/observation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mutationKind: 'edit-location',
          targetType: 'location',
          targetId: locationId,
          summary: `GM edited location "${input.name}"${input.description ? ` — ${input.description.slice(0, 120)}` : ''}`,
        }),
      }).catch(() => { /* best-effort observation */ });
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  /** Dissolve an ACTIVE Location back to PLANNING — the weightier
   *  alternative to deletion for crystallized world-pieces
   *  (ruling r-2026-06-09-09). KRMA settlement hook lands with the
   *  crystallize-debit build. */
  const handleDissolveLocation = useCallback(async (locationId: string) => {
    if (!confirm('Dissolve this place back to the planning layer? It leaves the active world.')) return;
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/locations/${locationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PLANNING' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || 'Failed to dissolve location');
        return;
      }
      router.refresh();
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  const handleDeleteItem = useCallback(async (nodeId: string) => {
    if (!confirm('Delete this item?')) return;
    const snapshotName = nodes.find(n => n.id === nodeId)?.name ?? 'item';
    try {
      await fetch(`/api/campaigns/${campaign.id}/items/${nodeId}`, { method: 'DELETE' });
      router.refresh();
      void fetch(`/api/campaigns/${campaign.id}/observation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mutationKind: 'delete-item',
          targetType: 'item',
          targetId: nodeId,
          summary: `GM deleted item "${snapshotName}"`,
        }),
      }).catch(() => { /* best-effort observation */ });
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, nodes, router]);

  const handleItemUpdate = useCallback(async (itemId: string, data: GrowthWorldItem) => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      if (!res.ok) return;
      // Update local state
      setNodes(prev => prev.map(n =>
        n.id === itemId ? { ...n, itemData: data as unknown as typeof n.itemData } : n
      ));
    } catch { /* silent */ }
  }, [campaign.id]);

  const handleCreateItemFromForge = useCallback(async (name: string, type: string, data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, data }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to place item');
        return;
      }
      router.refresh();
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  const handleItemTransfer = useCallback(async (itemId: string, holderId: string | null) => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holderId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to transfer item');
        return;
      }
      // Update local node state immediately for responsive UI, then re-stamp TKV
      // so the affected character's TKV reflects the new inventory contents.
      setNodes(prev => stampTKV(prev.map(n =>
        n.id === itemId ? {
          ...n,
          holderId,
          holderName: holderId
            ? prev.find(c => c.id === holderId)?.name
            : undefined,
        } : n
      )));
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, stampTKV]);

  // The right-click action used to permanently delete the character record.
  // That was destructive, broken, and conceptually wrong for the canvas
  // surface. Now it just hides the card via the canvas-position DELETE
  // endpoint (clears canvasX/Y + sets hiddenFromCanvas=true). Re-place via
  // the Tools picker or JEWL to bring it back.
  const handleRemoveCharacterFromCanvas = useCallback(async (nodeId: string) => {
    const snapshotName = nodes.find(n => n.id === nodeId)?.name ?? 'character';
    // Optimistic local removal so the card disappears immediately.
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    try {
      const res = await fetch(`/api/characters/${nodeId}/canvas-position`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to remove from canvas');
        // Rollback by refetching from server.
        router.refresh();
        return;
      }
      void fetch(`/api/campaigns/${campaign.id}/observation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mutationKind: 'remove-character-from-canvas',
          targetType: 'character',
          targetId: nodeId,
          summary: `GM removed "${snapshotName}" from canvas`,
        }),
      }).catch(() => { /* best-effort observation */ });
    } catch {
      alert('Connection failed');
      router.refresh();
    }
  }, [campaign.id, nodes, router]);

  // ── Resize handler ──────────────────────────────────────────────────────

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;

    const startY = e.clientY;
    const startHeight = effectiveTerminalHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const dy = startY - moveEvent.clientY;
      const mainEl = mainRef.current;
      setTerminalHeight(clampTerminalHeight(startHeight + dy, mainEl ? mainEl.clientHeight : 0));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [effectiveTerminalHeight, clampTerminalHeight]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'forge', label: 'Forge' },
    { key: 'canvas', label: 'Canvas' },
    { key: 'tapestry', label: 'Tapestry' },
    ...(!isGM ? [{ key: 'character' as Tab, label: 'Character' }] : []),
  ];

  return (
    <div className="h-dvh bg-[var(--surface-dark)] flex flex-col overflow-hidden">
      {/* ── JEWL construction site — visible while he lays work down (F-2).
          The ⚒ badge names the last committed piece; page data refreshes
          progressively underneath so his builds materialize live. */}
      {jewlWorking?.active && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[95] pointer-events-none"
          style={{ top: 72 }}
          aria-live="polite"
        >
          <div
            style={{
              background: '#000',
              border: '1px solid rgba(208, 160, 48, 0.6)',
              boxShadow: '0 0 18px rgba(208, 160, 48, 0.35)',
              padding: '6px 14px',
              fontFamily: 'Consolas, monospace',
              fontSize: 12,
              color: '#D0A030',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ animation: 'pulse 1.2s ease-in-out infinite' }}>⚒</span>
            <span style={{ color: '#fff' }}>JEWL is building</span>
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>— {jewlWorking.label}</span>
          </div>
        </div>
      )}
      {/* Campaign header — rulebook order voice, Option 2 (Mike 2026-10-07). */}
      <CampaignHeader
        campaign={campaign}
        isGM={isGM}
        economy={economy}
        tabs={tabs}
        activeTab={activeTab}
        onTab={setActiveTab}
      />

      {/* Canvas content area — fills remaining space */}
      <main ref={mainRef} className="flex-1 relative overflow-hidden">
        {/* Contested mode banner */}
        {contestedState?.phase === 'selecting_defender' && (
          <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-center gap-4 py-2 px-4" style={{
            backgroundColor: 'rgba(208, 160, 48, 0.15)',
            borderBottom: '1px solid #D0A03060',
          }}>
            <span className="text-xs uppercase tracking-[0.2em]" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: '#D0A030',
            }}>
              CONTESTED: {contestedState.attackerName} ({contestedState.attackerSkill}) — RIGHT-CLICK DEFENDER
            </span>
            <button
              onClick={() => setContestedState(null)}
              className="text-[10px] uppercase px-2 py-0.5 border hover:bg-white/10"
              style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: '#ff6666', borderColor: '#ff666640' }}
            >
              CANCEL
            </button>
          </div>
        )}
        {activeTab === 'canvas' && (
          <>
            {/* Breadcrumb overlay — shows the focal-entity path. Click any
                crumb to drill back up that far. Click "Campaign Root" to
                clear focus and show the whole map. Only renders when
                drilled in (focal is set). */}
            {focalEntityId && (
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 30,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(0,0,0,0.75)',
                  border: '1px solid rgba(255,204,120,0.4)',
                  borderRadius: 3,
                  padding: '6px 14px',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  fontSize: 12,
                  pointerEvents: 'auto',
                  boxShadow: '0 0 18px rgba(255,204,120,0.18)',
                }}
              >
                <button
                  onClick={() => setFocalEntityId(null)}
                  style={{
                    color: 'var(--krma-gold)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    letterSpacing: '0.06em',
                  }}
                  title="Back to campaign root"
                >
                  ◇ CAMPAIGN
                </button>
                {breadcrumb.map((crumb, i) => (
                  <React.Fragment key={crumb.id}>
                    <span style={{ color: 'rgba(255,255,255,0.35)' }}>▸</span>
                    <button
                      onClick={() => setFocalEntityId(crumb.id)}
                      disabled={i === breadcrumb.length - 1}
                      style={{
                        color: i === breadcrumb.length - 1 ? '#fff' : 'var(--krma-gold)',
                        background: 'transparent',
                        border: 'none',
                        cursor: i === breadcrumb.length - 1 ? 'default' : 'pointer',
                        padding: 0,
                        fontFamily: 'inherit',
                        fontSize: 'inherit',
                        fontWeight: i === breadcrumb.length - 1 ? 700 : 400,
                        letterSpacing: '0.04em',
                      }}
                      title={i === breadcrumb.length - 1 ? 'You are here' : `Drill back to ${crumb.name}`}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          {/* Crystallization confirmation modal — location subtree commit. */}
          {pendingLocationCommit && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 100,
                fontFamily: 'var(--font-terminal), Consolas, monospace',
              }}
              onClick={() => !crystallizing && setPendingLocationCommit(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: '#1a1a2e',
                  border: '2px solid var(--krma-gold)',
                  borderRadius: 6,
                  padding: 28,
                  maxWidth: 500,
                  minWidth: 380,
                  color: '#fff',
                  boxShadow: '0 0 60px rgba(255,204,120,0.3)',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                    fontSize: 22,
                    letterSpacing: '0.12em',
                    color: 'var(--krma-gold)',
                    marginBottom: 4,
                  }}
                >
                  ✦ CRYSTALLIZE
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em', marginBottom: 18 }}>
                  PLANNING → ACTIVE · cascade through subtree
                </div>
                <div style={{ fontSize: 16, marginBottom: 16, color: '#fff' }}>
                  {pendingLocationCommit.locationName}
                </div>
                {pendingLocationCommit.contentCounts && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 14,
                      marginBottom: 16,
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.7)',
                    }}
                  >
                    {(pendingLocationCommit.contentCounts.locations ?? 0) > 0 && (
                      <span><span style={{ color: 'var(--terminal-prime)' }}>⌂</span> {pendingLocationCommit.contentCounts.locations} sub-locations</span>
                    )}
                    {(pendingLocationCommit.contentCounts.characters ?? 0) > 0 && (
                      <span><span style={{ color: 'var(--pillar-body)' }}>✴</span> {pendingLocationCommit.contentCounts.characters} characters</span>
                    )}
                    {(pendingLocationCommit.contentCounts.npcs ?? 0) > 0 && (
                      <span><span style={{ color: 'var(--krma-gold)' }}>✴</span> {pendingLocationCommit.contentCounts.npcs} NPCs</span>
                    )}
                    {(pendingLocationCommit.contentCounts.items ?? 0) > 0 && (
                      <span><span style={{ color: '#8e7cc3' }}>❖</span> {pendingLocationCommit.contentCounts.items} items</span>
                    )}
                  </div>
                )}
                {pendingLocationCommit.krmaReserve != null && (
                  <div
                    style={{
                      padding: '12px 16px',
                      border: '1px solid rgba(255,204,120,0.4)',
                      borderRadius: 3,
                      background: 'rgba(255,204,120,0.06)',
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ fontSize: 10, color: 'var(--krma-gold)', letterSpacing: '0.15em', marginBottom: 4 }}>
                      KRMA TO DEBIT
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                        fontSize: 28,
                        color: 'var(--krma-gold)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {pendingLocationCommit.krmaReserve.toLocaleString()} Ҝ
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                      (wallet debit not yet wired — TBD)
                    </div>
                  </div>
                )}
                {crystallizeErr && (
                  <div
                    style={{
                      padding: 8,
                      border: '1px solid #E8585A55',
                      background: 'rgba(232,88,90,0.08)',
                      color: '#E8585A',
                      fontSize: 12,
                      marginBottom: 14,
                    }}
                  >
                    ✗ {crystallizeErr}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setPendingLocationCommit(null)}
                    disabled={crystallizing}
                    style={{
                      padding: '8px 16px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: 'rgba(255,255,255,0.7)',
                      fontFamily: 'inherit',
                      fontSize: 12,
                      letterSpacing: '0.08em',
                      cursor: 'pointer',
                    }}
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={commitCrystallize}
                    disabled={crystallizing}
                    style={{
                      padding: '8px 20px',
                      background: 'linear-gradient(135deg, var(--krma-gold), #d09f55)',
                      border: '1px solid var(--krma-gold)',
                      color: '#000',
                      fontFamily: 'inherit',
                      fontSize: 12,
                      letterSpacing: '0.12em',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 0 12px rgba(255,204,120,0.4)',
                    }}
                  >
                    {crystallizing ? 'COMMITTING…' : 'COMMIT'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <RelationsCanvas
            connections={connections}
            campaignId={campaign.id}
            crystallizedEntityIds={crystallizedEntityIds}
            trailblazers={trailblazers}
            onCreateCharacter={handleCreateCharacter}
            onPlaceCharacter={handlePlaceCharacter}
            onDeleteCharacter={handleRemoveCharacterFromCanvas}
            onCharacterUpdate={handleCharacterUpdate}
            onCreateLocation={handleCreateLocation}
            onDeleteLocation={handleDeleteLocation}
            onEditLocation={handleEditLocation}
            onDissolveLocation={handleDissolveLocation}
            onCreateChildCharacterAtLocation={handleCreateChildCharacterAtLocation}
            onCreateItem={handleCreateItem}
            onDeleteItem={handleDeleteItem}
            onItemUpdate={handleItemUpdate}
            onItemTransfer={handleItemTransfer}
            onCreateItemFromForge={handleCreateItemFromForge}
            forgeItems={forgeItems}
            onEntityCrossLine={handleEntityCrossLine}
            folders={focalView.folders}
            nodes={focalView.nodes}
            focalEntityId={focalEntityId}
            onDrillIn={setFocalEntityId}
            onFoldersChange={handleFoldersChange}
            onRestComplete={() => router.refresh()}
            onLocationReparented={() => router.refresh()}
            onDropIntoLocation={async (nodeId, nodeType, locationId) => {
              // Persist the drop server-side — located_at edges are the
              // membership truth for location folders.
              try {
                if (nodeType === 'character') {
                  await fetch(`/api/characters/${nodeId}/location`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ locationId }),
                  });
                } else {
                  await fetch(`/api/campaigns/${campaign.id}/items/${nodeId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ locationId }),
                  });
                }
                requestRefresh();
              } catch { /* drop persist failed — next refresh shows truth */ }
            }}
            isGM={isGM}
            contestedAttackerId={contestedState?.phase === 'selecting_defender' ? contestedState.attackerId : undefined}
            onContestedCheck={isGM ? (characterId, characterName, skillName, governors, revealDR) => {
              // Store attacker governors on window so defender card can read them
              (window as unknown as Record<string, unknown>).__contestedAttackerGovernors = governors;
              setContestedState({
                phase: 'selecting_defender',
                attackerId: characterId,
                attackerName: characterName,
                attackerSkill: skillName,
                attackerGovernors: governors,
                revealDR,
              });
            } : undefined}
            onContestedDefenderSelect={contestedState?.phase === 'selecting_defender' ? (defenderId, defenderName) => {
              // Set defender on contested state so line anchors, then open picker modal
              setContestedState(prev => prev ? { ...prev, defenderId, defenderName } : null);
              setDefenderPickerTarget({ id: defenderId, name: defenderName });
            } : undefined}
            onSkillCheck={isGM ? async (characterId, skillName, attributeName, dr, revealDR) => {
              try {
                const res = await fetch(`/api/campaigns/${campaign.id}/skill-check`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ characterId, skillName, attributeName, dr, revealDR }),
                });
                if (!res.ok) {
                  const err = await res.json();
                  console.error('[SkillCheck]', err.error);
                }
              } catch (err) {
                console.error('[SkillCheck] Connection failed', err);
              }
            } : undefined}
          />
          </>
        )}

        {activeTab === 'forge' && (
          <ForgeWorkshop
            campaignId={campaign.id}
            isGM={userRole === 'WATCHER' || userRole === 'ADMIN' || userRole === 'GODHEAD'}
            userId={userId || ''}
          />
        )}


        {activeTab === 'tapestry' && (
          <TapestryTab campaignId={campaign.id} isGM={isGM} nodes={nodes} onSelectCharacter={handleSelectCharacter} />
        )}

        {activeTab === 'character' && (
          <CharacterTab
            campaignId={campaign.id}
            userId={userId}
            userRole={userRole}
            isGM={isGM}
            userCharacter={userCharacter}
            selectedCharacterId={selectedCharacterId}
            // The canvas IS the Watcher Console — the GM's explicit edit
            // surface. Without this the entities→edit path opened PLAYER_
            // CHARACTER sheets read-only (B: pair-session 2026-08-07).
            // Server-side updateCharacter still owns the real permission gate.
            canEdit={isGM}
          />
        )}

        {/* Campaign Terminal — resizable bottom overlay */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: showTerminal ? `${effectiveTerminalHeight}px` : '0',
            zIndex: 50,
            pointerEvents: showTerminal ? 'auto' : 'none',
            transition: showTerminal ? 'none' : 'height 0.3s ease-in-out',
          }}
        >
          {/* Toggle tab */}
          {/* Pull tab \u2014 the drawer's header voice (Bebas gold on navy, 2026-10-08) */}
          <button
            onClick={() => setShowTerminal(prev => !prev)}
            aria-expanded={showTerminal}
            data-no-hold
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              top: -36,
              height: 36,
              padding: '4px 16px 0',
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
              fontSize: 17,
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
              color: '#ffcc78',
              backgroundColor: '#002f6c',
              border: 0,
              boxShadow: '0 -2px 8px rgba(0,0,0,.3)',
              pointerEvents: 'auto',
              zIndex: 51,
              cursor: 'pointer',
            }}
          >
            {tableFeed && (
              <span
                aria-label={tableFeed.holding ? 'The table is holding an unfinished sentence' : 'The mic is feeding the table'}
                title={tableFeed.holding ? 'Holding an unfinished sentence for the next chunk' : 'The mic is feeding the table \u2014 what you say becomes the world. Mute JEWL to stop.'}
                style={{ color: tableFeed.holding ? 'var(--krma-gold, #ffcc78)' : '#6fa8dc', marginRight: 6, fontSize: 12, fontFamily: 'var(--font-terminal), Consolas, monospace' }}
              >
                {'\u25C6'}
              </span>
            )}
            {showTerminal ? '\u25BE Terminal' : '\u25B4 Terminal'}
          </button>

          {/* Resize handle */}
          {showTerminal && (
            <div
              onMouseDown={handleResizeStart}
              className="absolute top-0 left-0 right-0 h-[6px] cursor-ns-resize"
              style={{
                zIndex: 52,
                backgroundColor: 'transparent',
              }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-[3px]" style={{
                backgroundColor: 'rgba(255, 204, 120, 0.7)',
                marginTop: '1px',
              }} />
            </div>
          )}

          {/* Panel content — always mounted so event listeners stay active */}
          <div className="h-full" style={{
            borderTop: '3px solid #002f6c',
            backgroundColor: '#cfe2f2',
            boxShadow: '0 -6px 18px rgba(0,0,0,.3)',
            display: showTerminal ? 'block' : 'none',
          }}>
            <CampaignTerminal
              campaignId={campaign.id}
              visible={showTerminal}
              character={parsedCharacter}
              onCharacterUpdate={(charId, char, changes) => handleCharacterUpdate(charId, char, changes)}
              onRevert={() => router.refresh()}
              onRestComplete={() => router.refresh()}
              userId={userId}
              username={username}
              userRole={userRole}
              streamEvents={streamEventsRef.current}
              streamEventsTick={streamEventsTick}
              connected={connected}
              connectedUsers={connectedUsers}
              campaignCharacters={nodes.filter(n => n.type === 'character' || n.type === 'npc').map(n => ({ id: n.id, name: n.name }))}
              tableEntities={tableEntities}
              onClose={() => setShowTerminal(false)}
            />
          </div>
        </div>

        {/* Contracts dock — ADMIN-only, __PRIME__ campaign only */}
        {campaign.name === '__PRIME__' && userRole === 'ADMIN' && (
          <ContractsDock campaignId={campaign.id} />
        )}
      </main>

      {/* Effort Wager Modal */}
      {pendingWager && (
        <EffortWagerModal
          prompt={pendingWager}
          campaignId={campaign.id}
          onComplete={async (wagers, sdDie, screenX, screenY) => {
            const checkId = pendingWager.checkId;
            setPendingWager(null);

            // Submit wager to server
            try {
              const res = await fetch(`/api/campaigns/${campaign.id}/skill-check/wager`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkId, wagers }),
              });

              if (res.ok) {
                const data = await res.json();
                // Store result — will be posted to terminal after die settles
                pendingCheckResultRef.current = data;
                // Spawn the Fate Die in the player's hand at cursor position
                const fateDie = pendingWager.fateDie;
                if (fateDie) {
                  window.dispatchEvent(new CustomEvent('growth:spawn-die-in-hand', {
                    detail: {
                      dieType: fateDie,
                      screenX,
                      screenY,
                      serverValue: data.fdResult,
                    },
                  }));
                }
              } else {
                const err = await res.json();
                console.error('[Wager]', err.error);
              }
            } catch (err) {
              console.error('[Wager] Connection failed', err);
            }
          }}
          onError={(err) => { console.error('[Wager]', err); setPendingWager(null); }}
        />
      )}

      {/* Contested check line overlay — ref-based, updated via RAF */}
      {contestedState && (
        <svg className="fixed inset-0 z-40 pointer-events-none" style={{ width: '100vw', height: '100vh' }}>
          <line ref={contestedLineRef} x1="0" y1="0" x2="0" y2="0" stroke="#D0A030" strokeWidth="1.5" strokeDasharray="8 4" opacity="0.6" />
          <circle ref={contestedDot1Ref} cx="0" cy="0" r="5" fill="#D0A030" opacity="0.9" />
          <circle ref={contestedDot2Ref} cx="0" cy="0" r="3" fill="#D0A030" opacity="0.4" />
        </svg>
      )}

      {/* Defender skill picker modal */}
      {defenderPickerTarget && contestedState && (() => {
        const defenderNode = nodes.find(n => n.id === defenderPickerTarget.id);
        const defenderData = defenderNode?.characterData;
        const defenderSkills = (Array.isArray(defenderData?.skills) ? defenderData.skills : []) as Array<{ name: string; level: number; governors?: string[] }>;
        const attackerGovs = contestedState.attackerGovernors;
        const overlappingSkills = defenderSkills.filter(s =>
          (s.governors || []).some(g => attackerGovs.includes(g))
        );

        const startContested = async (defenderSkill: string, defenderGovernors: string[]) => {
          const cs = contestedState;
          setDefenderPickerTarget(null);
          setContestedState({ ...cs, phase: 'attacker_wagering', defenderId: defenderPickerTarget.id, defenderName: defenderPickerTarget.name, defenderSkill, defenderGovernors });

          try {
            const isRawAttacker = cs.attackerSkill.startsWith('raw:');
            const isRawDefender = defenderSkill.startsWith('raw:');
            const res = await fetch(`/api/campaigns/${campaign.id}/contested-check`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                attackerCharacterId: cs.attackerId,
                attackerSkillName: isRawAttacker ? undefined : cs.attackerSkill,
                attackerAttributeName: isRawAttacker ? cs.attackerSkill.slice(4) : undefined,
                defenderCharacterId: defenderPickerTarget.id,
                defenderSkillName: isRawDefender ? undefined : defenderSkill,
                defenderAttributeName: isRawDefender ? defenderSkill.slice(4) : undefined,
                defenderGovernors,
                revealDR: cs.revealDR,
              }),
            });
            if (!res.ok) {
              const err = await res.json();
              console.error('[Contested]', err.error);
              setContestedState(null);
            }
          } catch {
            console.error('[Contested] Connection failed');
            setContestedState(null);
          }
        };

        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="border-2 p-0 overflow-hidden" style={{
              backgroundColor: '#0a0a1a',
              borderColor: '#D0A030',
              boxShadow: '0 0 30px #D0A03040',
              width: '280px',
            }}>
              {/* Header */}
              <div className="px-4 py-2" style={{ backgroundColor: '#D0A03015', borderBottom: '1px solid #D0A03030' }}>
                <div className="text-xs tracking-[0.2em] uppercase" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: '#D0A030' }}>
                  DEFENDER: {defenderPickerTarget.name}
                </div>
                <div className="text-[10px] mt-0.5" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: '#D0A03080' }}>
                  vs {contestedState.attackerName} ({contestedState.attackerSkill.startsWith('raw:') ? contestedState.attackerSkill.slice(4).toUpperCase() : contestedState.attackerSkill})
                </div>
              </div>
              {/* Matching skills */}
              <div className="px-4 py-3 space-y-1">
                {overlappingSkills.length === 0 && (
                  <div className="text-[10px] text-white/40 font-[Consolas,monospace] py-1">No matching skills</div>
                )}
                {overlappingSkills.map(s => {
                  const overlap = (s.governors || []).filter(g => attackerGovs.includes(g));
                  return (
                    <button
                      key={s.name}
                      onClick={() => startContested(s.name, overlap)}
                      className="w-full px-2 py-1 text-left text-sm hover:bg-[#D0A030]/20 font-[Consolas,monospace] flex items-center justify-between"
                      style={{ color: '#fff' }}
                    >
                      <span>{s.name}</span>
                      <span className="text-[9px]" style={{ color: '#D0A03080' }}>
                        Lv{s.level} — {overlap.join('/')}
                      </span>
                    </button>
                  );
                })}
                {/* Unskilled — raw attribute from attacker's governors */}
                <div className="border-t border-white/10 pt-2 mt-2">
                  <div className="text-[8px] text-white/30 font-[Consolas,monospace] mb-1">UNSKILLED (FD ONLY)</div>
                  <div className="flex gap-2">
                    {attackerGovs.map(gov => (
                      <button
                        key={gov}
                        onClick={() => startContested(`raw:${gov}`, [gov])}
                        className="px-2 py-0.5 text-[10px] hover:bg-white/10 font-[Consolas,monospace] border border-white/10"
                        style={{ color: '#aaa' }}
                      >
                        {gov.slice(0, 3).toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Cancel */}
              <div className="px-4 py-2 flex justify-end" style={{ backgroundColor: '#111' }}>
                <button
                  onClick={() => setDefenderPickerTarget(null)}
                  className="text-[10px] uppercase px-3 py-1 border hover:bg-white/10"
                  style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: '#888', borderColor: '#444' }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Crystallization confirmation dialog */}
      <ConfirmDialog
        isOpen={crystallizeTarget !== null}
        onClose={handleCancelCrystallize}
        onConfirm={handleConfirmCrystallize}
        title={crystallizeTarget?.direction === 'crystallize' ? 'Crystallize Entity' : 'Dissolve Entity'}
        message={
          crystallizeTarget?.direction === 'crystallize'
            ? `Do you want to crystallize "${crystallizeTarget?.nodeName}" into the campaign?\n\nThis will commit ${crystallizeTarget?.kv} KV to the campaign ledger.`
            : `Do you want to dissolve "${crystallizeTarget?.nodeName}" back to fluid state?\n\nThis will remove ${crystallizeTarget?.kv} KV from the campaign ledger.`
        }
        confirmText={crystallizeTarget?.direction === 'crystallize' ? 'Crystallize' : 'Dissolve'}
        cancelText="Cancel"
        isLoading={isCrystallizing}
        variant={crystallizeTarget?.direction === 'crystallize' ? 'info' : 'danger'}
      />

      {/* Death save consequence surface — mounts invisible, activates on SSE event */}
      <DeathSaveDialog campaignId={campaign.id} isGM={isGM} />
    </div>
  );
}
