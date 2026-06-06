'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { GrowthCharacter } from '@/types/growth';
import type { GrowthLocation } from '@/types/location';
import type { GrowthWorldItem } from '@/types/item';
import { calculateCharacterTKV, calculateItemKV, calculateLocationKV, type HeldItemForTKV } from '@/lib/kv-calculator';
import { recomputeAugments } from '@/lib/character-actions';
import type { CanvasFolder } from '@/types/canvas';
import { useCampaignStream } from '@/hooks/useCampaignStream';
import type { CampaignStreamEvent, EffortWagerPromptEvent } from '@/types/campaign-events';
import type { TerminalEvent } from '@/types/terminal';

function formatKrma(value: string): string {
  return Number(value).toLocaleString();
}

const RelationsCanvas = dynamic(() => import('@/components/canvas/RelationsCanvas'), { ssr: false });
const CampaignTerminal = dynamic(() => import('@/components/terminal/CampaignTerminal'), { ssr: false });
const ForgeWorkshop = dynamic(() => import('@/components/forge/ForgeWorkshop'), { ssr: false });
const TapestryTab = dynamic(() => import('@/components/tapestry/TapestryTab'), { ssr: false });
const CharacterTab = dynamic(() => import('@/components/character/CharacterTab'), { ssr: false });
const EffortWagerModal = dynamic(() => import('@/components/campaign/EffortWagerModal'), { ssr: false });

