// Script to check current user status
// Run: node check-user-status.js

const API_URL = 'http://192.168.100.32:5000';

// You'll need to get this from your browser's localStorage after logging in
const TOKEN = 'your_jwt_token_here'; // Replace with actual token

async function checkUserStatus() {
  try {
    const response = await fetch(`${API_URL}/api/admin/check-status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    console.log('🔍 User Status Check:');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (data.found) {
      console.log('✅ User found in database');
      console.log('Database role:', data.database.role);
      console.log('Token role:', data.token.role);
      console.log('Match:', data.database.role === data.token.role);
    } else {
      console.log('❌ User not found in database');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

console.log('💡 To use this script:');
console.log('1. Log in to the app');
console.log('2. Open browser dev tools (F12)');
console.log('3. Go to Application/Storage > Local Storage');
console.log('4. Copy the "ludo_token" value');
console.log('5. Replace TOKEN in this script');
console.log('6. Run: node check-user-status.js');
console.log('');
console.log('Or just run the diagnostic manually by calling the API endpoint with your token.');

checkUserStatus();
