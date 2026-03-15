const fs = require('fs');
const path = require('path');

const indexDir = 'C:\\Projects\\GRO.WTH\\ai-data-index';
const convoDir = 'C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Chatgpt full data';

// GROWTH-specific keywords (weighted higher) vs generic ones
const GROWTH_KEYWORDS = [
  'krma', 'godhead', 'trailblazer', 'watcher', 'prima materia',
  'gro.wth', 'lucidity', 'alchemical', 'soul pillar', 'spirit pillar',
  'body pillar', 'dice system', 'thread'
];
const MEDIUM_KEYWORDS = ['growth', 'ttrpg', 'tabletop', 'rpg', 'pillar', 'backstory', 'character creation'];
const GENERIC_KEYWORDS = ['campaign', 'karma'];

// False positive filters - titles that clearly aren't GROWTH-related
const FALSE_POSITIVE_PATTERNS = [
  /taco bell/i, /tolnaftate/i, /fungus/i, /sourdough/i, /jalapeno/i,
  /crypto/i, /monkey/i, /tiktok/i, /hashtag/i, /butter chicken/i,
  /cleaners/i, /driving hand/i, /broken screen/i, /nail irritation/i
];

function isLikelyFalsePositive(title, excerpt) {
  const combined = (title + ' ' + (excerpt || '')).toLowerCase();
  if (FALSE_POSITIVE_PATTERNS.some(p => p.test(combined))) return true;
  return false;
}

function scoreConversation(keywords, title, excerpt, hasDirectMention) {
  let score = 0;
  const matched = (keywords || []).map(k => k.toLowerCase());

  for (const kw of matched) {
    if (GROWTH_KEYWORDS.includes(kw)) score += 3;
    else if (MEDIUM_KEYWORDS.includes(kw)) score += 2;
    else if (GENERIC_KEYWORDS.includes(kw)) score += 1;
  }

  // Bonus for direct GROWTH mention
  if (hasDirectMention) score += 2;

  // Bonus for GROWTH in title
  if (/growth|gro\.wth/i.test(title)) score += 3;

  // Penalty for likely false positives
  if (isLikelyFalsePositive(title, excerpt)) score -= 20;

  return score;
}

// ---- Step 1: Load and normalize all index files ----
console.log('Loading index files...');

const allConversations = [];

// Batch 1: { conversations: [...] } with keywordsMatched, keywordCount, hasDirectGrowthMention
const batch1 = JSON.parse(fs.readFileSync(path.join(indexDir, 'chatgpt-batch-1.json'), 'utf8'));
for (const c of batch1.conversations) {
  allConversations.push({
    id: c.conversationId,
    title: c.title,
    date: c.date,
    keywords: c.keywordsMatched || [],
    keywordCount: c.keywordCount || (c.keywordsMatched || []).length,
    hasDirectMention: c.hasDirectGrowthMention || false,
    excerpt: c.excerpt || '',
    sourceFile: c.sourceFile,
    source: 'batch-1'
  });
}

// Batch 2: array of { matchedKeywords, excerpt, sourceFile }
const batch2 = JSON.parse(fs.readFileSync(path.join(indexDir, 'chatgpt-batch-2.json'), 'utf8'));
for (const c of batch2) {
  allConversations.push({
    id: c.conversationId,
    title: c.title,
    date: c.date,
    keywords: c.matchedKeywords || [],
    keywordCount: (c.matchedKeywords || []).length,
    hasDirectMention: (c.matchedKeywords || []).some(k => /growth|gro\.wth/i.test(k)),
    excerpt: c.excerpt || '',
    sourceFile: c.sourceFile,
    source: 'batch-2'
  });
}

// Batch 3: { results: [...] } with matched_keywords, likely_growth_related
const batch3 = JSON.parse(fs.readFileSync(path.join(indexDir, 'chatgpt-batch-3.json'), 'utf8'));
for (const c of batch3.results) {
  allConversations.push({
    id: c.id,
    title: c.title,
    date: c.create_time,
    keywords: c.matched_keywords || [],
    keywordCount: (c.matched_keywords || []).length,
    hasDirectMention: c.likely_growth_related || false,
    excerpt: c.excerpt || '',
    sourceFile: c.source_file,
    source: 'batch-3'
  });
}

// Batch 4: array of { matched_keywords, excerpt }
const batch4 = JSON.parse(fs.readFileSync(path.join(indexDir, 'chatgpt-batch-4.json'), 'utf8'));
for (const c of batch4) {
  allConversations.push({
    id: c.id,
    title: c.title,
    date: c.create_time ? c.create_time.split('T')[0] : '',
    keywords: c.matched_keywords || [],
    keywordCount: (c.matched_keywords || []).length,
    hasDirectMention: (c.matched_keywords || []).some(k => /growth|gro\.wth/i.test(k)),
    excerpt: c.excerpt || '',
    sourceFile: null,
    source: 'batch-4'
  });
}

console.log(`Total conversations loaded: ${allConversations.length}`);

