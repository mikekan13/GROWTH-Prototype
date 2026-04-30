/**
 * query_relationships — Traverse the EntityRelationship graph outward
 * from a starting node, up to `depth` hops.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const inputSchema = z.object({
  entityId: z.string().describe('The node to start traversal from'),
  depth: z.number().describe('Hops to traverse outward (1-3, default 1)').optional(),
  relationshipTypes: z.array(z.string()).describe('Filter to specific relationship types (e.g. ["custodian","resisted_by"]). Omit for all.').optional(),
});

interface GraphNode {
  id: string;
  type: string;
}

interface GraphEdge {
  id: string;
  sourceId: string;
  sourceType: string;
  targetId: string;
  targetType: string;
  relationshipType: string;
  strength: number;
  bidirectional: boolean;
  hop: number;
}

registerTool({
  name: 'query_relationships',
  description: 'Walk the entity-relationship graph starting at a node. Returns all edges within N hops plus the set of discovered nodes. Use this to map who is connected to whom.',
  inputSchema,
  handler: async (input) => {
    const { entityId, depth, relationshipTypes } = input as z.infer<typeof inputSchema>;
    const maxDepth = Math.min(Math.max(depth ?? 1, 1), 3);

    const visited = new Set<string>([entityId]);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    let frontier = new Set<string>([entityId]);

    for (let hop = 1; hop <= maxDepth; hop++) {
      if (frontier.size === 0) break;

      const rows = await prisma.entityRelationship.findMany({
        where: {
          OR: [
            { sourceId: { in: Array.from(frontier) } },
            { targetId: { in: Array.from(frontier) } },
          ],
          ...(relationshipTypes && relationshipTypes.length > 0
            ? { relationshipType: { in: relationshipTypes } }
            : {}),
        },
      });

      const nextFrontier = new Set<string>();
      for (const r of rows) {
        const key = r.id;
        if (edges.find(e => e.id === key)) continue;
        edges.push({
          id: r.id,
          sourceId: r.sourceId,
          sourceType: r.sourceType,
          targetId: r.targetId,
          targetType: r.targetType,
          relationshipType: r.relationshipType,
          strength: r.strength,
          bidirectional: r.bidirectional,
          hop,
        });
        for (const [id, type] of [[r.sourceId, r.sourceType], [r.targetId, r.targetType]] as const) {
          if (!nodes.find(n => n.id === id)) nodes.push({ id, type });
          if (!visited.has(id)) {
            visited.add(id);
            nextFrontier.add(id);
          }
        }
      }

      frontier = nextFrontier;
    }

    return { rootId: entityId, maxDepth, nodes, edges };
  },
});
