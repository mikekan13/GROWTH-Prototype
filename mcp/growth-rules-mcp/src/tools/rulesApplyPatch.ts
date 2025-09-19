import { promises as fs } from 'fs';
import { join } from 'path';
import { replaceAnchorSection } from 'growth-shared';

export interface ApplyPatchInput {
  proposalPath: string;
  mode: 'staging' | 'direct';
  commitMessage?: string;
}

export interface ApplyPatchOutput {
  ok: boolean;
  changedFiles: string[];
  warning?: string;
  error?: string;
}

interface ProposalData {
  target: string;
  after: string;
}

export async function rulesApplyPatch(input: ApplyPatchInput, growthRepo: string): Promise<ApplyPatchOutput> {
  try {
    const proposalFullPath = join(growthRepo, input.proposalPath);
    const proposalContent = await fs.readFile(proposalFullPath, 'utf8');
    
    const proposal = parseProposal(proposalContent);
    if (!proposal) {
      return {
        ok: false,
        changedFiles: [],
        error: 'Failed to parse proposal file'
      };
    }
    
    const [targetFile, anchor] = proposal.target.split('#');
    const targetFullPath = join(growthRepo, targetFile);
    
    if (input.mode === 'staging') {
      const stagingDir = join(growthRepo, 'staging');
      const result = await replaceAnchorSection(targetFullPath, anchor, proposal.after, stagingDir);
      
      return {
        ok: result.success,
        changedFiles: result.changedFiles,
        warning: result.warning
      };
    } else {
      const result = await replaceAnchorSection(targetFullPath, anchor, proposal.after);
      
      return {
        ok: result.success,
        changedFiles: result.changedFiles,
        warning: result.warning
      };
    }
  } catch (error) {
    return {
      ok: false,
      changedFiles: [],
      error: String(error)
    };
  }
}

function parseProposal(content: string): ProposalData | null {
  try {
    const frontmatterMatch = content.match(/^---\n(.*?)\n---/s);
    if (!frontmatterMatch) return null;
    
    const frontmatter = frontmatterMatch[1];
    const targetMatch = frontmatter.match(/target:\s*(.+)/);
    if (!targetMatch) return null;
    
    const afterMatch = content.match(/## After\n\n```\n(.*?)\n```/s);
    if (!afterMatch) return null;
    
    return {
      target: targetMatch[1].trim(),
      after: afterMatch[1]
    };
  } catch {
    return null;
  }
}