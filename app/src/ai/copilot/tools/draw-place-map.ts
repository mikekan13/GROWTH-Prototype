/**
 * draw_place_map — JEWL draws a home TO SCALE on the map from what is written
 * about it, and stands everything where it belongs (Mike 2026-10-17: "have
 * Jewl draw the apartment and put everything where it should be — we are
 * assuming normal 5 foot space rules for a token like in typical trpgs";
 * "JEWL should be able to draw them for now using the descriptions").
 * One call: the home outline, every room's outline, every token's spot — all
 * in FEET in the home's own frame. Code converts and writes (services/place-map).
 */
import 'server-only';
import { isWatcherOrAbove } from '@/lib/permissions';
import { drawPlaceMap, placeMapSchema } from '@/services/place-map';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

export const drawPlaceMapTool: JewlTool = {
  name: 'draw_place_map',
  description:
    'Draw a home TO SCALE on the map in ONE call, in FEET, all in the home\'s own frame (origin = its top-left, x right, ' +
    'y down): the home outline, each room\'s outline inside it (rooms must already exist — organize_place first), and ' +
    'where every floor thing and every person stands. 5-ft squares: a person fills one square (centre them in it); a ' +
    'thing takes the floor space it really covers — give its CENTRE and its sizeFt (w×d, a couch 7×3, a bed 5×6.5) or ' +
    'outlineFt, plus rotation; under 5 ft on both sides it shows as a pin. Things inside containers are not drawn. ' +
    'OPENINGS: every door (with its state: open/closed/locked), window and archway, as a segment ON a wall line ' +
    '(fromFt→toFt, a door ~3 ft) and what it joins (rooms, or "outside"/"stairwell"/"fire escape"). Already drawn? ' +
    'omit outlineFt/rooms and send only what changes. ' +
    'Use the sizes the description gives (sq ft, dimensions); never contradict them.',
  inputSchema: placeMapSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    if (!isWatcherOrAbove(ctx.actorRole)) return { output: { ok: false, reason: 'Not authorized to draw this place.' } };
    const report = await drawPlaceMap(ctx.campaignId, { userId: ctx.actorId, role: ctx.actorRole }, input);
    return {
      output: { ok: report.errors.length === 0, ...report },
      affected: { locations: [{ id: report.homeId }] },
    };
  },
};

registerJewlTool(drawPlaceMapTool);
