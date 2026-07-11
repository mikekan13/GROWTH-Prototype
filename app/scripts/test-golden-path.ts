/**
 * T32 acceptance — the M4 golden path, live.
 *
 *   goal closes → dispatcher (ENABLED — real agents) → Et'herling routes
 *   → Kai authors + prices the Nectar → structured proposal reaches the
 *   GM channel → GM confirms → the Nectar LANDS: trait on the sheet with
 *   a working mechanical hook, KRMA attributed on the ledger, every hop
 *   in GodHeadActionLog.
 *
 * Also proves the decline path: taxed conversion into max Frequency
 * (INV-07's escape valve, 10% decline tax).
 *
 * Live Claude calls (Et'herling: haiku; Kai: sonnet). Cleans up after.
 * Run: npx tsx scripts/test-golden-path.ts
 */
import './_server-only-shim';
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });
process.env.GODHEAD_DISPATCHER = 'enabled'; // BEFORE dispatcher import

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const { prisma } = await import('../src/lib/db');
  const { createGoal, completeGoal } = await import('../src/services/goal');
  const { executeTransaction } = await import('../src/services/krma/ledger');
  const { resolveNectarBestowal, parseBestowalProposal } = await import('../src/services/nectar-bestowal');
  const { gatherTraitModifiers } = await import('../src/services/trait-modifiers');
  const { createDefaultCharacter } = await import('../src/lib/defaults');

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const campaign = await prisma.campaign.findFirst({ where: { name: 'The Fraying' } });
  const kai = await prisma.godHead.findUnique({ where: { name: 'Kai' } });
  const terminal = await prisma.wallet.findFirst({ where: { walletType: 'RESERVE', label: 'Terminal' } });
  if (!admin || !campaign || !kai?.walletId || !terminal) {
    console.error('Missing prerequisites — run npm run seed:all.');
    process.exit(1);
  }

  // Stage working capital for Kai (godheads start unfunded by design — in
  // production the Forge chain fees fund them). Returned in cleanup.
  const KAI_FLOAT = BigInt(5_000);
  await executeTransaction({
    fromWalletId: terminal.id, toWalletId: kai.walletId, amount: KAI_FLOAT,
    state: 'FLUID', reason: 'CORRECTION', description: 'T32 e2e — stage Kai working capital',
    metadata: { test: 'golden-path' }, actorId: 'SYSTEM', actorType: 'SYSTEM',
    idempotencyKey: `t32-stage-${Date.now()}`,
  });

  // Memory hygiene: Et'herling's working memory spans runs — she correctly
  // flags repeat characters with instantly-completed goals as reward
  // farming (run 4 held the reward for exactly that). The probe uses a
  // fresh hero each run and scrubs its own residue from godhead memory.
  const TEST_MARKERS = ['Wren', 'Shatterfen', 'Waypoint', 'T32', 'Drowned Bell'];
  await prisma.godHeadMemory.deleteMany({
    where: { OR: TEST_MARKERS.map(m => ({ value: { contains: m } })) },
  });

  // A crystallized-enough hero with a closable goal — unique per run.
  const heroName = `Maren Halloway ${Date.now().toString().slice(-4)}`;
  const hero = await prisma.character.create({
    data: {
      name: heroName,
      entityType: 'NPC',
      status: 'ACTIVE',
      userId: admin.id,
      campaignId: campaign.id,
      data: JSON.stringify(createDefaultCharacter(heroName)),
    },
  });

  let messageId: string | null = null;
  try {
    // Unique deed per run — Et'herling's working memory spans runs and she
    // (correctly!) holds duplicate completions for review instead of
    // double-rewarding. Run 2 proved that the hard way.
    const nonce = Date.now().toString().slice(-5);
    const goal = await createGoal(admin.id, admin.role, {
      characterId: hero.id,
      campaignId: campaign.id,
      description: `Recover the sunken bell of Waypoint ${nonce} from the flooded chapel and ring it to guide the refugees home`,
      priority: 4,
    });

    // ── THE TRIGGER: goal closes; agents take it from here ─────────────
    const before = new Date();
    await completeGoal(goal.id);
    console.log('goal completed — waiting for Et\'herling → Kai (live agents, up to 3 min)...');

    // Poll for the structured proposal from Kai.
    let proposal: ReturnType<typeof parseBestowalProposal> = null;
    for (let i = 0; i < 36 && !proposal; i++) {
      await sleep(5_000);
      const messages = await prisma.godHeadMessage.findMany({
        where: { campaignId: campaign.id, direction: 'GODHEAD_TO_GM', createdAt: { gt: before } },
        orderBy: { createdAt: 'desc' },
      });
      for (const m of messages) {
        const p = parseBestowalProposal(m.content);
        if (p && p.characterId === hero.id) { proposal = p; messageId = m.id; break; }
      }
    }
    check('agents: Kai\'s structured proposal reached the GM channel', !!proposal,
      proposal ? `"${proposal.nectar.name}" kv=${proposal.kv} mods=${JSON.stringify(proposal.nectar.rollModifiers ?? [])}` : 'timed out');
    if (!proposal || !messageId) throw new Error('no proposal — aborting assertions');

    // Et'herling's route_to_godhead log row lands only after her tool call
    // RETURNS — i.e. after Kai's whole inline sub-run. Give her loop time
    // to finish before asserting the logs (run 3 raced this).
    await sleep(25_000);

    // ── ACTION LOG: every hop recorded ─────────────────────────────────
    const ethLogs = await prisma.godHeadActionLog.findMany({
      where: { createdAt: { gt: before }, toolName: 'route_to_godhead' },
    });
    check('actionlog: Et\'herling\'s route_to_godhead hop logged', ethLogs.length >= 1, `${ethLogs.length} rows`);
    const kaiLogs = await prisma.godHeadActionLog.findMany({
      where: { createdAt: { gt: before }, toolName: 'propose_nectar_bestowal', godHeadId: kai.id },
    });
    check('actionlog: Kai\'s propose_nectar_bestowal logged', kaiLogs.length >= 1, `${kaiLogs.length} rows`);

    // ── GM CONFIRMS: the Nectar lands ──────────────────────────────────
    const landed = await resolveNectarBestowal(messageId, 'accept', admin.id, admin.role);
    check('bestow: accepted', landed.action === 'accept' && landed.amount === proposal.kv, `${landed.amount} KRMA`);

    const after = await prisma.character.findUnique({ where: { id: hero.id } });
    const heroData = JSON.parse(after!.data) as { traits?: Array<{ name: string; rollModifiers?: Array<{ flat: number }> }>; attributes?: { frequency: { level: number } } };
    const trait = heroData.traits?.find(t => t.name === proposal!.nectar.name);
    check('sheet: Nectar trait landed', !!trait);
    check('sheet: mechanical hook present (rollModifiers)', !!trait?.rollModifiers?.length,
      JSON.stringify(trait?.rollModifiers ?? []));

    // T24 proof: the hook fires in the SAME engine every roll consumes.
    if (trait?.rollModifiers?.length) {
      const mod = trait.rollModifiers[0] as { flat: number; skillNamePattern?: string; governorAttribute?: string };
      // Build a roll context the modifier SHOULD fire on: first pipe
      // alternative as the skill name, plus the governor if it set one.
      const ctx = {
        ...(mod.skillNamePattern ? { skillName: mod.skillNamePattern.split('|')[0].trim() } : {}),
        ...(mod.governorAttribute ? { governorAttribute: mod.governorAttribute } : {}),
      };
      const gathered = gatherTraitModifiers(heroData as never, ctx);
      check('dice: modifier fires on the next relevant roll', gathered.sources.some(s => s.traitName === proposal!.nectar.name),
        `total ${gathered.totalFlat} from [${gathered.sources.map(s => s.traitName).join(', ')}]`);
    }

    const nectarTx = await prisma.krmaTransaction.findFirst({
      where: { reason: 'GROVINE_NECTAR', metadata: { contains: messageId } },
    });
    check('ledger: GROVINE_NECTAR attributed (Kai wallet → character)', !!nectarTx,
      nectarTx ? `${nectarTx.amount} KRMA` : 'none');

    check('guard: double-resolve rejected', await resolveNectarBestowal(messageId, 'accept', admin.id, admin.role)
      .then(() => false).catch(() => true));

    // ── DECLINE PATH: taxed conversion into max Frequency ──────────────
    const { proposeNectarBestowal } = await import('../src/services/nectar-bestowal');
    const freqBefore = (JSON.parse((await prisma.character.findUnique({ where: { id: hero.id } }))!.data) as { attributes: { frequency: { level: number } } }).attributes.frequency.level;
    const { messageId: declineMsg } = await proposeNectarBestowal(kai.id, campaign.id, {
      characterId: hero.id,
      nectar: { name: 'Unwanted Gift', pillar: 'spirit', mechanicalEffect: 'The bearer glows faintly in moonlight.' },
      kv: 100,
      reason: 'T32 decline-path probe',
    });
    const declined = await resolveNectarBestowal(declineMsg, 'decline', admin.id, admin.role);
    const freqAfter = (JSON.parse((await prisma.character.findUnique({ where: { id: hero.id } }))!.data) as { attributes: { frequency: { level: number } } }).attributes.frequency.level;
    check('decline: 10% tax applied (100 → 90)', declined.amount === 90, String(declined.amount));
    check('decline: raw KRMA into MAX Frequency (+90)', freqAfter - freqBefore === 90, `${freqBefore} → ${freqAfter}`);
  } finally {
    // ── Cleanup: reverse all KRMA, delete test rows ────────────────────
    const heroWallet = await prisma.wallet.findFirst({ where: { characterId: hero.id } });
    if (heroWallet && heroWallet.balance > BigInt(0)) {
      await executeTransaction({
        fromWalletId: heroWallet.id, toWalletId: kai.walletId!, amount: heroWallet.balance,
        state: 'FLUID', reason: 'CORRECTION', description: 'T32 e2e — reverse bestowals',
        metadata: { test: 'golden-path' }, actorId: 'SYSTEM', actorType: 'SYSTEM',
        idempotencyKey: `t32-reverse-${Date.now()}`,
      }).catch(e => console.error('reverse failed:', e));
    }
    const kaiWallet = await prisma.wallet.findUnique({ where: { id: kai.walletId! } });
    if (kaiWallet && kaiWallet.balance > BigInt(0)) {
      await executeTransaction({
        fromWalletId: kaiWallet.id, toWalletId: terminal.id, amount: kaiWallet.balance,
        state: 'FLUID', reason: 'CORRECTION', description: 'T32 e2e — return Kai float',
        metadata: { test: 'golden-path' }, actorId: 'SYSTEM', actorType: 'SYSTEM',
        idempotencyKey: `t32-return-${Date.now()}`,
      }).catch(e => console.error('return failed:', e));
    }
    await prisma.goal.deleteMany({ where: { characterId: hero.id } });
    await prisma.wallet.deleteMany({ where: { characterId: hero.id, balance: BigInt(0) } });
    await prisma.character.delete({ where: { id: hero.id } }).catch(() => null);
    // Scrub the probe from godhead memory so real campaigns stay clean.
    await prisma.godHeadMemory.deleteMany({
      where: { OR: [...TEST_MARKERS, heroName].map(m => ({ value: { contains: m } })) },
    }).catch(() => null);
  }

  console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
