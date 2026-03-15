import { readFileSync, writeFileSync } from 'fs';

// Step 1: Read index, get top 30 by score
console.log('Reading index...');
const index = JSON.parse(readFileSync('C:\\Projects\\GRO.WTH\\ai-data-index\\claude-conversations.json', 'utf8'));
const sorted = index.conversations.sort((a, b) => b.relevance_score - a.relevance_score);
const top30 = sorted.slice(0, 30);
console.log(`Top 30 conversations (scores ${top30[0].relevance_score} to ${top30[29].relevance_score}):`);
top30.forEach((c, i) => console.log(`  ${i+1}. [${c.relevance_score}] ${c.name} (${c.id.slice(0,8)})`));

const targetIds = new Set(top30.map(c => c.id));
const convMeta = Object.fromEntries(top30.map(c => [c.id, { name: c.name, date: c.created_at.slice(0, 10) }]));

// Step 2: Load full conversations file
console.log('\nLoading full conversations file (54MB)...');
const raw = readFileSync('C:\\Users\\Mikek\\OneDrive\\Desktop\\AI Data\\Claude Full Data\\conversations.json', 'utf8');
const allConvs = JSON.parse(raw);
console.log(`Loaded ${allConvs.length} conversations`);

// Step 3: Extract user messages from target conversations
const categories = {
  'Combat': [],
  'Magic': [],
  'KRMA': [],
  'Character Creation': [],
  'UI/UX': [],
  'Architecture': [],
  'Seeds/Species': [],
  'GROvines': [],
  'Canvas': [],
  'Terminal': [],
  'Backstory': [],
  'Dice': [],
  'Pillars & Attributes': [],
  'Items & Crafting': [],
  'Campaign System': [],
  'Roles & Permissions': [],
  'Other': []
};

// Category detection patterns
const catPatterns = {
  'Combat': /\b(combat|fight|attack|damage|hit|wound|injur|death\s*save|battle|weapon|armor|defence|defend|initiative|turn\s*order|action\s*economy)\b/i,
  'Magic': /\b(magic|spell|cast|arcane|mystical|enchant|ritual|invocation|sigil|glyph|alchemy|alchemical|prima\s*materia|transmut|occult|esoteric)\b/i,
  'KRMA': /\b(krma|karma|economy|currency|cost|spend|earn|pool|reserve|genesis|ledger|wallet|inflation|balance\s*reserve|mercy|severity)\b/i,
  'Character Creation': /\b(character\s*creat|char\s*gen|build\s*a\s*character|new\s*character|stat\s*allocat|point\s*buy|level\s*up|advancement|xp|experience\s*point)\b/i,
  'UI/UX': /\b(ui|ux|interface|layout|design|color|font|style|css|visual|theme|dark\s*mode|light\s*mode|responsive|mobile|screen|page|button|modal|panel|sidebar|header|footer|nav)\b/i,
  'Architecture': /\b(architect|database|schema|prisma|api\s*route|service\s*layer|next\.?js|react|component|hook|state\s*manage|auth|session|middleware|deploy|server|client)\b/i,
  'Seeds/Species': /\b(seed|species|race|lineage|heritage|human|elf|dwarf|orc|fae|divine|celestial|infernal|demon|angel|nephilim|golem|construct|undead|revenant)\b/i,
  'GROvines': /\b(grovine|gro\.?vine|community|social|network|share|publish|catalog|repository|global\s*server|creative\s*commons)\b/i,
  'Canvas': /\b(canvas|svn|viewbox|zoom|pan|drag|drop|spatial|float|dock|tether|relation|web|node|edge|connect|link)\b/i,
  'Terminal': /\b(terminal|admin|console|command|cli|slash\s*command|system\s*message|godhead\s*view|oversight)\b/i,
  'Backstory': /\b(backstory|back\s*story|origin|history|narrative|prompt|question|biography|lore|worldbuild)\b/i,
  'Dice': /\b(dice|die|d4|d6|d8|d10|d12|d20|d100|roll|check|skill\s*check|saving\s*throw|advantage|disadvantage|critical|fumble|explod)\b/i,
  'Pillars & Attributes': /\b(pillar|attribute|body|soul|spirit|sulfur|mercury|salt|flow|frequency|focus|willpower|wisdom|wit|strength|endurance|vigor|lucidity|thread)\b/i,
  'Items & Crafting': /\b(item|craft|forge|material|weapon|armor|equipment|inventory|slot|enchant|modify|upgrade|recipe|blueprint)\b/i,
  'Campaign System': /\b(campaign|session|party|group|invite|join|seat|subscription|watcher\s*console|gm\s*tool|encounter)\b/i,
  'Roles & Permissions': /\b(role|permission|admin|watcher|trailblazer|godhead|access|auth|registr|invite\s*code|qr\s*code)\b/i,
};

