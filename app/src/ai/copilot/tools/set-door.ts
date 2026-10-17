/**
 * set_door — open, close or lock a door on a home's map (Mike 2026-10-17:
 * "we need doors at least for now (ha violet has a door theme)"). The door
 * is an opening on the home's walls (draw_place_map); its state is a fact of
 * the world everyone at the table shares.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { parseOpenings } from '@/lib/canvas-geometry';
import { setDoorState } from '@/services/place-map';
import { registerJewlTool } from './registry';
import { resolveLocationRef } from './create-location';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  home: z.string().min(1).describe('The home whose map holds the door (name or id).'),
  door: z.string().min(1).describe('The door: its id (op-N), its name, or what it joins ("Main Room / outside").'),
  state: z.enum(['open', 'closed', 'locked']),
});

export const setDoorTool: JewlTool = {
  name: 'set_door',
  description: 'Open, close or lock a door on a home\'s map — when the fiction says so ("she locks the door behind her").',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const p = inputSchema.parse(input);
    const home = await resolveLocationRef(ctx.campaignId, p.home);
    if (!home) return { output: { ok: false, reason: `No Location "${p.home}".` } };
    const row = await prisma.location.findUnique({ where: { id: home.id }, select: { data: true } });
    let doors: ReturnType<typeof parseOpenings> = [];
    try { doors = parseOpenings((JSON.parse(row?.data ?? '{}') as { openings?: unknown }).openings).filter(o => o.kind === 'door'); } catch { doors = []; }
    const q = p.door.trim().toLowerCase();
    const door = doors.find(d => d.id === p.door) ?? doors.find(d => d.name?.toLowerCase() === q)
      ?? doors.find(d => d.between.join(' / ').toLowerCase().includes(q) || q.includes(d.between.join(' / ').toLowerCase()));
    if (!door) return { output: { ok: false, reason: `No door "${p.door}" on ${home.name}. Doors: ${doors.map(d => `${d.id} (${d.between.join(' / ')})`).join(', ') || 'none'}` } };
    const o = await setDoorState(ctx.campaignId, { userId: ctx.actorId, role: ctx.actorRole }, home.id, door.id, p.state);
    return { output: { ok: true, door: o.id, between: o.between, state: o.state }, affected: { locations: [{ id: home.id }] } };
  },
};

registerJewlTool(setDoorTool);
