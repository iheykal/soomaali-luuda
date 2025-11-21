// Simple script to make user SUPER_ADMIN
// Make sure your backend server is running first!
// Run: node make-superadmin-api.js

const API_URL = 'http://192.168.100.32:5000';

async function makeSuperAdmin() {
  try {
    const response = await fetch(`${API_URL}/api/admin/update-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        usernameOrPhone: '610251014',
        newRole: 'SUPER_ADMIN'
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ SUCCESS!');
      console.log('✅', data.message);
      console.log('✅ User:', data.user);
      console.log('\n💡 Now log out and log back in to see the Super Admin button!');
    } else {
      console.error('❌ Error:', data.error);
      console.log('\n💡 Make sure:');
      console.log('   1. Backend server is running (node backend/server.js)');
      console.log('   2. User "610251014" exists in the database');
    }
  } catch (error) {
    console.error('❌ Connection Error:', error.message);
    console.log('\n💡 Make sure your backend server is running on http://localhost:5000');
    console.log('   Start it with: cd backend && node server.js');
  }
}

makeSuperAdmin();
