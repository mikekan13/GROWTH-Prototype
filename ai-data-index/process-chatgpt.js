const fs = require('fs');
const path = require('path');

const BASE = 'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data';
const FILES = [
  'conversations-000.json',
  'conversations-001.json',
  'conversations-002.json',
  'conversations-003.json',
  'conversations-004.json',
];
const OUTPUT = 'C:\\Projects\\GRO.WTH\\ai-data-index\\chatgpt-batch-1.json';

const keywords = [
  'growth', 'gro.wth', 'ttrpg', 'tabletop', 'rpg', 'pillar',
  'trailblazer', 'watcher', 'godhead', 'krma', 'karma',
  'soul pillar', 'spirit pillar', 'body pillar', 'dice system',
  'character creation', 'campaign', 'backstory', 'alchemical',
  'prima materia', 'thread', 'lucidity'
];

// Build regex for each keyword
const keywordRegexes = keywords.map(kw => ({
  keyword: kw,
  regex: new RegExp(kw.replace(/\./g, '\\.'), 'i')
}));

function getExcerpt(text, keyword, maxLen = 200) {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return text.substring(0, maxLen);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + keyword.length + 140);
  let excerpt = text.substring(start, end).trim();
  if (start > 0) excerpt = '...' + excerpt;
  if (end < text.length) excerpt = excerpt + '...';
  return excerpt;
}

function extractMessages(mapping) {
  const messages = [];
  if (!mapping) return messages;
  for (const nodeId of Object.keys(mapping)) {
    const node = mapping[nodeId];
    if (node && node.message && node.message.content && node.message.content.parts) {
      for (const part of node.message.content.parts) {
        if (typeof part === 'string' && part.length > 0) {
          messages.push(part);
        }
      }
    }
  }
  return messages;
}

const allResults = [];

for (const file of FILES) {
  const filePath = path.join(BASE, file);
  console.log(`Processing ${file}...`);

  let data;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    data = JSON.parse(raw);
  } catch (e) {
    console.log(`  ERROR reading ${file}: ${e.message}`);
    continue;
  }

  console.log(`  ${data.length} conversations`);
  let matchCount = 0;

  for (const conv of data) {
    const title = conv.title || '';
    const convId = conv.id || conv.conversation_id || 'unknown';
    const createTime = conv.create_time ? new Date(conv.create_time * 1000).toISOString().split('T')[0] : 'unknown';

    // Check title
    const matchedKeywords = new Set();
    let firstExcerpt = '';
    let excerptSource = '';

    for (const {keyword, regex} of keywordRegexes) {
      if (regex.test(title)) {
        matchedKeywords.add(keyword);
        if (!firstExcerpt) {
          firstExcerpt = `[TITLE] ${title}`;
          excerptSource = 'title';
        }
      }
    }

    // Check message content
    const messages = extractMessages(conv.mapping);
    for (const msg of messages) {
      for (const {keyword, regex} of keywordRegexes) {
        if (regex.test(msg)) {
          matchedKeywords.add(keyword);
          if (!firstExcerpt || excerptSource === 'title') {
            if (excerptSource !== 'content') {
              firstExcerpt = getExcerpt(msg, keyword);
              excerptSource = 'content';
            }
          }
        }
      }
      // Early exit if all keywords found
      if (matchedKeywords.size === keywords.length) break;
    }

    if (matchedKeywords.size > 0) {
      // Filter out conversations that ONLY match very generic terms without GROWTH context
      const genericOnly = ['rpg', 'campaign', 'thread', 'karma', 'pillar', 'backstory', 'tabletop'];
      const specificKeywords = [...matchedKeywords].filter(k => !genericOnly.includes(k));

      // Calculate relevance score
      const hasGrowthDirect = matchedKeywords.has('growth') || matchedKeywords.has('gro.wth');
      const hasSpecific = specificKeywords.length > 0;
      const keywordCount = matchedKeywords.size;

      // Only include if: has direct GROWTH mention, OR has specific keywords, OR has 3+ generic matches
      if (hasGrowthDirect || hasSpecific || keywordCount >= 3) {
        allResults.push({
          title,
          date: createTime,
          conversationId: convId,
          sourceFile: file,
          keywordsMatched: [...matchedKeywords].sort(),
          keywordCount,
          hasDirectGrowthMention: hasGrowthDirect,
          excerpt: firstExcerpt.substring(0, 300)
        });
        matchCount++;
      }
    }
  }

  console.log(`  ${matchCount} matching conversations`);
}

// Sort by relevance: direct GROWTH mentions first, then by keyword count, then by date
allResults.sort((a, b) => {
  if (a.hasDirectGrowthMention !== b.hasDirectGrowthMention) return b.hasDirectGrowthMention ? 1 : -1;
  if (a.keywordCount !== b.keywordCount) return b.keywordCount - a.keywordCount;
  return b.date.localeCompare(a.date);
});

const output = {
  generated: new Date().toISOString(),
  totalMatches: allResults.length,
  filesProcessed: FILES.length,
  keywordsUsed: keywords,
  conversations: allResults
};

fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf8');
console.log(`\nDone. ${allResults.length} total matches written to ${OUTPUT}`);
