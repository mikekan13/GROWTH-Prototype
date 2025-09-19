// Test email sending via API endpoint
async function testEmailViaAPI() {
  console.log('🧪 Testing email sending via direct email service...');

  // First, let's just test that the email service can create the message content
  const testMessage = {
    to: 'KyleenKantack@gmail.com',
    subject: '🎲 You\'re invited to join Mike (Test GM)\'s GROWTH RPG campaign!',
    htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
    .content { padding: 20px; background: #f8f9fa; border-radius: 8px; margin: 20px 0; }
    .invite-button { display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎲 GROWTH RPG Invitation</h1>
  </div>
  <div class="content">
    <h2>You're Invited!</h2>
    <p><strong>Mike (Test GM)</strong> has invited you to join their GROWTH RPG campaign <strong>"Test Campaign"</strong>!</p>
    <div style="text-align: center;">
      <a href="http://localhost:3000/invite?token=test-invite-token-123" class="invite-button">Accept Invitation</a>
    </div>
  </div>
</body>
</html>`,
    textContent: `Hi there!

Mike (Test GM) has invited you to join their GROWTH RPG campaign "Test Campaign"!

To accept this invitation:
1. Click the link below
2. Sign in with your Google account
3. You'll automatically join Mike (Test GM)'s campaign

Invitation Link: http://localhost:3000/invite?token=test-invite-token-123

Welcome to the GROWTH universe!`
  };

  console.log('📧 Test email message created:', {
    to: testMessage.to,
    subject: testMessage.subject,
    textLength: testMessage.textContent.length,
    htmlLength: testMessage.htmlContent.length
  });

  console.log('🔍 Check the app at http://localhost:3000 and sign in as Mikekan13@gmail.com to test the invitation system');
}

testEmailViaAPI();