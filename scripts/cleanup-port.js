const { execSync } = require('child_process');
const os = require('os');

console.log('🧹 Cleaning up port 3000...');

function killProcessesOnPort3000() {
  try {
    if (os.platform() === 'win32') {
      // Windows: Find and kill processes using port 3000
      try {
        const netstatOutput = execSync('netstat -ano | findstr :3000', { encoding: 'utf8' });
        const lines = netstatOutput.split('\n').filter(line => line.trim());
        
        const pids = new Set();
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 5 && parts[1].includes(':3000')) {
            pids.add(parts[4]);
          }
        });

        pids.forEach(pid => {
          if (pid && pid !== '0') {
            try {
              console.log(`Killing process ${pid}...`);
              execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            } catch (e) {
              // Ignore errors, process might already be dead
            }
          }
        });
      } catch (e) {
        // No processes found on port 3000
      }

      // Also kill any Next.js processes that might be stuck
      try {
        execSync('wmic process where "name=\'node.exe\' and commandline like \'%next%\'" call terminate', { stdio: 'ignore' });
      } catch (e) {
        // Ignore errors
      }
    } else {
      // Unix/Linux/Mac: Kill processes using port 3000
      try {
        execSync('lsof -ti:3000 | xargs kill -9', { stdio: 'ignore' });
      } catch (e) {
        // No processes found on port 3000
      }
    }
  } catch (error) {
    console.log('Some processes might already be stopped.');
  }
}

function waitForPortToBeFree() {
  return new Promise(resolve => {
    setTimeout(resolve, 3000);
  });
}

async function cleanup() {
  killProcessesOnPort3000();
  console.log('⏳ Waiting for processes to terminate...');
  await waitForPortToBeFree();
  killProcessesOnPort3000(); // Double-check
  console.log('✅ Port 3000 is now free!');
}

if (require.main === module) {
  cleanup().catch(console.error);
}

module.exports = cleanup;