// ---- Step 2: Score and rank ----
for (const c of allConversations) {
  c.score = scoreConversation(c.keywords, c.title, c.excerpt, c.hasDirectMention);
}

// Deduplicate by ID (keep highest score)
const byId = new Map();
for (const c of allConversations) {
  const key = c.id || c.title;
  if (!byId.has(key) || byId.get(key).score < c.score) {
    byId.set(key, c);
  }
}

const unique = [...byId.values()];
unique.sort((a, b) => b.score - a.score);

// Filter out obvious false positives and take top 50
const top50 = unique.filter(c => c.score > 0).slice(0, 50);
console.log(`Top 50 scored conversations (highest score: ${top50[0]?.score}, lowest: ${top50[top50.length-1]?.score})`);

// ---- Step 3: Write top conversations JSON ----
const output = {
  generated: new Date().toISOString(),
  description: 'Top 50 GROWTH-relevant ChatGPT conversations ranked by keyword relevance score',
  scoring: {
    growth_specific_keywords: GROWTH_KEYWORDS,
    medium_keywords: MEDIUM_KEYWORDS,
    generic_keywords: GENERIC_KEYWORDS,
    weights: 'GROWTH-specific=3pts, Medium=2pts, Generic=1pt, Direct mention bonus=2pts, Title bonus=3pts'
  },
  conversations: top50.map(c => ({
    id: c.id,
    title: c.title,
    date: c.date,
    score: c.score,
    keywords: c.keywords,
    excerpt: c.excerpt,
    sourceFile: c.sourceFile,
    indexSource: c.source
  }))
};

fs.writeFileSync(
  path.join(indexDir, 'chatgpt-top-conversations.json'),
  JSON.stringify(output, null, 2)
);
console.log('Wrote chatgpt-top-conversations.json');

// ---- Step 4: Extract full messages from top 20 for design decision analysis ----
console.log('\nLoading original conversation files for top 20...');

const top20 = top50.slice(0, 20);

// Build a map of conversation ID -> index entry
const wantedIds = new Set(top20.map(c => c.id));

// Load all conversation files
const convoFiles = fs.readdirSync(convoDir).filter(f => f.startsWith('conversations-') && f.endsWith('.json'));
console.log(`Found ${convoFiles.length} conversation source files`);

const fullConversations = new Map();

for (const file of convoFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(convoDir, file), 'utf8'));
  for (const convo of data) {
    const id = convo.id || convo.conversation_id;
    if (wantedIds.has(id)) {
      // Extract all messages in order
      const messages = [];
      const mapping = convo.mapping || {};

      // Build tree to get order
      function extractMessages(nodeId, depth = 0) {
        if (!nodeId || !mapping[nodeId]) return;
        const node = mapping[nodeId];
        if (node.message && node.message.content) {
          const content = node.message.content;
          let text = '';
          if (content.parts) {
            text = content.parts.filter(p => typeof p === 'string').join('\n');
          } else if (typeof content === 'string') {
            text = content;
          }
          if (text.trim()) {
            messages.push({
              role: node.message.author?.role || 'unknown',
              text: text.trim()
            });
          }
        }
        if (node.children) {
          for (const childId of node.children) {
            extractMessages(childId, depth + 1);
          }
        }
      }

      // Find root nodes (no parent)
      const roots = Object.keys(mapping).filter(k => !mapping[k].parent);
      for (const root of roots) {
        extractMessages(root);
      }

      fullConversations.set(id, {
        title: convo.title,
        createTime: convo.create_time,
        messages
      });
    }
  }
}

console.log(`Extracted full content for ${fullConversations.size} of ${top20.length} conversations`);

