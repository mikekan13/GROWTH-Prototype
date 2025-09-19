const { exec, spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting GROWTH Prototype...\n');

// Function to kill processes on port 3000
function cleanupPort() {
  return new Promise((resolve) => {
    console.log('🧹 Cleaning up port 3000...');
    
    // Windows command to kill processes on port 3000
    const killCommand = 'for /f "tokens=5" %a in (\'netstat -aon ^| findstr :3000\') do taskkill /f /pid %a';
    
    exec(killCommand, { shell: true }, (error) => {
      if (error) {
        console.log('   No processes found on port 3000 (this is good!)');
      } else {
        console.log('   ✅ Cleaned up port 3000');
      }
      
      // Also kill any lingering node processes
      exec('taskkill /f /im node.exe', { shell: true }, () => {
        console.log('   ✅ Cleaned up Node processes');
        setTimeout(resolve, 2000); // Wait 2 seconds for cleanup
      });
    });
  });
}

// Function to start the development server
function startDevServer() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting development server...');
    
    const serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: path.dirname(__dirname),
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true
    });

    let serverReady = false;

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(output);
      
      // Look for Next.js ready indicators
      if (output.includes('Ready') || output.includes('localhost:3000')) {
        if (!serverReady) {
          serverReady = true;
          resolve(serverProcess);
        }
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(data.toString());
    });

    serverProcess.on('error', (error) => {
      reject(error);
    });

    // Timeout fallback - assume server is ready after 15 seconds
    setTimeout(() => {
      if (!serverReady) {
        console.log('⏰ Server startup timeout - proceeding anyway...');
        resolve(serverProcess);
      }
    }, 15000);
  });
}

// Function to open browser
function openBrowser() {
  console.log('🌐 Opening browser to localhost:3000...');
  
  // Windows command to open browser
  exec('start http://localhost:3000', (error) => {
    if (error) {
      console.error('❌ Failed to open browser automatically');
      console.log('   Please manually open: http://localhost:3000');
    } else {
      console.log('   ✅ Browser opened successfully');
    }
  });
}

// Main execution
async function main() {
  try {
    await cleanupPort();
    console.log('');
    
    const serverProcess = await startDevServer();
    console.log('');
    
    // Wait a bit more before opening browser to ensure server is fully ready
    setTimeout(() => {
      openBrowser();
      console.log('\n✨ GROWTH Prototype is ready!');
      console.log('   🖥️  Server: http://localhost:3000');
      console.log('   🛑 To stop: Ctrl+C');
    }, 3000);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down...');
      serverProcess.kill('SIGTERM');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start application:', error.message);
    process.exit(1);
  }
}

main();