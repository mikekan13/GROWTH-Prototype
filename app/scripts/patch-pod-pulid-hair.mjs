// Apply the hair-mask patch to the live pod's pulidflux.py (add BiSeNet label 17
// to bg_label) and restart ComfyUI via pod-start-comfy.sh.
// Idempotent: re-running is a no-op if already patched.
import fs from 'node:fs';
import { rp } from './runpod-api.mjs';
import { execSync, spawnSync } from 'node:child_process';

const ID = fs.readFileSync('C:/Projects/GRO.WTH/standalone/.ssh/pod-id.txt', 'utf-8').trim();
const pod = await rp(`/pods/${ID}`);
const ip = pod.publicIp;
const sshPort = pod.portMappings?.['22'];
const KEY = 'C:/Projects/GRO.WTH/standalone/.ssh/runpod_growth';

function ssh(cmd, { timeout = 30000 } = {}) {
  return execSync(
    `ssh -i "${KEY}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${sshPort} root@${ip} ${JSON.stringify(cmd)}`,
    { encoding: 'utf-8', timeout }
  );
}

// Pipe a multi-line remote shell script via stdin — avoids the quoting hell of
// trying to inline python -c or multi-line sed across ssh.
function sshScript(script, { timeout = 60000 } = {}) {
  const r = spawnSync(
    'ssh',
    [
      '-i', KEY,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-p', String(sshPort),
      `root@${ip}`,
      'bash', '-s',
    ],
    { input: script, encoding: 'utf-8', timeout }
  );
  if (r.status !== 0) throw new Error(`ssh failed (${r.status}): ${r.stderr}`);
  return r.stdout;
}

const PF = '/workspace/ComfyUI/custom_nodes/ComfyUI-PuLID-Flux/pulidflux.py';

console.log('=== bg_label BEFORE ===');
console.log(ssh(`grep -n 'bg_label = \\[' ${PF}`));

const patchScript = `
set -e
cp -n ${PF} ${PF}.bak.prehair 2>/dev/null || true
python3 <<'PY'
from pathlib import Path
f = Path('${PF}')
s = f.read_text()
if 'bg_label = [0, 16, 17, 18,' in s:
    print('already patched')
else:
    s2 = s.replace('bg_label = [0, 16, 18,', 'bg_label = [0, 16, 17, 18,', 1)
    if s2 == s:
        print('FAILED — bg_label line not matched; check manually')
    else:
        f.write_text(s2)
        print('patched')
PY
`;
console.log('\n=== applying patch ===');
console.log(sshScript(patchScript));

console.log('=== bg_label AFTER ===');
console.log(ssh(`grep -n 'bg_label = \\[' ${PF}`));

console.log('\n=== restarting ComfyUI ===');
// pod-start-comfy.sh does pkill + nohup relaunch. Run via ssh; short timeout
// is fine — the script detaches and returns immediately.
console.log(sshScript('bash /workspace/pod-start-comfy.sh', { timeout: 45000 }));

// Give ComfyUI ~3s to bind the port
await new Promise(r => setTimeout(r, 3000));
console.log('\n=== ComfyUI process check ===');
console.log(ssh("pgrep -af 'main.py' || echo still down"));
console.log('\ndone. Tail log: ssh <pod> tail -f /workspace/comfy.log');