interface CanvasNode {
  id: string;
  type: 'character' | 'npc' | 'location' | 'quest' | 'item';
  name: string;
  x: number;
  y: number;
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

export default function CampaignCanvas({ campaign, nodes: initialNodes, connections, userId, username, userRole, userCharacter, trailblazers, autoFolders, locatedAtEdges = [], entityNames = {} }: CampaignCanvasProps) {
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
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [nodes, setNodes] = useState(initialNodes);
  const [showTerminal, setShowTerminal] = useState(false);
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

  // ── Real-time SSE stream ──
  const streamEventsRef = useRef<TerminalEvent[]>([]);
  const [streamEventsTick, setStreamEventsTick] = useState(0);

  const { connected, connectedUsers } = useCampaignStream({
    campaignId: campaign.id,
    onEvent: useCallback((event: CampaignStreamEvent) => {
      const { data } = event;

      // Handle terminal events — accumulate for the terminal to consume
      if (data.kind === 'terminal_event') {
        const te = data.event;
        // Avoid duplicates by ID
        if (!streamEventsRef.current.some(e => e.id === te.id)) {
          streamEventsRef.current = [...streamEventsRef.current, te];
          setStreamEventsTick(n => n + 1);
        }
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
        router.refresh();
      }
    }, [router]),
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
  const [focalEntityId, setFocalEntityIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(focalStorageKey);
      return raw ? (raw === 'null' ? null : raw) : null;
    } catch { return null; }
  });
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
    setFolders(newFolders);
    try { localStorage.setItem(folderStorageKey, JSON.stringify(newFolders)); } catch { /* ignore */ }
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
    if (!autoFolders || autoFolders.length === 0) return folders;
    const storedIds = new Set(folders.map(f => f.id));
    const merged = [...folders];
    for (const af of autoFolders) {
      if (!storedIds.has(af.id) && af.nodeIds.length > 0) {
        merged.push({ ...af, collapsed: af.collapsed ?? true });
      }
    }
    return merged;
  }, [folders, autoFolders]);

  // ── Focal-filtered nodes + folders ─────────────────────────────────────────
  // When focal is null: show everything (campaign root view).
  // When focal is set: show entities that are DIRECT children of focal.
  //   - A "child" = there exists a located_at edge from that entity to focal,
  //     OR (for top-level Locations the folder represents) the auto-folder
  //     id matches `auto-${focal}`.
  const focalView = useMemo(() => {
    if (!focalEntityId) {
      return { nodes, folders: allEffectiveFolders };
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
      return stored ? parseInt(stored) : 350;
    } catch { return 350; }
  });
  const isResizing = useRef(false);
  const mainRef = useRef<HTMLElement>(null);

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

  const handleCharacterUpdate = useCallback((nodeId: string, character: GrowthCharacter, _changes: string[]) => {
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
      try {
        await fetch(`/api/characters/${nodeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: augmented }),
        });
      } catch {
        // Silent fail — next interaction will retry
      }
    }, 300));
  }, []);

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
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  // Right-click "Create NPC here" on a Location card. Prompts for a name,
  // POSTs a new character wired as a located_at child of the parent. The
  // canvas folder system auto-nests the result, so River Styx / Undead Army
  // / any flat Location promotes to a folder the moment the first child lands.
  const handleCreateChildCharacterAtLocation = useCallback(async (parentLocationId: string) => {
    const name = typeof window !== 'undefined' ? window.prompt('Name the NPC:') : null;
    if (!name || !name.trim()) return;
    try {
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), campaignId: campaign.id, parentLocationId }),
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

  const handleCreateLocation = useCallback(async (name: string, type: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create location');
        return;
      }
      router.refresh();
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
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  const handleDeleteLocation = useCallback(async (nodeId: string) => {
    if (!confirm('Delete this location?')) return;
    try {
      await fetch(`/api/campaigns/${campaign.id}/locations/${nodeId}`, { method: 'DELETE' });
      router.refresh();
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  const handleDeleteItem = useCallback(async (nodeId: string) => {
    if (!confirm('Delete this item?')) return;
    try {
      await fetch(`/api/campaigns/${campaign.id}/items/${nodeId}`, { method: 'DELETE' });
      router.refresh();
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

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

  const handleDeleteCharacter = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/characters/${deleteTarget}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to delete character');
        return;
      }
      router.refresh();
    } catch {
      alert('Connection failed');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, router]);

  // ── Resize handler ──────────────────────────────────────────────────────

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;

    const startY = e.clientY;
    const startHeight = terminalHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const dy = startY - moveEvent.clientY;
      const mainEl = mainRef.current;
      const maxHeight = mainEl ? mainEl.clientHeight * MAX_TERMINAL_FRACTION : 600;
      const newHeight = Math.max(MIN_TERMINAL_HEIGHT, Math.min(maxHeight, startHeight + dy));
      setTerminalHeight(newHeight);
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
  }, [terminalHeight]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'forge', label: 'Forge' },
    { key: 'canvas', label: 'Canvas' },
    { key: 'tapestry', label: 'Tapestry' },
    ...(!isGM ? [{ key: 'character' as Tab, label: 'Character' }] : []),
  ];

  return (
    <div className="h-screen bg-[var(--surface-dark)] flex flex-col overflow-hidden">
      {/* Compact header bar */}
      <header className="bg-[var(--surface-dark)] border-b border-[var(--accent-teal)]/30 flex-shrink-0 relative z-[60]">
        {/* Micro bar — window controls */}
        <div className="flex items-center justify-between px-3 py-0.5 bg-black/20 border-b border-[var(--accent-teal)]/20">
          <div className="flex items-center gap-1.5">
            <div className="w-[6px] h-[6px] bg-[var(--pillar-body)]" />
            <div className="w-[6px] h-[6px] bg-[var(--pillar-soul)]" />
            <div className="w-[6px] h-[6px] bg-[#002F6C]" />
          </div>
          <span className="text-[var(--accent-teal)]/40 text-[8px] tracking-[0.3em] font-[family-name:var(--font-terminal)]">
            CANVAS://session.layer.0
          </span>
          <span className="text-[var(--accent-teal)]/30 text-[8px]">&#x2298; &#x2295;</span>
        </div>

        {/* Main header content */}
        <div className="px-4 py-2 flex items-center justify-between">
          {/* Left: back + campaign name */}
          <div className="flex items-center gap-4">
            <Link
              href="/terminal"
              className="text-[var(--accent-teal)]/50 hover:text-[var(--accent-teal)] text-sm font-[family-name:var(--font-terminal)] transition-colors"
            >
              &larr;
            </Link>
            <div>
              <h1 className="text-white text-sm font-[family-name:var(--font-header)] uppercase tracking-[0.15em]">
                {campaign.name}
              </h1>
              {campaign.genre && (
                <span className="text-white/30 text-[9px] font-[family-name:var(--font-terminal)]">
                  {campaign.genre}
                </span>
              )}
              {campaign.inviteCode && (
                <div className="text-[9px] text-white/30 font-[family-name:var(--font-terminal)]">
                  Invite: <span className="text-[var(--accent-gold)]/60">{campaign.inviteCode}</span>
                </div>
              )}
            </div>
          </div>

          {/* Center: tab navigation */}
          <div className="flex">
            {tabs.map((tab, i) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`py-1.5 px-4 text-xs uppercase tracking-[0.2em] font-[family-name:var(--font-terminal)] border border-[var(--accent-teal)]/40 transition-colors ${
                  i > 0 ? 'border-l-0' : ''
                } ${
                  activeTab === tab.key
                    ? 'bg-[var(--accent-teal)] text-black'
                    : 'bg-transparent text-[var(--accent-teal)]/50 hover:text-[var(--accent-teal)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right: KRMA readout + invite code */}
          <div className="text-right flex items-center gap-4">
            {isGM && economy && (
              <div className="flex items-center gap-0">
                {/* Gold KRMA bar — purple text */}
                <div
                  className="px-5 py-2 flex items-center gap-3"
                  style={{ background: 'linear-gradient(90deg, #D4A830, #E8C848, #D4A830)' }}
                >
                  <span
                    className="uppercase leading-none"
                    style={{ fontFamily: '"Bebas Neue", Impact, sans-serif', fontSize: '32px', color: '#8e7cc3', fontWeight: 'bold', letterSpacing: '-0.01em' }}
                  >
                    {formatKrma(economy.total)}
                  </span>
                  <span className="leading-none" style={{ fontSize: '28px', color: '#8e7cc3', fontWeight: 'bold', letterSpacing: '0.02em' }}>
                    <span style={{ fontFamily: 'var(--font-inknut-antiqua), "Inknut Antiqua", serif', fontSize: '22px', fontWeight: 900 }}>Ҝ</span>
                    <span style={{ fontFamily: '"Bebas Neue", Impact, sans-serif' }}>RMA</span>
                  </span>
                </div>
                {/* Purple box — fluid */}
                <div
                  className="h-16 min-w-16 px-3 flex flex-col items-center justify-center"
                  style={{ background: '#582a72' }}
                >
                  <span className="text-white text-[18px] font-bold font-[family-name:var(--font-terminal)] leading-none whitespace-nowrap">{formatKrma(economy.fluid)}</span>
                  <span className="text-white/50 text-[10px] tracking-[0.1em] font-[family-name:var(--font-terminal)] leading-none mt-1">FLD</span>
                </div>
                {/* Red box with ] */}
                <div
                  className="h-16 flex items-center"
                  style={{ background: '#E8585A' }}
                >
                  <div className="flex flex-col items-center justify-center px-3">
                    <span className="text-white text-[18px] font-bold font-[family-name:var(--font-terminal)] leading-none whitespace-nowrap">{formatKrma(economy.crystallized)}</span>
                    <span className="text-white/50 text-[10px] tracking-[0.1em] font-[family-name:var(--font-terminal)] leading-none mt-1">CRY</span>
                  </div>
                  <span className="text-white font-bold font-[family-name:var(--font-terminal)] text-[32px] leading-none pr-1.5">]</span>
                </div>
              </div>
            )}
            {isGM && (
              <Link
                href={`/watcher/campaign/${campaign.id}/settings`}
                className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--accent-teal)]/30 text-[var(--accent-teal)]/50 hover:text-[var(--accent-teal)] hover:border-[var(--accent-teal)]/60 transition-colors"
                title="Campaign Settings"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </header>

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
                    color: '#ffcc78',
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
                        color: i === breadcrumb.length - 1 ? '#fff' : '#ffcc78',
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
                  border: '2px solid #ffcc78',
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
                    color: '#ffcc78',
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
                      <span><span style={{ color: '#22ab94' }}>⌂</span> {pendingLocationCommit.contentCounts.locations} sub-locations</span>
                    )}
                    {(pendingLocationCommit.contentCounts.characters ?? 0) > 0 && (
                      <span><span style={{ color: '#f7525f' }}>✴</span> {pendingLocationCommit.contentCounts.characters} characters</span>
                    )}
                    {(pendingLocationCommit.contentCounts.npcs ?? 0) > 0 && (
                      <span><span style={{ color: '#ffcc78' }}>✴</span> {pendingLocationCommit.contentCounts.npcs} NPCs</span>
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
                    <div style={{ fontSize: 10, color: '#ffcc78', letterSpacing: '0.15em', marginBottom: 4 }}>
                      KRMA TO DEBIT
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                        fontSize: 28,
                        color: '#ffcc78',
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
                      background: 'linear-gradient(135deg, #ffcc78, #d09f55)',
                      border: '1px solid #ffcc78',
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
            onDeleteCharacter={(nodeId) => setDeleteTarget(nodeId)}
            onCharacterUpdate={handleCharacterUpdate}
            onCreateLocation={handleCreateLocation}
            onDeleteLocation={handleDeleteLocation}
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
          />
        )}

        {/* Campaign Terminal — resizable bottom overlay */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: showTerminal ? `${terminalHeight}px` : '0',
            zIndex: 50,
            pointerEvents: showTerminal ? 'auto' : 'none',
            transition: showTerminal ? 'none' : 'height 0.3s ease-in-out',
          }}
        >
          {/* Toggle tab */}
          <button
            onClick={() => setShowTerminal(prev => !prev)}
            className="absolute -top-6 left-1/2 -translate-x-1/2 px-4 py-1 text-[9px] uppercase tracking-[0.2em] transition-colors"
            style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: showTerminal ? '#0a0a1a' : '#22ab94',
              backgroundColor: showTerminal ? '#22ab94' : 'rgba(10, 10, 26, 0.9)',
              border: '1px solid rgba(34, 171, 148, 0.4)',
              borderBottom: showTerminal ? 'none' : undefined,
              borderRadius: '3px 3px 0 0',
              pointerEvents: 'auto',
              zIndex: 51,
            }}
          >
            {showTerminal ? '\u25BC TERMINAL' : '\u25B2 TERMINAL'}
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
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-[3px] rounded-full" style={{
                backgroundColor: 'rgba(34, 171, 148, 0.4)',
                marginTop: '1px',
              }} />
            </div>
          )}

          {/* Panel content — always mounted so event listeners stay active */}
          <div className="h-full border-t" style={{
            borderColor: 'rgba(34, 171, 148, 0.4)',
            backgroundColor: 'rgba(10, 10, 26, 0.95)',
            backdropFilter: 'blur(8px)',
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
            />
          </div>
        </div>
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

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteCharacter}
        title="Delete Character"
        message="Are you sure you want to delete this character? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={isDeleting}
        variant="danger"
      />

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
    </div>
  );
}
