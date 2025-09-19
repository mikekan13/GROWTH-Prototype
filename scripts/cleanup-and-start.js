const { spawn } = require('child_process');
const cleanup = require('./cleanup-port');

async function cleanupAndStart() {
  console.log('🚀 GROWTH Development Server Setup');
  console.log('================================');
  
  try {
    // First cleanup port 3000
    await cleanup();
    
    console.log('🔥 Starting Next.js development server on port 3000...');
    
    // Start the development server
    const child = spawn('pnpm', ['dev'], {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd(),
      env: process.env  // Pass all environment variables including NODE_ENV
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down development server...');
      child.kill('SIGINT');
      process.exit(0);
    });

    child.on('exit', (code) => {
      console.log(`Development server exited with code ${code}`);
      process.exit(code);
    });

  } catch (error) {
    console.error('❌ Failed to start development server:', error);
    process.exit(1);
  }
}

cleanupAndStart();