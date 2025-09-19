import { join } from 'path';
import { atomicWrite } from 'growth-shared';
import { createDateSlug } from 'growth-shared';

export interface ProposeChangeInput {
  target: string;
  title: string;
  rationale: string;
  before: string;
  after: string;
  related_issues?: string[];
  __path?: string;
}

export interface ProposeChangeOutput {
  ok: boolean;
  proposalPath: string;
  error?: string;
}

export async function rulesProposeChange(input: ProposeChangeInput, growthRepo: string): Promise<ProposeChangeOutput> {
  try {
    const proposalPath = input.__path || `proposals/${createDateSlug(input.title)}.md`;
    const fullPath = join(growthRepo, proposalPath);
    
    const frontmatter = `---
status: proposed
target: ${input.target}
title: ${input.title}
created: ${new Date().toISOString()}
related_issues: ${JSON.stringify(input.related_issues || [])}
---`;

    const content = `${frontmatter}

# ${input.title}

## Rationale

${input.rationale}

## Before

\`\`\`
${input.before}
\`\`\`

## After

\`\`\`
${input.after}
\`\`\`

## Diff

\`\`\`diff
- ${input.before}
+ ${input.after}
\`\`\`
`;
    
    await atomicWrite(fullPath, content);
    
    return {
      ok: true,
      proposalPath: proposalPath
    };
  } catch (error) {
    return {
      ok: false,
      proposalPath: '',
      error: String(error)
    };
  }
}