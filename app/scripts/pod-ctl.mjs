#!/usr/bin/env node
/**
 * pod-ctl.mjs — CLI wrapper for the GROWTH pod warm-keeper API.
 *
 * Usage (from the Character Creator app root, with `npm run dev` alive):
 *   node scripts/pod-ctl.mjs status       → dump pod + keepalive status
 *   node scripts/pod-ctl.mjs wake         → resume + wait for ComfyUI
 *   node scripts/pod-ctl.mjs hibernate    → force idle hibernate now
 *
 * Hits http://localhost:3001/api/portraits/pod (adjust BASE via env).
 * Requires a logged-in cookie; read GROWTH_SESSION_COOKIE from env or
 * ./.session.cookie so you don't have to re-auth each call.
 */

import fs from 'node:fs';

const BASE = process.env.GROWTH_BASE_URL || 'http://localhost:3001';
let cookie = process.env.GROWTH_SESSION_COOKIE || '';
if (!cookie) {
  try { cookie = fs.readFileSync('./.session.cookie', 'utf-8').trim(); } catch { /* none */ }
}

const action = (process.argv[2] || 'status').toLowerCase();

const headers = { 'content-type': 'application/json' };
if (cookie) headers.cookie = cookie;

async function main() {
  if (action === 'status') {
    const r = await fetch(`${BASE}/api/portraits/pod`, { headers });
    console.log(r.status, await r.text());
    return;
  }
  if (action === 'wake') {
    const r = await fetch(`${BASE}/api/portraits/pod`, {
      method: 'POST', headers, body: JSON.stringify({ action: 'wake' }),
    });
    console.log(r.status, await r.text());
    return;
  }
  if (action === 'hibernate') {
    const r = await fetch(`${BASE}/api/portraits/pod`, { method: 'DELETE', headers });
    console.log(r.status, await r.text());
    return;
  }
  console.error(`unknown action: ${action} — try status | wake | hibernate`);
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(2); });