// Patterns that indicate design decisions
const decisionPatterns = [
  /\b(no[,.]?\s*(it\s*)?should\s*be|that'?s\s*wrong|actually[,.]|correct(ion)?[,:]|not\s*like\s*that|change\s*(it|this)\s*to|instead[,.]?\s*(it\s*)?should|the\s*rule\s*is|it\s*works\s*like|the\s*way\s*it\s*works|i\s*want|we\s*need|must\s*be|has\s*to\s*be|always\s*should|never\s*should|don'?t\s*(ever\s*)?make|important[:\-]|key\s*thing|the\s*idea\s*is|the\s*concept\s*is|the\s*vision\s*is|here'?s\s*how|think\s*of\s*it\s*as|treat\s*it\s*as)\b/i,
  /\b(the\s*system|the\s*mechanic|the\s*game|growth)\s+(should|will|must|needs?\s*to|has\s*to|is\s*supposed\s*to)\b/i,
  /\b(scrap|kill|remove|delete|get\s*rid\s*of|drop|abandon|forget\s*about)\s+(that|this|the|it)\b/i,
  /\b(yes[,.]|exactly[,.]|correct[,.]|right[,.]|bingo[,.]|perfect[,.])\s/i,
];

function categorize(text) {
  const matched = [];
  for (const [cat, pat] of Object.entries(catPatterns)) {
    if (pat.test(text)) matched.push(cat);
  }
  return matched.length > 0 ? matched : ['Other'];
}

function isDesignRelevant(text) {
  if (text.length < 30) return false;
  if (text.length > 8000) return false; // skip huge code dumps
  // Check for code-heavy messages (likely pasting code, not design decisions)
  const codeLines = (text.match(/^[\s]*[{}\[\]();=<>\/\\|&!~`]/gm) || []).length;
  const totalLines = text.split('\n').length;
  if (totalLines > 5 && codeLines / totalLines > 0.5) return false;

  for (const pat of decisionPatterns) {
    if (pat.test(text)) return true;
  }
  // Also include messages with strong game design keywords even without decision markers
  if (/\b(rule|mechanic|system|design|concept|vision|philosophy|principle)\b/i.test(text) && text.length > 50) return true;
  return false;
}

function extractMessages(conv) {
  const messages = [];
  if (!conv.chat_messages) return messages;

  for (const msg of conv.chat_messages) {
    if (msg.sender !== 'human') continue;
    // Extract text content
    let text = '';
    if (typeof msg.text === 'string') {
      text = msg.text;
    } else if (Array.isArray(msg.content)) {
      text = msg.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
    } else if (typeof msg.content === 'string') {
      text = msg.content;
    }
    if (text.trim()) messages.push(text.trim());
  }
  return messages;
}

let totalFindings = 0;
let processedConvs = 0;

for (const conv of allConvs) {
  if (!targetIds.has(conv.uuid)) continue;
  processedConvs++;
  const meta = convMeta[conv.uuid];
  const userMessages = extractMessages(conv);
  console.log(`Processing: ${meta.name} (${userMessages.length} user messages)`);

  for (const msg of userMessages) {
    if (!isDesignRelevant(msg)) continue;

    const cats = categorize(msg);
    // Truncate very long messages to the relevant portion
    let excerpt = msg;
    if (excerpt.length > 1500) {
      excerpt = excerpt.slice(0, 1500) + '... [truncated]';
    }

    for (const cat of cats) {
      categories[cat].push({
        title: meta.name,
        date: meta.date,
        text: excerpt
      });
      totalFindings++;
    }
  }
}

console.log(`\nProcessed ${processedConvs} conversations, found ${totalFindings} design-relevant excerpts`);

// Step 4: Write the analysis
let md = `# GRO.WTH Design Decisions — Extracted from Claude Conversations\n\n`;
md += `**Generated:** ${new Date().toISOString().slice(0, 10)}\n`;
md += `**Source:** Top 30 highest-relevance conversations from Claude export (${processedConvs} processed)\n`;
md += `**Total findings:** ${totalFindings} design-relevant excerpts across ${Object.keys(categories).length} categories\n\n`;
md += `---\n\n`;

// Table of contents
md += `## Table of Contents\n\n`;
for (const [cat, items] of Object.entries(categories)) {
  if (items.length > 0) {
    md += `- [${cat}](#${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}) (${items.length})\n`;
  }
}
md += `\n---\n\n`;

for (const [cat, items] of Object.entries(categories)) {
  if (items.length === 0) continue;

  md += `## ${cat}\n\n`;
  md += `*${items.length} findings*\n\n`;

  // Sort by date
  items.sort((a, b) => a.date.localeCompare(b.date));

  for (const item of items) {
    // Clean up the text for markdown
    const cleanText = item.text
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map(line => '> ' + line)
      .join('\n');

    md += `### ${item.title} (${item.date})\n\n`;
    md += `${cleanText}\n\n`;
    md += `---\n\n`;
  }
}

writeFileSync('C:\\Projects\\GRO.WTH\\ai-data-index\\claude-design-decisions.md', md, 'utf8');
console.log(`\nWrote analysis to claude-design-decisions.md`);
console.log('Category breakdown:');
for (const [cat, items] of Object.entries(categories)) {
  if (items.length > 0) console.log(`  ${cat}: ${items.length}`);
}
