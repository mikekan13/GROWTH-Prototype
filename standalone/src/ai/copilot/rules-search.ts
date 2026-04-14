import 'server-only';
import fs from 'fs';
import path from 'path';

const REPO_PATH = path.resolve(process.cwd(), '..', 'GRO.WTH Repository');
const MAX_SNIPPET_LENGTH = 800;
const MAX_RESULTS = 3;

// Cache the file index
let fileIndex: { name: string; path: string }[] | null = null;

function getFileIndex(): { name: string; path: string }[] {
  if (fileIndex) return fileIndex;

  try {
    const entries = fs.readdirSync(REPO_PATH, { withFileTypes: true });
    fileIndex = entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => ({ name: e.name.replace('.md', ''), path: path.join(REPO_PATH, e.name) }));

    // Also check subdirectories (one level deep)
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        try {
          const subEntries = fs.readdirSync(path.join(REPO_PATH, entry.name), { withFileTypes: true });
          for (const sub of subEntries) {
            if (sub.isFile() && sub.name.endsWith('.md')) {
              fileIndex.push({
                name: `${entry.name}/${sub.name.replace('.md', '')}`,
                path: path.join(REPO_PATH, entry.name, sub.name),
              });
            }
          }
        } catch { /* skip */ }
      }
    }
  } catch {
    fileIndex = [];
  }

  return fileIndex;
}

// Extract keywords from a message for searching
function extractKeywords(message: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'about',
    'what', 'how', 'when', 'where', 'who', 'which', 'that', 'this',
    'it', 'its', 'and', 'or', 'but', 'not', 'no', 'if', 'then', 'than',
    'so', 'up', 'out', 'just', 'also', 'very', 'much', 'more', 'most',
    'me', 'my', 'i', 'you', 'your', 'we', 'they', 'he', 'she',
  ]);

  return message
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

// Search rules files for relevant content
export async function searchRules(message: string): Promise<string> {
  const files = getFileIndex();
  if (files.length === 0) return '';

  const keywords = extractKeywords(message);
  if (keywords.length === 0) return '';

  // Score each file by keyword matches in filename and content
  const scored: { name: string; score: number; snippet: string }[] = [];

  for (const file of files) {
    let score = 0;
    const nameLower = file.name.toLowerCase();

    // Score filename matches (worth more)
    for (const kw of keywords) {
      if (nameLower.includes(kw)) score += 3;
    }

    // Read file and score content matches
    try {
      const content = fs.readFileSync(file.path, 'utf-8');
      const contentLower = content.toLowerCase();

      for (const kw of keywords) {
        const matches = contentLower.split(kw).length - 1;
        score += Math.min(matches, 5); // cap per keyword
      }

      if (score > 0) {
        // Extract best snippet: find the paragraph with the most keyword hits
        const paragraphs = content.split(/\n\n+/);
        let bestParagraph = '';
        let bestParaScore = 0;

        for (const para of paragraphs) {
          const paraLower = para.toLowerCase();
          let paraScore = 0;
          for (const kw of keywords) {
            if (paraLower.includes(kw)) paraScore++;
          }
          if (paraScore > bestParaScore) {
            bestParaScore = paraScore;
            bestParagraph = para;
          }
        }

        const snippet = bestParagraph.length > MAX_SNIPPET_LENGTH
          ? bestParagraph.substring(0, MAX_SNIPPET_LENGTH) + '...'
          : bestParagraph;

        scored.push({ name: file.name, score, snippet });
      }
    } catch { /* skip unreadable files */ }
  }

  // Return top results
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, MAX_RESULTS);

  if (top.length === 0) return '';

  return top.map(r => `[Rule: ${r.name}]\n${r.snippet}`).join('\n\n');
}
