import path from "path";

export const DECISION_SCOPES = {
  GLOBAL: 'GLOBAL' as const,
  CAMPAIGN: (id: string) => `CAMPAIGN:${id}` as const,
} as const;

export const PATHS = {
  BACKLOG_DIR: path.join(process.cwd(), "apps", "GROWTH_Vault", ".growth"),
  DOCS_DIR: path.join(process.cwd(), "apps", "GROWTH_Vault", "docs"),
  get BACKLOG_JSONL() { return path.join(this.BACKLOG_DIR, "backlog.jsonl"); },
  get BACKLOG_MD() { return path.join(this.BACKLOG_DIR, "backlog.md"); },
  get CLARIFICATIONS_MD() { return path.join(this.DOCS_DIR, "clarifications.md"); },
} as const;

export const CLEANUP_RETENTION_DAYS = 7;

export const ISSUE_QUERIES = {
  DECISION_NEEDED: {
    status: "open",
    severity: "info",
    source: { path: "$.type", equals: "decision_needed" },
  },
  RESOLVED_OLD: {
    status: "resolved",
    createdAt: {
      lt: new Date(Date.now() - CLEANUP_RETENTION_DAYS * 24 * 60 * 60 * 1000),
    },
  },
} as const;

export function createDecisionKey(spreadsheetId: string, key: string): string {
  return `decision-${spreadsheetId}-${key}`;
}

export function formatDecisionLogEntry(entry: Record<string, unknown>): string {
  const timestamp = new Date(entry.timestamp as string | number | Date).toLocaleString();
  
  switch (entry.type) {
    case "decision":
      return `\n### ${timestamp} - Decision: ${entry.key}\n\n` +
        `**Scope:** ${entry.scope}\n` +
        `**Mapping:** ${(entry.value as { path?: unknown; type?: unknown })?.path} (${(entry.value as { path?: unknown; type?: unknown })?.type})\n` +
        (entry.reasoning ? `**Reasoning:** ${entry.reasoning}\n` : "") +
        `**Source:** ${JSON.stringify(entry.source)}\n`;
    
    case "issue":
      return `\n### ${timestamp} - Issue: ${entry.severity}\n\n` +
        `**Message:** ${entry.message}\n` +
        `**Source:** ${JSON.stringify(entry.source)}\n`;
    
    case "clarification":
      return `\n### ${timestamp} - Clarification\n\n` +
        `**Key:** ${entry.key}\n` +
        `**Description:** ${entry.description}\n` +
        `**Resolution:** ${entry.resolution}\n`;
    
    default:
      return `\n### ${timestamp} - ${entry.type}\n\n${JSON.stringify(entry, null, 2)}\n`;
  }
}