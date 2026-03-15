const fs = require('fs');
const path = require('path');

const FILES = [
  'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data\\conversations-005.json',
  'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data\\conversations-006.json',
  'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data\\conversations-007.json',
  'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data\\conversations-008.json',
  'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data\\conversations-009.json',
];

const KEYWORDS = [
  'GROWTH', 'GRO.WTH', 'TTRPG', 'tabletop', 'RPG', 'pillar', 'trailblazer',
  'watcher', 'godhead', 'KRMA', 'karma', 'soul pillar', 'spirit pillar',
  'body pillar', 'dice system', 'character creation', 'campaign', 'backstory',
  'alchemical', 'prima materia', 'Thread', 'Lucidity'
];

// Build regex patterns - escape special chars, case insensitive
const patterns = KEYWORDS.map(kw => ({
  keyword: kw,
  regex: new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
}));

function extractMessages(mapping) {
  const messages = [];
  if (!mapping) return messages;
  for (const nodeId of Object.keys(mapping)) {
    const node = mapping[nodeId];
    if (node && node.message && node.message.content && node.message.content.parts) {
      for (const part of node.message.content.parts) {
        if (typeof part === 'string' && part.trim().length > 0) {
          messages.push(part);
        }
      }
    }
  }
  return messages;
}

function searchConversation(conv) {
  const title = conv.title || '';
  const id = conv.id || '';
  const createTime = conv.create_time ? new Date(conv.create_time * 1000).toISOString().split('T')[0] : 'unknown';

  const matchedKeywords = new Set();
  let firstMatchExcerpt = '';
  let firstMatchMsg = '';

  // Check title
  for (const p of patterns) {
    if (p.regex.test(title)) {
      matchedKeywords.add(p.keyword);
    }
  }

  // Check messages
  const messages = extractMessages(conv.mapping);
  for (const msg of messages) {
    for (const p of patterns) {
      if (p.regex.test(msg)) {
        matchedKeywords.add(p.keyword);
        if (!firstMatchMsg) {
          firstMatchMsg = msg;
        }
      }
    }
  }

  if (matchedKeywords.size === 0) return null;

  // Get excerpt from first matching message
  if (firstMatchMsg) {
    firstMatchExcerpt = firstMatchMsg.substring(0, 200).replace(/\n/g, ' ');
  }

  return {
    title,
    date: createTime,
    conversationId: id,
    matchedKeywords: Array.from(matchedKeywords),
    excerpt: firstMatchExcerpt
  };
}

async function processFile(filePath) {
  console.log(`Processing: ${path.basename(filePath)}`);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const conversations = JSON.parse(raw);
  console.log(`  ${conversations.length} conversations in file`);

  const results = [];
  for (const conv of conversations) {
    const match = searchConversation(conv);
    if (match) {
      match.sourceFile = path.basename(filePath);
      results.push(match);
    }
  }
  console.log(`  ${results.length} matches found`);
  return results;
}

async function main() {
  const allResults = [];

  for (const file of FILES) {
    if (!fs.existsSync(file)) {
      console.log(`SKIPPED (not found): ${file}`);
      continue;
    }
    try {
      const results = await processFile(file);
      allResults.push(...results);
    } catch (err) {
      console.error(`ERROR processing ${file}: ${err.message}`);
    }
    // Force GC hint between files
    if (global.gc) global.gc();
  }

  const outPath = 'C:\\Projects\\GRO.WTH\\ai-data-index\\chatgpt-batch-2.json';
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2), 'utf-8');
  console.log(`\nTotal matches: ${allResults.length}`);
  console.log(`Results written to: ${outPath}`);

  // Print summary
  const byFile = {};
  for (const r of allResults) {
    byFile[r.sourceFile] = (byFile[r.sourceFile] || 0) + 1;
  }
  console.log('\nMatches per file:');
  for (const [f, c] of Object.entries(byFile)) {
    console.log(`  ${f}: ${c}`);
  }

  // Keyword frequency
  const kwFreq = {};
  for (const r of allResults) {
    for (const kw of r.matchedKeywords) {
      kwFreq[kw] = (kwFreq[kw] || 0) + 1;
    }
  }
  console.log('\nKeyword frequency:');
  const sorted = Object.entries(kwFreq).sort((a, b) => b[1] - a[1]);
  for (const [kw, count] of sorted) {
    console.log(`  ${kw}: ${count}`);
  }
}

main().catch(console.error);
