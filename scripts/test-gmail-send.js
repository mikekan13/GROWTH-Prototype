// Test the Gmail-powered invitation sending
const http = require('http');

console.log('📧 Testing Gmail-powered player invitation...');

const postData = JSON.stringify({
  playerEmail: 'KyleenKantack@gmail.com'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/gmail/send-invite',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': 'next-auth.session-token=c11782c5-6f39-4d31-86a5-c10b400241d2', // This will be invalid after clearing tokens
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`📡 Gmail Invite API Status: ${res.statusCode}`);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('📧 Gmail Invite API Response:', data);
    try {
      const result = JSON.parse(data);

      if (result.success && result.emailSent) {
        console.log('✅ EMAIL SENT SUCCESSFULLY!');
        console.log('📧 Message ID:', result.messageId);
        console.log('📨 Check KyleenKantack@gmail.com inbox!');
        console.log('🔗 Invite Token:', result.inviteToken);
      } else if (result.needsReauth) {
        console.log('🔐 RE-AUTHENTICATION REQUIRED');
        console.log('🌐 Auth URL:', result.authUrl);
        console.log('📝 Steps:');
        console.log('   1. Go to:', result.authUrl);
        console.log('   2. Grant Gmail permissions');
        console.log('   3. Run this test again');
      } else if (result.inviteToken && !result.emailSent) {
        console.log('⚠️ INVITATION CREATED BUT EMAIL FAILED');
        console.log('🔗 Manual invite URL:', `http://localhost:3000/invite?token=${result.inviteToken}`);
        console.log('❌ Email error:', result.error);
      } else {
        console.log('❌ FAILED:', result.error);
      }
    } catch (e) {
      console.log('📄 Raw response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request failed:', e.message);
  console.log('💡 Make sure you are signed in at http://localhost:3000 first');
});

req.write(postData);
req.end();