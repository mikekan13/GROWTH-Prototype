import { viewAsViewer, queryPerceivedFeed } from '../app/src/services/perceived-feed';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const user = { id: 'cmrep1oh300002g48ue1bn5rg', role: 'ADMIN' };
(async () => {
  for (const [name, id] of [['Violet', 'cms60ndtn0000kw48ioq10i68'], ['Kristopher', 'cmvcbw49u0001h448qanzbhs3']] as const) {
    const viewer = await viewAsViewer(CAMP, user, id);
    if (viewer.mode !== 'perceived') { console.log(name, 'not perceived mode', viewer); continue; }
    const page = await queryPerceivedFeed({ campaignId: CAMP, viewer, limit: 20 });
    console.log(`\n===== ${name} sees (${page.events.length} rows) =====`);
    for (const e of [...page.events].reverse()) {
      const p = e.payload as Record<string, unknown>;
      console.log(`- [${e.type}] ${e.characterName ?? ''} :: ${JSON.stringify({ description: p.description, message: p.message, narration: p.narration, speech: p.speech, actions: p.actions, thoughts: p.thoughts, perceived: p.perceived ? '(yes)' : undefined }).slice(0, 700)}`);
    }
  }
  process.exit(0);
})();
