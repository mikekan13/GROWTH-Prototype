import { promises as fs } from 'fs';
import { atomicWrite } from './fsUtils.js';

export interface AnchorReplaceResult {
  success: boolean;
  warning?: string;
  changedFiles: string[];
}

export async function replaceAnchorSection(
  filePath: string,
  anchor: string,
  newContent: string,
  stagingDir?: string
): Promise<AnchorReplaceResult> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Find anchor (looking for headings with the anchor)
    const anchorPattern = new RegExp(`^(#+)\\s+.*${anchor.replace('#', '')}`, 'i');
    let startIndex = -1;
    let endIndex = -1;
    let headingLevel = 0;
    
    // Find start of section
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(anchorPattern);
      if (match) {
        startIndex = i;
        headingLevel = match[1].length;
        break;
      }
    }
    
    if (startIndex === -1) {
      // Anchor not found, write to staging if provided
      if (stagingDir) {
        const stagingPath = `${stagingDir}/${filePath.replace(/[\/\\]/g, '-')}-${anchor.replace('#', '')}.md`;
        await atomicWrite(stagingPath, newContent);
        return {
          success: true,
          warning: "anchor not found; wrote to staging",
          changedFiles: []
        };
      }
      return {
        success: false,
        warning: "anchor not found and no staging directory provided",
        changedFiles: []
      };
    }
    
    // Find end of section (next heading of same or higher level)
    for (let i = startIndex + 1; i < lines.length; i++) {
      const match = lines[i].match(/^(#+)\s+/);
      if (match && match[1].length <= headingLevel) {
        endIndex = i;
        break;
      }
    }
    
    if (endIndex === -1) {
      endIndex = lines.length;
    }
    
    // Replace the section
    const newLines = [
      ...lines.slice(0, startIndex + 1),
      '',
      newContent.trim(),
      '',
      ...lines.slice(endIndex)
    ];
    
    const newFileContent = newLines.join('\n');
    await atomicWrite(filePath, newFileContent);
    
    return {
      success: true,
      changedFiles: [filePath]
    };
    
  } catch (error) {
    return {
      success: false,
      warning: `Error reading/writing file: ${error}`,
      changedFiles: []
    };
  }
}