import { join } from 'path';
import { safeAppend } from 'growth-shared';

export interface OpenIssueInput {
  title: string;
  location: string;
  observed: string;
  expected: string;
  severity: 'note' | 'low' | 'med' | 'high' | 'blocking';
  tags: string[];
  source: 'voice' | 'hotkey' | 'oracle' | 'manual';
  __path?: string;
}

export interface OpenIssueOutput {
  ok: boolean;
  path: string;
  line: number;
  error?: string;
}

export async function rulesOpenIssue(input: OpenIssueInput, growthRepo: string): Promise<OpenIssueOutput> {
  try {
    const issuesFile = input.__path || 'corrections/issues.jsonl';
    const fullPath = join(growthRepo, issuesFile);
    
    const record = {
      ...input,
      ts: new Date().toISOString()
    };
    delete record.__path;
    
    const jsonLine = JSON.stringify(record);
    const lineNumber = await safeAppend(fullPath, jsonLine);
    
    return {
      ok: true,
      path: issuesFile,
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