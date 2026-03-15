const fs = require('fs');
const path = require('path');

const FILES = [
  'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data\\conversations-010.json',
  'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data\\conversations-011.json',
  'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data\\conversations-012.json',
  'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data\\conversations-013.json',
  'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data\\conversations-014.json',
];

const KEYWORDS = [
  'GROWTH', 'GRO.WTH', 'TTRPG', 'tabletop', 'RPG', 'pillar',
  'trailblazer', 'watcher', 'godhead', 'KRMA', 'karma',
  'soul pillar', 'spirit pillar', 'body pillar', 'dice system',
  'character creation', 'campaign', 'backstory', 'alchemical',
  'prima materia', 'Thread', 'Lucidity'
];

// Build regex patterns - case insensitive
const patterns = KEYWORDS.map(kw => ({
  keyword: kw,
  regex: new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
}));

function extractMessages(mapping) {
  const texts = [];
  if (!mapping) return texts;
  for (const node of Object.values(mapping)) {
    try {
      const parts = node?.message?.content?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (typeof part === 'string' && part.length > 0) {
            texts.push(part);
          }
        }
      }
    } catch (e) {
      // skip malformed nodes
    }
  }
  return texts;
}

function searchConversation(conv) {
  const title = conv.title || '';
  const messages = extractMessages(conv.mapping);
  const allText = title + '\n' + messages.join('\n');

  const matchedKeywords = [];
  let firstExcerpt = '';

  for (const { keyword, regex } of patterns) {
    const match = regex.exec(allText);
    if (match) {
      matchedKeywords.push(keyword);
      if (!firstExcerpt) {
        const start = Math.max(0, match.index - 50);
        const end = Math.min(allText.length, match.index + 200);
        firstExcerpt = allText.slice(start, end).replace(/\n/g, ' ').trim();
      }
    }
  }

  if (matchedKeywords.length === 0) return null;

  // Filter out conversations that only match very generic keywords with no GROWTH context
  const specificKeywords = ['GROWTH', 'GRO.WTH', 'TTRPG', 'trailblazer', 'watcher', 'godhead',
    'KRMA', 'soul pillar', 'spirit pillar', 'body pillar', 'dice system',
    'prima materia', 'Lucidity', 'alchemical'];
  const genericOnly = matchedKeywords.every(kw =>
    ['RPG', 'pillar', 'campaign', 'backstory', 'karma', 'tabletop', 'character creation', 'Thread'].includes(kw)
  );

  // Still include generic-only matches but flag them
  const createTime = conv.create_time
    ? new Date(conv.create_time * 1000).toISOString().split('T')[0]
    : 'unknown';

  return {
    id: conv.id || 'unknown',
    title,
    create_time: createTime,
    matched_keywords: matchedKeywords,
    likely_growth_related: !genericOnly,
    excerpt: firstExcerpt.slice(0, 200),
  };
}

async function main() {
  const allResults = [];

  for (const filePath of FILES) {
    const basename = path.basename(filePath);
    console.log(`Processing ${basename}...`);

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const conversations = JSON.parse(raw);
      console.log(`  ${conversations.length} conversations`);

      let matches = 0;
      for (const conv of conversations) {
        const result = searchConversation(conv);
        if (result) {
          result.source_file = basename;
          allResults.push(result);
          matches++;
        }
      }
      console.log(`  ${matches} matches`);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
  }

  // Sort by likely_growth_related (true first), then by date
  allResults.sort((a, b) => {
    if (a.likely_growth_related !== b.likely_growth_related) {
      return a.likely_growth_related ? -1 : 1;
    }
    return a.create_time.localeCompare(b.create_time);
  });

  const output = {
    search_date: new Date().toISOString(),
    files_processed: FILES.map(f => path.basename(f)),
    keywords_searched: KEYWORDS,
    total_matches: allResults.length,
    likely_growth_related: allResults.filter(r => r.likely_growth_related).length,
    generic_keyword_only: allResults.filter(r => !r.likely_growth_related).length,
    results: allResults,
  };

  const outPath = 'C:\\Projects\\GRO.WTH\\ai-data-index\\chatgpt-batch-3.json';
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nWrote ${allResults.length} results to ${outPath}`);
  console.log(`  Likely GROWTH-related: ${output.likely_growth_related}`);
  console.log(`  Generic keyword only: ${output.generic_keyword_only}`);
}

main();
