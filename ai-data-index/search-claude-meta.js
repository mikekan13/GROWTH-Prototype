const fs = require('fs');
const path = require('path');

const KEYWORDS = [
  'GROWTH', 'GRO.WTH', 'TTRPG', 'tabletop', 'RPG', 'pillar',
  'trailblazer', 'watcher', 'godhead', 'KRMA', 'karma',
  'soul pillar', 'spirit pillar', 'body pillar', 'dice system',
  'character creation', 'campaign', 'backstory', 'alchemical',
  'prima materia', 'Thread', 'Lucidity'
];

const DATA_DIR = path.join('C:', 'Users', 'Mikek', 'OneDrive', 'Desktop', 'AI Data', 'Claude Full Data');
const OUT_DIR = path.join('C:', 'Projects', 'GRO.WTH', 'ai-data-index');

function findKeywords(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return KEYWORDS.filter(kw => lower.includes(kw.toLowerCase()));
}

function searchProjects() {
  const raw = fs.readFileSync(path.join(DATA_DIR, 'projects.json'), 'utf8');
  const projects = JSON.parse(raw);
  const results = [];

  for (const proj of projects) {
    // Search in name, description, prompt_template, and docs content
    const searchable = [
      proj.name || '',
      proj.description || '',
      proj.prompt_template || '',
      ...(proj.docs || []).map(d => (d.content || '') + ' ' + (d.filename || ''))
    ].join(' ');

    const matched = findKeywords(searchable);
    if (matched.length > 0) {
      results.push({
        id: proj.uuid,
        name: proj.name,
        description: (proj.description || '').slice(0, 500),
        created_at: proj.created_at,
        updated_at: proj.updated_at,
        num_docs: (proj.docs || []).length,
        doc_filenames: (proj.docs || []).map(d => d.filename),
        matched_keywords: matched
      });
    }
  }

  return results;
}

function searchMemories() {
  const raw = fs.readFileSync(path.join(DATA_DIR, 'memories.json'), 'utf8');
  const memories = JSON.parse(raw);
  const results = [];

  for (const mem of memories) {
    // Conversations memory
    if (mem.conversations_memory) {
      const matched = findKeywords(mem.conversations_memory);
      if (matched.length > 0) {
        results.push({
          type: 'conversations_memory',
          text: mem.conversations_memory,
          matched_keywords: matched
        });
      }
    }

    // Project memories
    if (mem.project_memories) {
      for (const [projId, text] of Object.entries(mem.project_memories)) {
        const matched = findKeywords(text);
        if (matched.length > 0) {
          results.push({
            type: 'project_memory',
            project_id: projId,
            text: text,
            matched_keywords: matched
          });
        }
      }
    }
  }

  return results;
}

// Run
console.log('Searching projects.json...');
const projectResults = searchProjects();
console.log(`  Found ${projectResults.length} matching projects`);

console.log('Searching memories.json...');
const memoryResults = searchMemories();
console.log(`  Found ${memoryResults.length} matching memory entries`);

const output = {
  generated: new Date().toISOString(),
  keywords_searched: KEYWORDS,
  projects: {
    total_matches: projectResults.length,
    items: projectResults
  },
  memories: {
    total_matches: memoryResults.length,
    items: memoryResults
  }
};

const outPath = path.join(OUT_DIR, 'claude-projects-memories.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
console.log(`\nResults written to: ${outPath}`);

// Summary
console.log('\n=== PROJECTS SUMMARY ===');
for (const p of projectResults) {
  console.log(`  [${p.id}] "${p.name}" — keywords: ${p.matched_keywords.join(', ')} (${p.num_docs} docs)`);
}

console.log('\n=== MEMORIES SUMMARY ===');
for (const m of memoryResults) {
  const label = m.type === 'project_memory' ? `project_memory [${m.project_id}]` : m.type;
  console.log(`  ${label} — keywords: ${m.matched_keywords.join(', ')}`);
}
