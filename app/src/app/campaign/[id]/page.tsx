import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import CampaignCanvas from '@/components/CampaignCanvas';
import { recomputeAugments } from '@/lib/character-actions';

export default async function CampaignCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/');

  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      characters: {
        select: {
          id: true,
          name: true,
          status: true,
          data: true,
          portrait: true,
          userId: true,
          godHead: { select: { aiActionMode: true } },
        },
      },
      // status: ACTIVE | PLANNING | HIDDEN | DESTROYED. Planning entities
      // render below the crystallization line per the world-design pillar.
      members: { include: { user: { select: { id: true, username: true } } } },
      locations: {
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          data: true,
        },
      },
      campaignItems: {
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          data: true,
          holderId: true,
          locationId: true,
        },
      },
    },
  });

  if (!campaign) redirect('/terminal');

  // Allow access if user is admin, GM, or a campaign member
  const isAdmin = session.user.role === 'GODHEAD' || session.user.role === 'ADMIN';
  const isGM = campaign.gmUserId === session.user.id;
  const isMember = campaign.members.some(m => m.userId === session.user.id && !['INTERESTED', 'REJECTED'].includes(m.status));

  if (!isAdmin && !isGM && !isMember) redirect('/terminal');

  // Trailblazer roster for the canvas card's controller dropdown. Filter out
  // people who haven't joined yet (INTERESTED/REJECTED). The GM is offered
  // separately in the dropdown, so exclude them here.
  const trailblazers = campaign.members
    .filter(m => !['INTERESTED', 'REJECTED'].includes(m.status) && m.userId !== campaign.gmUserId)
    .map(m => ({ userId: m.user.id, username: m.user.username }));

  // Build name lookups for item holder/location references
  const charNameMap = new Map(campaign.characters.map(c => [c.id, c.name]));
  const locNameMap = new Map(campaign.locations.map(l => [l.id, l.name]));

  // A character belongs on the canvas when either:
  //  (a) status is APPROVED or ACTIVE — these auto-place into the world on lock-in,
  //  (b) the GM has explicitly placed it via the Tools→Character picker (canvasX/Y set).
  // DRAFT/SUBMITTED-without-position stay in the Tapestry tab (entities API) until placed.
  // EXCEPT: a `hiddenFromCanvas: true` flag on the character's data overrides
  // both — that's how the GM hides a card without changing status. Cleared
  // by setCanvasPosition (placing brings it back).
  const canvasCharacters = campaign.characters.filter(c => {
    let parsed: { canvasX?: unknown; canvasY?: unknown; hiddenFromCanvas?: unknown } | null = null;
    try { parsed = JSON.parse(c.data); } catch { /* ignore */ }
    if (parsed?.hiddenFromCanvas === true) return false;
    if (c.status === 'APPROVED' || c.status === 'ACTIVE') return true;
    return typeof parsed?.canvasX === 'number' && typeof parsed?.canvasY === 'number';
  });

  // Transform characters to CanvasNode format with full data
  const characterNodes = canvasCharacters.map((char, index) => {
    let charData: (Record<string, unknown> & { canvasX?: number; canvasY?: number }) | null = null;
    try {
      const parsed = JSON.parse(char.data);
      // Recompute augments from equipped items + traits on load
      const { character: augmented } = recomputeAugments(parsed);
      charData = augmented as unknown as Record<string, unknown> & { canvasX?: number; canvasY?: number };
    } catch { /* use null */ }

    // Prefer GM-placed canvas position; fall back to a deterministic auto-layout.
    const storedX = typeof charData?.canvasX === 'number' ? charData.canvasX : undefined;
    const storedY = typeof charData?.canvasY === 'number' ? charData.canvasY : undefined;

    return {
      id: char.id,
      type: 'character' as const,
      name: char.name,
      x: storedX ?? (200 + index * 300),
      y: storedY ?? (-200 - index * 80),
      status: char.status,
      portrait: char.portrait,
      characterData: charData,
      hasAIPersona: char.godHead !== null,
      aiActionMode: char.godHead?.aiActionMode ?? false,
      controllerUserId: char.userId,
    };
  });

  // Transform locations to CanvasNode format
  const locationNodes = campaign.locations.map((loc, index) => {
    let locData = null;
    try {
      locData = JSON.parse(loc.data);
    } catch { /* use null */ }

    // Planning locations sit below the crystallization line (y > 0),
    // active ones float above (y < 0). The user can drag them anywhere
    // but the default placement signals their layer. GM-stamped canvas
    // coords (canvasX/canvasY on the data JSON) win over the default.
    const planningDefault = loc.status === 'PLANNING';
    const fallbackY = planningDefault ? 400 + index * 120 : -300 - index * 80;
    const fallbackX = -400 + index * 350;
    const rawX = (locData as { canvasX?: unknown } | null)?.canvasX;
    const rawY = (locData as { canvasY?: unknown } | null)?.canvasY;
    const storedX = typeof rawX === 'number' ? rawX : undefined;
    const storedY = typeof rawY === 'number' ? rawY : undefined;
    return {
      id: loc.id,
      type: 'location' as const,
      name: loc.name,
      x: storedX ?? fallbackX,
      y: storedY ?? fallbackY,
      status: loc.status,
      locationType: loc.type,
      locationData: locData,
    };
  });

  // Transform items to CanvasNode format
  const itemNodes = campaign.campaignItems.map((item, index) => {
    let itemData = null;
    try {
      itemData = JSON.parse(item.data);
    } catch { /* use null */ }

    const storedX = typeof itemData?.x === 'number' ? itemData.x : null;
    const storedY = typeof itemData?.y === 'number' ? itemData.y : null;

    return {
      id: item.id,
      type: 'item' as const,
      name: item.name,
      x: storedX ?? 600 + index * 280,
      y: storedY ?? 300 + index * 80,
      status: item.status,
      itemType: item.type,
      itemData: itemData,
      holderId: item.holderId || null,
      holderName: item.holderId ? charNameMap.get(item.holderId) : undefined,
      locationName: item.locationId ? locNameMap.get(item.locationId) : undefined,
    };
  });

  const allNodes = [...characterNodes, ...locationNodes, ...itemNodes];

  // Build canvas connections from EntityRelationship rows. Only include edges
  // where both endpoints are renderable nodes on the canvas. owns = gold
  // dashed tether from owner to possession; located_at = subtle purple tether
  // from child to parent.
  const nodeIdSet = new Set(allNodes.map(n => n.id));
  const relationshipRows = await prisma.entityRelationship.findMany({
    where: {
      campaignId: campaign.id,
      relationshipType: { in: ['owns', 'located_at'] },
    },
    orderBy: { createdAt: 'asc' }, // matches the possessions panel ordering
    select: { sourceId: true, targetId: true, relationshipType: true, strength: true },
  });
  // Owns connections survive even when the target became an auto-folder
  // (parent Location removed from the canvas as a standalone node). The
  // client connection renderer looks up the matching folder by id when
  // the target isn't a node. Located-at edges still require both endpoints
  // on-canvas since they're parent ↔ child relations of visible nodes.
  // Build the set of parent IDs that became folders (filteredParentIds)
  // up here so the connection filter can keep "owns → folder" edges.
  // Note: filteredParentIds is computed below in autoFolders. We compute
  // here to use it both for filtering and folder-attachment.
  const parentIdSet = new Set<string>();
  for (const r of relationshipRows) {
    if (r.relationshipType === 'located_at' && nodeIdSet.has(r.sourceId)) {
      parentIdSet.add(r.targetId);
    }
  }
  const connections = relationshipRows
    .filter(r => {
      if (!nodeIdSet.has(r.sourceId)) return false;
      if (nodeIdSet.has(r.targetId)) return true;
      // Allow owns edges where the target is a parent-Location-turned-folder.
      return r.relationshipType === 'owns' && parentIdSet.has(r.targetId);
    })
    .map(r => ({
      from: r.sourceId,
      to: r.targetId,
      type: r.relationshipType as 'owns' | 'located_at',
      strength: r.strength,
    }));

  // Auto-folders from located_at edges. For each parent that has children
  // on the canvas, generate a CanvasFolder containing the children — same
  // primitive as the party folder, just constructed from the relationship
  // graph instead of user-authored. User-stored overrides (same id) win
  // client-side so customizations persist.
  const childrenByParent = new Map<string, string[]>();
  for (const r of relationshipRows) {
    if (r.relationshipType !== 'located_at') continue;
    if (!nodeIdSet.has(r.sourceId) || !nodeIdSet.has(r.targetId)) continue;
    const arr = childrenByParent.get(r.targetId) ?? [];
    arr.push(r.sourceId);
    childrenByParent.set(r.targetId, arr);
  }
  const nodeNameById = new Map(allNodes.map(n => [n.id, n.name]));
  // Every Location is a folder per the world-recursive design — even when
  // empty. Build the lookup over ALL Locations, not just ones with children.
  // The filter below strips ALL Locations from rendered nodes (they ARE
  // folders, no separate LocationCard).
  const parentLocationsById = new Map(
    campaign.locations
      .map(l => {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(l.data) as Record<string, unknown>; } catch { /* ignore */ }
        return [l.id, { name: l.name, type: l.type, status: l.status, data: parsed }] as const;
      })
  );
  // Build a type lookup so we can count children by type without re-querying.
  const nodeTypeById = new Map<string, 'character' | 'location' | 'item'>();
  for (const n of allNodes) nodeTypeById.set(n.id, n.type as 'character' | 'location' | 'item');
  // For NPCs vs characters: NPCs are characters with entityType=NPC.
  const npcIds = new Set(campaign.characters.filter(c => {
    try { return (JSON.parse(c.data) as Record<string, unknown>).entityType === 'NPC'; } catch { return false; }
  }).map(c => c.id));

  // Build one folder per Location — even those with no children. Empty
  // folders still render with their header (name, KRMA, portrait, child
  // counts at 0). New Locations land as empty folders, not as cards.
  const autoFolders = campaign.locations.map(l => {
    const parentId = l.id;
    const nodeIdsForParent = childrenByParent.get(parentId) ?? [];
    const loc = parentLocationsById.get(parentId);
    // Aggregate child counts by type
    const counts = { locations: 0, characters: 0, npcs: 0, items: 0 };
    for (const childId of nodeIdsForParent) {
      const t = nodeTypeById.get(childId);
      if (t === 'location') counts.locations += 1;
      else if (t === 'character') {
        if (npcIds.has(childId)) counts.npcs += 1;
        else counts.characters += 1;
      } else if (t === 'item') counts.items += 1;
    }
    // Folder anchors at the Location's stored canvas position (so empty
    // folders land where the GM clicked instead of at the origin).
    const locX = typeof loc?.data?.canvasX === 'number' ? loc.data.canvasX as number : undefined;
    const locY = typeof loc?.data?.canvasY === 'number' ? loc.data.canvasY as number : undefined;
    return {
      id: `auto-${parentId}`,
      name: nodeNameById.get(parentId) ?? loc?.name ?? 'Container',
      type: 'group' as const,
      nodeIds: nodeIdsForParent,
      posX: locX,
      posY: locY,
      locationInfo: loc
        ? {
            locationId: parentId,
            locationType: loc.type,
            krmaReserve: typeof loc.data.krmaReserve === 'number' ? loc.data.krmaReserve : undefined,
            description: typeof loc.data.description === 'string' ? loc.data.description : undefined,
            imageUrl: typeof loc.data.imageUrl === 'string' ? loc.data.imageUrl : undefined,
            contentCounts: counts,
            status: typeof loc.status === 'string' ? loc.status : undefined,
            environment: typeof loc.data.environment === 'string' ? loc.data.environment : undefined,
            population: typeof loc.data.population === 'string' ? loc.data.population : undefined,
            dangerLevel: typeof loc.data.dangerLevel === 'number' ? loc.data.dangerLevel : undefined,
            controlledBy: typeof loc.data.controlledBy === 'string' ? loc.data.controlledBy : undefined,
            notes: typeof loc.data.notes === 'string' ? loc.data.notes : undefined,
            tags: Array.isArray(loc.data.tags) ? (loc.data.tags as unknown[]).filter((t): t is string => typeof t === 'string') : undefined,
            timescaleId: typeof loc.data.timescaleId === 'string' ? loc.data.timescaleId : undefined,
          }
        : undefined,
    };
  });
  const filteredParentIds = new Set(autoFolders.map(f => f.locationInfo?.locationId).filter((id): id is string => !!id));

  // Strip parent Locations from the rendered canvas nodes — they ARE their
  // folders now, no separate Location card on top of the folder header.
  const nodes = allNodes.filter(n => !(n.type === 'location' && filteredParentIds.has(n.id)));

  const campaignData = {
    id: campaign.id,
    name: campaign.name,
    inviteCode: campaign.inviteCode,
    genre: campaign.genre,
  };

  // Find the current user's character for terminal auto-detection
  const myChar = campaign.characters.find(c => c.userId === session.user.id);
  const userCharacterInfo = myChar ? {
    id: myChar.id,
    name: myChar.name,
    data: myChar.data,
  } : null;

  return (
    <CampaignCanvas
      campaign={campaignData}
      nodes={nodes}
      connections={connections}
      autoFolders={autoFolders}
      locatedAtEdges={relationshipRows
        .filter(r => r.relationshipType === 'located_at')
        .map(r => ({ child: r.sourceId, parent: r.targetId }))}
      entityNames={Object.fromEntries(
        [...allNodes.map(n => [n.id, n.name] as const),
         ...campaign.locations.filter(l => filteredParentIds.has(l.id)).map(l => [l.id, l.name] as const),
        ]
      )}
      userId={session.user.id}
      username={session.user.username}
      userRole={session.user.role}
      userCharacter={userCharacterInfo}
      trailblazers={trailblazers}
    />
  );
}
