const ids = ['66e6f7be-a7e0-4cc6-bdf7-0adb6066b1b8', 'e2865b96-cc46-4836-ab5d-9306b7effb8b'];
for (const id of ids) {
  const r = await fetch(`http://127.0.0.1:8188/history/${id}`);
  const j = await r.json();
  const entry = j[id];
  if (!entry) { console.log(`${id}: not in history`); continue; }
  console.log('---', id, '---');
  console.log('status:', JSON.stringify(entry.status, null, 2));
  if (entry.status?.messages) {
    for (const m of entry.status.messages) {
      if (m[0] === 'execution_error') {
        console.log('EXEC ERROR:', JSON.stringify(m[1], null, 2).slice(0, 1500));
      }
    }
  }
}
