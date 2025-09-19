import { prisma } from "@/lib/prisma";
import { createId } from "@paralleldrive/cuid2";
import fs from "fs/promises";
import path from "path";
import type { Prisma } from "@prisma/client";
import {
  DECISION_SCOPES,
} from "@/lib/decisionHelpers";

export interface DecisionRequest {
  key: string;
  scope: "GLOBAL" | `CAMPAIGN:${string}`;
  description: string;
  sample: Prisma.JsonValue;
  proposedPath: string;
  proposedType: string;
  spreadsheetId?: string;
  sheetTitle?: string;
  a1Range?: string;
  namedRange?: string;
}

export interface DecisionResponse {
  approved: boolean;
  finalPath?: string;
  finalType?: string;
  reasoning?: string;
}

export async function getDecision(key: string, scope: string): Promise<Prisma.JsonValue | null> {
  // Check campaign-specific first, then global
  const scopes = scope.startsWith("CAMPAIGN:") ? [scope, DECISION_SCOPES.GLOBAL] : [DECISION_SCOPES.GLOBAL];
  
  const decision = await prisma.decision.findFirst({
    where: {
      key,
      scope: { in: scopes },
    },
    orderBy: [
      { scope: "desc" }, // Campaign-specific first
      { createdAt: "desc" },
    ],
  });

  return decision?.value || null;
}

export async function createDecision(
  key: string,
  scope: string,
  value: Prisma.JsonValue,
  campaignId?: string
): Promise<void> {
  await prisma.decision.create({
    data: {
      key,
      scope,
      value: JSON.parse(JSON.stringify(value)),
      campaignId: scope.startsWith("CAMPAIGN:") ? campaignId : null,
    },
  });
}

export async function listPendingDecisions(): Promise<Array<{
  id: string;
  key: string;
  description: string;
  sample: Prisma.JsonValue;
  proposed: Prisma.JsonValue;
  source: Prisma.JsonValue;
  createdAt: Date;
}>> {
  // Get issues that represent decision requests
  const issues = await prisma.issue.findMany({
    where: {
      status: "open",
      severity: "info",
      source: { path: "$.type", equals: "decision_needed" },
    },
    orderBy: { createdAt: "asc" },
  });

  return issues.map(issue => {
    const sample = issue.sample as Record<string, unknown>;
    return {
      id: issue.id,
      key: (sample?.key as string) || "unknown",
      description: (sample?.description as string) || "Decision needed",
      sample: issue.sample,
      proposed: issue.proposed,
      source: issue.source,
      createdAt: issue.createdAt,
    };
  });
}

export async function resolveDecision(
  issueId: string,
  response: DecisionResponse,
  campaignId?: string
): Promise<void> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
  });

  if (!issue) {
    throw new Error("Issue not found");
  }

  const sample = issue.sample as Record<string, unknown>;
  if (!sample?.key || typeof sample.key !== 'string') {
    throw new Error("Invalid issue - missing key");
  }

  const key = sample.key;
  
  if (response.approved) {
    // Create the decision record
    const proposed = issue.proposed as Record<string, unknown>;
    const finalPath = response.finalPath || (proposed?.path as string);
    const finalType = response.finalType || (proposed?.type as string);
    
    await createDecision(
      key,
      campaignId ? `CAMPAIGN:${campaignId}` : "GLOBAL",
      {
        path: finalPath,
        type: finalType,
        reasoning: response.reasoning || null,
        approvedAt: new Date().toISOString(),
      },
      campaignId
    );
    
    // Log to backlog
    await logToBacklog({
      type: "decision",
      key,
      scope: campaignId ? `CAMPAIGN:${campaignId}` : "GLOBAL",
      value: { path: finalPath, type: finalType },
      source: issue.source,
      reasoning: response.reasoning || null,
    });
    
    // Mark issue as resolved
    await prisma.issue.update({
      where: { id: issueId },
      data: { status: "resolved" },
    });
    
    // Write to clarifications.md if this affects the repository
    if (!campaignId) { // Global decisions get documented
      await writeClarification({
        decisionId: key,
        spreadsheetReference: issue.source,
        issue: (issue.sample as { description?: string })?.description || "Decision needed",
        resolution: `Mapped to ${finalPath} (${finalType})`,
        reasoning: response.reasoning || undefined,
      });
    }
  } else {
    // Mark as resolved but rejected
    await prisma.issue.update({
      where: { id: issueId },
      data: { status: "resolved" },
    });
  }
}

