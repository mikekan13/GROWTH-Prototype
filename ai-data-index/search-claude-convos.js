#!/usr/bin/env node
/**
 * Search Claude conversation exports for GROWTH-related conversations.
 * Handles large JSON files via streaming with JSONStream.
 *
 * Usage: node --max-old-space-size=512 search-claude-convos.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join('C:', 'Users', 'Mikek', 'OneDrive', 'Desktop', 'AI Data', 'Claude Full Data', 'conversations.json');
const OUTPUT_FILE = path.join(__dirname, 'claude-conversations.json');

const KEYWORDS = [
  'GROWTH', 'GRO.WTH', 'TTRPG', 'tabletop', 'RPG',
  'pillar', 'trailblazer', 'watcher', 'godhead', 'KRMA', 'karma',
  'soul pillar', 'spirit pillar', 'body pillar',
  'dice system', 'character creation', 'campaign', 'backstory',
  'alchemical', 'prima materia', 'Thread', 'Lucidity'
];

// Build regex patterns - escape special chars, case insensitive
const keywordPatterns = KEYWORDS.map(kw => ({
  keyword: kw,
  regex: new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
}));

// More specific patterns to reduce false positives for common words
const STRONG_KEYWORDS = new Set([
  'GROWTH', 'GRO.WTH', 'TTRPG', 'trailblazer', 'godhead', 'KRMA',
  'soul pillar', 'spirit pillar', 'body pillar', 'dice system',
  'prima materia', 'Lucidity', 'alchemical'
]);
const WEAK_KEYWORDS = new Set([
  'tabletop', 'RPG', 'pillar', 'karma', 'character creation',
  'campaign', 'backstory', 'Thread', 'watcher'
]);

function scoreConversation(matchedKeywords) {
  let score = 0;
  for (const kw of matchedKeywords) {
    if (STRONG_KEYWORDS.has(kw)) score += 3;
    else if (WEAK_KEYWORDS.has(kw)) score += 1;
  }
  return score;
}

function getMessageText(msg) {
  let text = msg.text || '';
  if (msg.content && Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.text) text += ' ' + block.text;
    }
  }
  return text;
}

async function main() {
  console.log(`Reading ${INPUT_FILE}...`);
  console.log('This may take a moment for a 54MB file...');

  const raw = fs.readFileSync(INPUT_FILE, 'utf-8');
  console.log(`File loaded (${(raw.length / 1024 / 1024).toFixed(1)} MB). Parsing JSON...`);

  const conversations = JSON.parse(raw);
  console.log(`Parsed ${conversations.length} conversations. Searching...`);

  const results = [];
  let scanned = 0;

  for (const convo of conversations) {
    scanned++;
    if (scanned % 100 === 0) process.stdout.write(`\rScanned ${scanned}/${conversations.length}...`);

    const matchedKeywords = new Set();
    let firstMatchExcerpt = '';
    let firstMatchContext = '';

    // Check conversation name/title
    const name = convo.name || '';
    for (const { keyword, regex } of keywordPatterns) {
      if (regex.test(name)) {
        matchedKeywords.add(keyword);
        if (!firstMatchExcerpt) {
          firstMatchExcerpt = name.substring(0, 200);
          firstMatchContext = 'title';
        }
      }
    }

    // Check all message content
    const messages = convo.chat_messages || [];
    for (const msg of messages) {
      const text = getMessageText(msg);
      if (!text) continue;

      for (const { keyword, regex } of keywordPatterns) {
        if (regex.test(text)) {
          matchedKeywords.add(keyword);
          if (!firstMatchExcerpt) {
            // Find the match position and extract context around it
            const match = text.match(regex);
            if (match) {
              const idx = match.index;
              const start = Math.max(0, idx - 50);
              const end = Math.min(text.length, idx + 150);
              firstMatchExcerpt = (start > 0 ? '...' : '') + text.substring(start, end).replace(/\s+/g, ' ') + (end < text.length ? '...' : '');
              firstMatchContext = `message by ${msg.sender || 'unknown'}`;
            }
          }
        }
      }
    }

    if (matchedKeywords.size === 0) continue;

    const matched = Array.from(matchedKeywords);
    const score = scoreConversation(matched);

    // Require score >= 2 to filter noise (single weak keyword match = likely irrelevant)
    if (score < 2) continue;

    results.push({
      id: convo.uuid,
      name: convo.name || '(untitled)',
      created_at: convo.created_at,
      updated_at: convo.updated_at,
      message_count: messages.length,
      matched_keywords: matched,
      relevance_score: score,
      first_match_excerpt: firstMatchExcerpt,
      first_match_context: firstMatchContext
    });
  }

  console.log(`\n\nDone. Found ${results.length} GROWTH-related conversations out of ${conversations.length} total.`);

  // Sort by relevance score descending, then by date
  results.sort((a, b) => b.relevance_score - a.relevance_score || new Date(b.created_at) - new Date(a.created_at));

  const output = {
    metadata: {
      source_file: INPUT_FILE,
      total_conversations: conversations.length,
      matching_conversations: results.length,
      keywords_searched: KEYWORDS,
      generated_at: new Date().toISOString(),
      scoring: 'Strong keywords (GROWTH, GRO.WTH, TTRPG, etc.) = 3pts, weak keywords (RPG, campaign, etc.) = 1pt. Minimum score 2 to include.'
    },
    conversations: results
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Results written to ${OUTPUT_FILE}`);

  // Print top 15 summary
  console.log('\n=== TOP 15 MOST RELEVANT ===\n');
  for (const r of results.slice(0, 15)) {
    console.log(`[Score: ${r.relevance_score}] ${r.name}`);
    console.log(`  Date: ${r.created_at?.split('T')[0]}  |  Messages: ${r.message_count}  |  Keywords: ${r.matched_keywords.join(', ')}`);
    console.log(`  Excerpt: ${r.first_match_excerpt.substring(0, 120)}...`);
    console.log('');
  }

  // Print score distribution
  const scoreDist = {};
  for (const r of results) {
    const bucket = r.relevance_score >= 10 ? '10+' : String(r.relevance_score);
    scoreDist[bucket] = (scoreDist[bucket] || 0) + 1;
  }
  console.log('Score distribution:', scoreDist);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
