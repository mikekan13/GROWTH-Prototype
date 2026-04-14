import 'server-only';
import crypto from 'crypto';
import type { CopilotAction } from './types';

// Parse structured action blocks from the AI's response
// Format: ```action\n{JSON}\n```
export function parseActions(response: string): { message: string; actions: CopilotAction[] } {
  const actions: CopilotAction[] = [];
  let message = response;

  // Match ```action ... ``` blocks
  const actionPattern = /```action\s*\n([\s\S]*?)```/g;
  let match;

  while ((match = actionPattern.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.type && parsed.description) {
        actions.push({
          id: crypto.randomUUID().slice(0, 8),
          type: parsed.type,
          description: parsed.description,
          params: parsed.params || {},
          status: 'pending',
        });
      }
    } catch { /* skip malformed action blocks */ }

    // Remove action block from visible message
    message = message.replace(match[0], '').trim();
  }

  // Also try [ACTION] block format as fallback
  const altPattern = /\[ACTION:\s*(\w+)\]\s*\n([\s\S]*?)\[\/ACTION\]/g;
  while ((match = altPattern.exec(response)) !== null) {
    try {
      const type = match[1] as CopilotAction['type'];
      const body = match[2].trim();

      // Parse key: value pairs
      const params: Record<string, unknown> = {};
      let description = '';
      for (const line of body.split('\n')) {
        const [key, ...rest] = line.split(':');
        if (key && rest.length) {
          const val = rest.join(':').trim();
          if (key.trim().toLowerCase() === 'description') {
            description = val;
          } else {
            try {
              params[key.trim()] = JSON.parse(val);
            } catch {
              params[key.trim()] = val;
            }
          }
        }
      }

      if (description) {
        actions.push({
          id: crypto.randomUUID().slice(0, 8),
          type,
          description,
          params,
          status: 'pending',
        });
      }
    } catch { /* skip */ }

    message = message.replace(match[0], '').trim();
  }

  return { message, actions };
}
