import { join } from 'path';
import { safeAppend } from 'growth-shared';

export interface EventRecord {
  ts?: string;
  type: 'scene' | 'roll' | 'ruling' | 'lore' | 'npc' | 'item' | 'system' | 'meta';
  actors: string[];
  summary: string;
  source: 'companion' | 'oracle' | 'player' | 'system';
  data: {
    raw: string;
    refs: string[];
  };
  __path?: string;
}

export interface EventsAppendOutput {
  ok: boolean;
  path: string;
  line: number;
  error?: string;
}

export async function eventsAppend(record: EventRecord, campaignRepo: string): Promise<EventsAppendOutput> {
  try {
    const eventsFile = record.__path || 'events.jsonl';
    const fullPath = join(campaignRepo, eventsFile);
    
    const eventRecord = {
      ...record,
      ts: record.ts || new Date().toISOString()
    };
    delete eventRecord.__path;
    
    const jsonLine = JSON.stringify(eventRecord);
    const lineNumber = await safeAppend(fullPath, jsonLine);
    
    return {
      ok: true,
      path: eventsFile,
      line: lineNumber
    };
  } catch (error) {
    return {
      ok: false,
      path: '',
      line: 0,
      error: String(error)
    };
  }
}