// ---- Step 5: Analyze for design decisions ----
const DESIGN_PATTERNS = [
  { category: 'Combat System', patterns: [/combat/i, /attack/i, /damage/i, /hit points/i, /HP/i, /initiative/i, /turn order/i, /action economy/i, /wound/i, /defense/i, /weapon/i, /armor/i] },
  { category: 'Magic / Alchemy System', patterns: [/magic/i, /spell/i, /alchemy/i, /alchemical/i, /prima materia/i, /transmut/i, /element/i, /sulfur/i, /mercury/i, /salt/i, /tincture/i, /elixir/i] },
  { category: 'KRMA System', patterns: [/krma/i, /karma/i, /currency/i, /economy/i, /reward/i, /cost/i, /spend/i, /earn/i, /pool/i, /reserve/i] },
  { category: 'Character Creation', patterns: [/character creat/i, /backstory/i, /origin/i, /archetype/i, /class/i, /race/i, /lineage/i, /species/i, /heritage/i, /attributes/i, /stats/i] },
  { category: 'Pillar System', patterns: [/pillar/i, /body pillar/i, /soul pillar/i, /spirit pillar/i, /flow/i, /frequency/i, /focus/i, /willpower/i, /wisdom/i, /wit/i, /vigor/i, /vitality/i] },
  { category: 'Dice / Resolution', patterns: [/dice/i, /d4|d6|d8|d10|d12|d20/i, /roll/i, /check/i, /success/i, /failure/i, /critical/i, /resolution/i] },
  { category: 'Thread System', patterns: [/thread/i, /narrative/i, /story arc/i, /connection/i, /bond/i, /relation/i] },
  { category: 'Lucidity', patterns: [/lucidity/i, /consciousness/i, /awareness/i, /reality/i, /perception/i, /veil/i, /awaken/i] },
  { category: 'UI/UX / App Design', patterns: [/interface/i, /UI/i, /UX/i, /canvas/i, /panel/i, /dashboard/i, /app/i, /web app/i, /design/i, /layout/i, /component/i] },
  { category: 'Godhead / AI Agent', patterns: [/godhead/i, /AI agent/i, /oracle/i, /game master AI/i, /artificial/i, /machine learning/i] },
  { category: 'Watcher / GM System', patterns: [/watcher/i, /game master/i, /\bGM\b/, /campaign manage/i, /session/i] },
  { category: 'Trailblazer / Player', patterns: [/trailblazer/i, /player/i, /character sheet/i, /inventory/i, /equipment/i] },
  { category: 'World / Lore', patterns: [/world/i, /lore/i, /setting/i, /cosmology/i, /plane/i, /realm/i, /orthodox/i, /theolog/i, /parable/i] },
  { category: 'Forge / Crafting', patterns: [/forge/i, /craft/i, /material/i, /smith/i, /creat.*item/i, /recipe/i, /ingredient/i] },
  { category: 'Death / Consequences', patterns: [/death/i, /die\b/i, /dying/i, /consequence/i, /permadeath/i, /resurrect/i, /save/i, /death save/i] },
];

// Extract relevant passages from conversations
const designFindings = {};
for (const cat of DESIGN_PATTERNS) {
  designFindings[cat.category] = [];
}

for (const [id, convo] of fullConversations) {
  const indexEntry = top20.find(c => c.id === id);

  for (const msg of convo.messages) {
    if (msg.role === 'user') {
      // User messages contain Mike's decisions and preferences
      for (const cat of DESIGN_PATTERNS) {
        const matchCount = cat.patterns.filter(p => p.test(msg.text)).length;
        if (matchCount >= 2 || (matchCount >= 1 && msg.text.length < 500)) {
          // Extract relevant portion (first 1500 chars if long)
          const textSnippet = msg.text.length > 1500 ? msg.text.slice(0, 1500) + '...' : msg.text;
          designFindings[cat.category].push({
            conversationTitle: convo.title,
            date: indexEntry?.date || '',
            role: 'user',
            text: textSnippet,
            matchStrength: matchCount
          });
        }
      }
    } else if (msg.role === 'assistant') {
      // Assistant messages may contain structured summaries of decisions
      for (const cat of DESIGN_PATTERNS) {
        const matchCount = cat.patterns.filter(p => p.test(msg.text)).length;
        if (matchCount >= 3) {
          const textSnippet = msg.text.length > 2000 ? msg.text.slice(0, 2000) + '...' : msg.text;
          designFindings[cat.category].push({
            conversationTitle: convo.title,
            date: indexEntry?.date || '',
            role: 'assistant',
            text: textSnippet,
            matchStrength: matchCount
          });
        }
      }
    }
  }
}

// ---- Step 6: Write design decisions markdown ----
let md = `# GROWTH Design Decisions Extracted from ChatGPT Conversations\n\n`;
md += `**Generated:** ${new Date().toISOString()}\n`;
md += `**Source:** Top 20 most relevant ChatGPT conversations (by GROWTH keyword score)\n`;
md += `**Conversations analyzed:** ${fullConversations.size}\n\n`;

md += `## Conversations Analyzed\n\n`;
for (const c of top20) {
  const found = fullConversations.has(c.id) ? 'YES' : 'NOT FOUND';
  md += `- **${c.title}** (${c.date}) — Score: ${c.score} — Extracted: ${found}\n`;
}
md += '\n---\n\n';

for (const cat of DESIGN_PATTERNS) {
  const findings = designFindings[cat.category];
  if (findings.length === 0) continue;

  md += `## ${cat.category}\n\n`;

  // Sort by match strength descending, then by date
  findings.sort((a, b) => b.matchStrength - a.matchStrength);

  // Deduplicate and limit
  const seen = new Set();
  let count = 0;
  for (const f of findings) {
    const key = f.text.slice(0, 100);
    if (seen.has(key)) continue;
    seen.add(key);
    if (count >= 15) break; // Max 15 per category
    count++;

    md += `### From "${f.conversationTitle}" (${f.date}) [${f.role}]\n\n`;
    // Format as blockquote
    md += f.text.split('\n').map(line => `> ${line}`).join('\n') + '\n\n';
  }
}

fs.writeFileSync(
  path.join(indexDir, 'chatgpt-design-decisions.md'),
  md
);
console.log('Wrote chatgpt-design-decisions.md');
console.log(`\nDesign findings by category:`);
for (const cat of DESIGN_PATTERNS) {
  const count = designFindings[cat.category].length;
  if (count > 0) console.log(`  ${cat.category}: ${count} passages`);
}
