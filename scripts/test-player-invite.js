// Test the actual player invitation API
const http = require('http');

console.log('🎲 Testing ACTUAL player invitation API...');

const postData = JSON.stringify({
  playerEmail: 'KyleenKantack@gmail.com'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/players/invite',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': 'next-auth.session-token=c11782c5-6f39-4d31-86a5-c10b400241d2',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`📡 Player Invite API Status: ${res.statusCode}`);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('📧 Player Invite API Response:', data);
    try {
      const result = JSON.parse(data);
      if (result.success) {
        console.log('✅ Player invitation successful!');
        console.log('🔗 Invite Token:', result.inviteToken);
        console.log('📧 Email Sent:', result.emailSent ? 'YES' : 'NO (but invitation created)');
        console.log('📝 Message:', result.message);

        if (result.inviteToken) {
          console.log('🌐 Invitation URL: http://localhost:3000/invite?token=' + result.inviteToken);
          console.log('');
          console.log('🎯 MANUAL TEST AVAILABLE:');
          console.log('   1. Open: http://localhost:3000/invite?token=' + result.inviteToken);
          console.log('   2. Sign in with KyleenKantack@gmail.com');
          console.log('   3. Accept the invitation');
        }
      } else {
        console.log('❌ Player invitation failed:', result.error);
      }
    } catch (e) {
      console.log('📄 Raw response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Player invite request failed:', e.message);
});

req.write(postData);
req.end();