const fs = require('fs');
const path = require('path');

const FILES = [
  'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data\\conversations-015.json',
  'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data\\conversations-016.json',
  'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data\\conversations-017.json',
  'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data\\conversations-018.json',
];

const KEYWORDS = [
  'GROWTH', 'GRO.WTH', 'TTRPG', 'tabletop', 'RPG', 'pillar',
  'trailblazer', 'watcher', 'godhead', 'KRMA', 'karma',
  'soul pillar', 'spirit pillar', 'body pillar', 'dice system',
  'character creation', 'campaign', 'backstory', 'alchemical',
  'prima materia', 'Thread', 'Lucidity'
];

// Build regexes once
const keywordRegexes = KEYWORDS.map(kw => ({
  keyword: kw,
  regex: new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
}));

function extractMessages(conv) {
  const texts = [];
  if (!conv.mapping) return texts;
  for (const node of Object.values(conv.mapping)) {
    if (node.message && node.message.content && node.message.content.parts) {
      for (const part of node.message.content.parts) {
        if (typeof part === 'string' && part.length > 0) {
          texts.push(part);
        }
      }
    }
  }
  return texts;
}

function searchConversation(conv) {
  const title = conv.title || '';
  const messages = extractMessages(conv);
  const allText = title + '\n' + messages.join('\n');

  const matchedKeywords = [];
  for (const { keyword, regex } of keywordRegexes) {
    if (regex.test(allText)) {
      matchedKeywords.push(keyword);
    }
  }

  if (matchedKeywords.length === 0) return null;

  // Find first matching excerpt
  let excerpt = '';
  for (const { keyword, regex } of keywordRegexes) {
    if (!matchedKeywords.includes(keyword)) continue;
    // Check title first
    if (regex.test(title)) {
      excerpt = title.substring(0, 200);
      break;
    }
    // Then messages
    for (const msg of messages) {
      if (regex.test(msg)) {
        const idx = msg.search(regex);
        const start = Math.max(0, idx - 50);
        excerpt = msg.substring(start, start + 200);
        break;
      }
    }
    if (excerpt) break;
  }

  const createDate = conv.create_time
    ? new Date(conv.create_time * 1000).toISOString()
    : null;

  return {
    id: conv.id || conv.conversation_id || 'unknown',
    title,
    create_time: createDate,
    matched_keywords: matchedKeywords,
    excerpt: excerpt.trim()
  };
}

function processFile(filePath) {
  console.log(`Processing: ${path.basename(filePath)}`);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const conversations = JSON.parse(raw);
  console.log(`  ${conversations.length} conversations`);

  const results = [];
  for (const conv of conversations) {
    const match = searchConversation(conv);
    if (match) results.push(match);
  }
  console.log(`  ${results.length} matches`);
  return results;
}

// Main
const allResults = [];
for (const f of FILES) {
  if (!fs.existsSync(f)) {
    console.log(`SKIP (not found): ${f}`);
    continue;
  }
  const results = processFile(f);
  allResults.push(...results);
}

console.log(`\nTotal matches: ${allResults.length}`);

// Sort by create_time
allResults.sort((a, b) => (a.create_time || '').localeCompare(b.create_time || ''));

const outPath = 'C:\\Projects\\GRO.WTH\\ai-data-index\\chatgpt-batch-4.json';
fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2), 'utf-8');
console.log(`Written to: ${outPath}`);