export async function logToBacklog(entry: {
  type: "decision" | "issue" | "clarification";
  [key: string]: Prisma.JsonValue;
}): Promise<void> {
  const backlogPath = path.join(
    process.cwd(),
    "apps", 
    "GROWTH_Vault", 
    ".growth", 
    "backlog.jsonl"
  );
  
  const logEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    id: createId(),
  };
  
  try {
    await fs.appendFile(backlogPath, JSON.stringify(logEntry) + "\n");
    
    // Also update the markdown backlog
    await updateMarkdownBacklog(logEntry);
  } catch (error) {
    console.error("Failed to write to backlog:", error);
    // Don't throw - this shouldn't block gameplay
  }
}

async function updateMarkdownBacklog(entry: Record<string, Prisma.JsonValue>): Promise<void> {
  const backlogMdPath = path.join(
    process.cwd(),
    "apps",
    "GROWTH_Vault", 
    ".growth",
    "backlog.md"
  );
  
  try {
    const content = await fs.readFile(backlogMdPath, "utf-8");
    
    const timestamp = new Date(entry.timestamp as string | number | Date).toLocaleString();
    let logEntry = "";
    
    if (entry.type === "decision") {
      logEntry = `\n### ${timestamp} - Decision: ${entry.key}\n\n` +
        `**Scope:** ${entry.scope}\n` +
        `**Mapping:** ${(entry.value as { path?: string; type?: string })?.path} (${(entry.value as { path?: string; type?: string })?.type})\n` +
        (entry.reasoning ? `**Reasoning:** ${entry.reasoning}\n` : "") +
        `**Source:** ${JSON.stringify(entry.source)}\n`;
    } else if (entry.type === "issue") {
      logEntry = `\n### ${timestamp} - Issue: ${entry.severity}\n\n` +
        `**Message:** ${entry.message}\n` +
        `**Source:** ${JSON.stringify(entry.source)}\n`;
    } else if (entry.type === "clarification") {
      logEntry = `\n### ${timestamp} - Clarification\n\n` +
        `**Key:** ${entry.key}\n` +
        `**Description:** ${entry.description}\n` +
        `**Resolution:** ${entry.resolution}\n`;
    }
    
    // Insert before the last line (which should be empty or minimal)
    const lines = content.split("\n");
    const insertIndex = Math.max(0, lines.length - 1);
    lines.splice(insertIndex, 0, logEntry);
    
    await fs.writeFile(backlogMdPath, lines.join("\n"));
  } catch (error) {
    console.error("Failed to update markdown backlog:", error);
  }
}

async function writeClarification(data: {
  decisionId: string;
  spreadsheetReference: Prisma.JsonValue;
  issue: string;
  resolution: string;
  reasoning?: string;
}): Promise<void> {
  const clarificationsPath = path.join(
    process.cwd(),
    "apps",
    "GROWTH_Vault",
    "docs", 
    "clarifications.md"
  );
  
  try {
    let content = await fs.readFile(clarificationsPath, "utf-8");
    
    const timestamp = new Date().toLocaleString();
    const clarification = `\n---\n\n` +
      `## ${timestamp}\n\n` +
      `**Decision ID:** ${data.decisionId}\n` +
      `**Sheet Reference:** ${JSON.stringify(data.spreadsheetReference)}\n` +
      `**Issue:** ${data.issue}\n` +
      `**Resolution:** ${data.resolution}\n` +
      (data.reasoning ? `**Reasoning:** ${data.reasoning}\n` : "") +
      `**Repository Update:** TBD (manual review needed)\n`;
    
    // Append to the end
    content += clarification;
    
    await fs.writeFile(clarificationsPath, content);
  } catch (error) {
    console.error("Failed to write clarification:", error);
  }
}

export async function clearResolvedDecisions(): Promise<number> {
  const result = await prisma.issue.deleteMany({
    where: {
      status: "resolved",
      createdAt: {
        lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Older than 7 days
      },
    },
  });
  
  return result.count;
}

export async function getDecisionHistory(campaignId?: string): Promise<Array<{
  id: string;
  createdAt: Date;
  campaignId: string | null;
  scope: string;
  key: string;
  value: Prisma.JsonValue;
}>> {
  const whereCondition = campaignId
    ? {
        OR: [
          { scope: "GLOBAL" },
          { scope: `CAMPAIGN:${campaignId}` },
        ],
      }
    : { scope: "GLOBAL" };

  const decisions = await prisma.decision.findMany({
    where: whereCondition,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return decisions;
}