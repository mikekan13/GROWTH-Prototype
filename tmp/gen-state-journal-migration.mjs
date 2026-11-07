// Generates app/prisma/migrations/20261107140000_state_journal/migration.sql — SQLite triggers that journal every change to the
// world tables (Michael 2026-11-07: "GROWTH is just a giant log of history"). One line per statement (tmp/apply-migration.ts splits on ";\n").
import { mkdirSync, writeFileSync } from 'node:fs';

const tables = {
  Character: { cols: ['name', 'entityType', 'userId', 'data', 'portrait', 'status', 'genesisTier'], campaign: 'campaignId' },
  CampaignItem: { cols: ['name', 'type', 'data', 'holderId', 'locationId', 'status', 'story', 'history'], campaign: 'campaignId' },
  Location: { cols: ['name', 'type', 'data', 'status'], campaign: 'campaignId' },
  WorldFact: { cols: ['subjectKey', 'fact', 'establishedAtCycle', 'supersededById'], campaign: 'campaignId' },
  EntityRelationship: { cols: ['sourceId', 'sourceType', 'targetId', 'targetType', 'relationshipType', 'strength', 'bidirectional', 'data'], campaign: 'campaignId' },
  Currency: { cols: ['name', 'code', 'symbol', 'krmaPerUnit', 'scope', 'note', 'denominations', 'status'], campaign: 'campaignId' },
};

const q = (s) => `"${s}"`;
const lines = [
  '-- THE STATE JOURNAL (Michael 2026-11-07: "GROWTH is just a giant log of history"; nothing is overwritten, the current state is a view).',
  '-- Every insert, change and delete of a world row is journaled by SQLite itself, inside the same transaction, whatever code path made it.',
  '-- `row` = the row as it was BEFORE an update/delete, or as inserted. `cycle` = the campaign clock at that moment.',
  'CREATE TABLE "StateJournal" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "campaignId" TEXT, "cycle" REAL, "tableName" TEXT NOT NULL, "rowId" TEXT NOT NULL, "op" TEXT NOT NULL, "row" TEXT NOT NULL, "changed" TEXT)',
  'CREATE INDEX "StateJournal_tableName_rowId_idx" ON "StateJournal"("tableName", "rowId")',
  'CREATE INDEX "StateJournal_campaignId_cycle_idx" ON "StateJournal"("campaignId", "cycle")',
];
for (const [t, { cols, campaign }] of Object.entries(tables)) {
  const obj = (ref) => `json_object('id', ${ref}.id, ${cols.map((c) => `'${c}', ${ref}.${q(c)}`).join(', ')})`;
  const cyc = (ref) => `(SELECT "currentCycle" FROM "Campaign" WHERE "id" = ${ref}.${q(campaign)})`;
  const changedList = `json_array(${cols.map((c) => `CASE WHEN OLD.${q(c)} IS NOT NEW.${q(c)} THEN '${c}' END`).join(', ')})`;
  const when = cols.map((c) => `OLD.${q(c)} IS NOT NEW.${q(c)}`).join(' OR ');
  lines.push(`CREATE TRIGGER "journal_${t}_update" AFTER UPDATE ON ${q(t)} WHEN ${when} BEGIN INSERT INTO "StateJournal" ("campaignId", "cycle", "tableName", "rowId", "op", "row", "changed") VALUES (OLD.${q(campaign)}, ${cyc('OLD')}, '${t}', OLD.id, 'update', ${obj('OLD')}, ${changedList}); END`);
  lines.push(`CREATE TRIGGER "journal_${t}_delete" AFTER DELETE ON ${q(t)} BEGIN INSERT INTO "StateJournal" ("campaignId", "cycle", "tableName", "rowId", "op", "row") VALUES (OLD.${q(campaign)}, ${cyc('OLD')}, '${t}', OLD.id, 'delete', ${obj('OLD')}); END`);
  lines.push(`CREATE TRIGGER "journal_${t}_insert" AFTER INSERT ON ${q(t)} BEGIN INSERT INTO "StateJournal" ("campaignId", "cycle", "tableName", "rowId", "op", "row") VALUES (NEW.${q(campaign)}, ${cyc('NEW')}, '${t}', NEW.id, 'insert', ${obj('NEW')}); END`);
}
const dir = 'app/prisma/migrations/20261107140000_state_journal';
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/migration.sql`, lines.map((l) => (l.startsWith('--') ? l : `${l};`)).join('\n') + '\n');
console.log(`${lines.length} lines`);
