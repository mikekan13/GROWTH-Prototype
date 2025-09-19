// Force email test by directly calling the API
const http = require('http');

console.log('🧪 Force testing email invitation API...');

// First, let's test our own API endpoint
const postData = JSON.stringify({
  to: 'KyleenKantack@gmail.com'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/test-email',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': 'next-auth.session-token=c11782c5-6f39-4d31-86a5-c10b400241d2', // Use the session token from logs
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`📡 API Status: ${res.statusCode}`);
  console.log(`📡 Headers:`, res.headers);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('📧 API Response:', data);
    try {
      const result = JSON.parse(data);
      if (result.success) {
        console.log('✅ Email API test successful!');
      } else {
        console.log('❌ Email API test failed:', result.error);
      }
    } catch (e) {
      console.log('📄 Raw response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request failed:', e.message);
});

req.write(postData);
req.end();