const fs = require('fs');
const path = require('path');

// Target project IDs from the index
const GROWTH_PROJECT_IDS = [
  '019672a8-3a0b-7683-95c2-4c84114e806f', // GROWTH-Agent
  '0197e733-b82e-7069-bb16-e516f230635c', // Terminal Speaker
  '0197e739-43a4-7527-94db-1c4594e07a3a', // Terminal Listener
  '500efb4c-0e45-4b8a-8f85-ae1a97742a24', // GROWTH (main, 57 docs)
];

// Also check these for GROWTH-related content
const MAYBE_RELATED_IDS = [
  '01980ee3-ad4d-77a7-8ae0-cc1792996d15', // Me (has life_game_system, game_of_us)
  '019c8d22-c512-71b9-a607-4194975f80b2', // AF Agent
];

const ALL_IDS = [...GROWTH_PROJECT_IDS, ...MAYBE_RELATED_IDS];

const projectsPath = 'C:/Users/Mikek/OneDrive/Desktop/AI Data/Claude Full Data/projects.json';
const memoriesPath = 'C:/Users/Mikek/OneDrive/Desktop/AI Data/Claude Full Data/memories.json';
const outputPath = 'C:/Projects/GRO.WTH/ai-data-index/claude-project-docs.md';

console.log('Loading projects.json...');
const projects = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
console.log(`Loaded ${projects.length} projects`);

console.log('Loading memories.json...');
const memories = JSON.parse(fs.readFileSync(memoriesPath, 'utf8'));
console.log(`Loaded ${memories.length} memories`);

// GROWTH-related keywords for filtering memories and maybe-related docs
const GROWTH_KEYWORDS = [
  'GROWTH', 'GRO.WTH', 'TTRPG', 'tabletop', 'RPG', 'pillar', 'trailblazer',
  'watcher', 'godhead', 'KRMA', 'karma', 'soul pillar', 'spirit pillar',
  'body pillar', 'dice', 'character creation', 'campaign', 'backstory',
  'alchemical', 'prima materia', 'Thread', 'Lucidity', 'terminal',
  'Et\'herling', 'multiverse', 'material system'
];

function isGrowthRelated(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  let matches = 0;
  for (const kw of GROWTH_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) matches++;
  }
  return matches >= 2; // at least 2 keyword matches
}

let output = `# Claude Projects — GROWTH Design Documents\n\nExtracted: ${new Date().toISOString()}\n\nThis file contains the FULL text of every project document from Claude Projects that relates to GROWTH game design, mechanics, or app architecture.\n\n---\n\n`;

let docCount = 0;
let skippedBinary = 0;

for (const project of projects) {
  const isTarget = ALL_IDS.includes(project.uuid || project.id);
  if (!isTarget) continue;

  const projectName = project.name;
  const isMaybeRelated = MAYBE_RELATED_IDS.includes(project.uuid || project.id);

  console.log(`\nProcessing project: ${projectName} (${project.uuid || project.id})`);

  const docs = project.docs || project.documents || [];
  console.log(`  Found ${docs.length} documents`);

  let projectDocs = [];

  for (const doc of docs) {
    const filename = doc.filename || doc.name || doc.file_name || 'unknown';
    const content = doc.content || doc.text || doc.body || '';

    // Skip binary/PDF content
    if (filename.endsWith('.pdf')) {
      console.log(`  Skipping binary: ${filename}`);
      skippedBinary++;
      projectDocs.push({ filename, content: '[PDF file — binary content not included]', size: 0 });
      continue;
    }

    // For maybe-related projects, filter docs by GROWTH relevance
    if (isMaybeRelated && !isGrowthRelated(content) && !isGrowthRelated(filename)) {
      console.log(`  Skipping non-GROWTH doc: ${filename}`);
      continue;
    }

    projectDocs.push({ filename, content, size: content.length });
  }

  if (projectDocs.length === 0) {
    console.log(`  No relevant docs found, skipping project`);
    continue;
  }

  output += `## Project: ${projectName}\n\n`;
  output += `**ID:** ${project.uuid || project.id}\n`;
  output += `**Description:** ${project.description || 'N/A'}\n`;
  output += `**Created:** ${project.created_at || 'N/A'}\n`;
  output += `**Documents:** ${projectDocs.length}\n\n`;

  for (const doc of projectDocs) {
    output += `### Document: ${doc.filename}\n`;
    output += `**Size:** ${doc.size} characters\n\n`;
    if (doc.content) {
      output += doc.content;
      if (!doc.content.endsWith('\n')) output += '\n';
    } else {
      output += '[Empty document]\n';
    }
    output += '\n---\n\n';
    docCount++;
  }
}

// Extract GROWTH-related memories
output += `## Memories (GROWTH-Related)\n\n`;

let memCount = 0;
for (const mem of memories) {
  const content = mem.content || mem.text || mem.body || '';
  const title = mem.title || mem.name || '';
  const type = mem.type || '';

  if (isGrowthRelated(content) || isGrowthRelated(title)) {
    output += `### Memory ${memCount + 1}\n`;
    if (title) output += `**Title:** ${title}\n`;
    if (type) output += `**Type:** ${type}\n`;
    output += `**Created:** ${mem.created_at || 'N/A'}\n\n`;
    output += content;
    if (!content.endsWith('\n')) output += '\n';
    output += '\n---\n\n';
    memCount++;
  }
}

// Also dump ALL memories since there are only 35KB worth
output += `## All Memories (Complete Dump)\n\n`;
output += `Total memories in file: ${memories.length}\n\n`;

for (let i = 0; i < memories.length; i++) {
  const mem = memories[i];
  const content = mem.content || mem.text || mem.body || '';
  const title = mem.title || mem.name || '';
  output += `### Memory #${i + 1}\n`;
  if (title) output += `**Title:** ${title}\n`;
  if (mem.type) output += `**Type:** ${mem.type}\n`;
  output += `**Created:** ${mem.created_at || 'N/A'}\n\n`;
  output += content;
  if (!content.endsWith('\n')) output += '\n';
  output += '\n---\n\n';
}

fs.writeFileSync(outputPath, output, 'utf8');

const sizeMB = (Buffer.byteLength(output, 'utf8') / 1024 / 1024).toFixed(2);
console.log(`\n=== DONE ===`);
console.log(`Documents extracted: ${docCount}`);
console.log(`Binary files skipped: ${skippedBinary}`);
console.log(`GROWTH-related memories: ${memCount}`);
console.log(`Total memories dumped: ${memories.length}`);
console.log(`Output size: ${sizeMB} MB`);
console.log(`Written to: ${outputPath}`);
