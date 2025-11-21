// Debug script to check admin access issue
// Run: node debug-admin-access.js

const API_URL = 'http://192.168.100.32:5000';

// This will check what user is trying to access admin features
async function debugAdminAccess() {
  console.log('🔍 Debugging Admin Access Issue...\n');

  // First, try to get current user info
  console.log('1. Checking current user (from /api/auth/me):');
  try {
    const response = await fetch(`${API_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.TOKEN || 'your_token_here'}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const userData = await response.json();
      console.log('✅ Current user:', {
        id: userData.id,
        username: userData.username,
        phone: userData.phone,
        role: userData.role
      });
    } else {
      console.log('❌ Failed to get user info:', response.status, response.statusText);
    }
  } catch (error) {
    console.log('❌ Error fetching user info:', error.message);
  }

  console.log('\n2. Checking all users with admin roles:');
  try {
    const response = await fetch(`${API_URL}/api/admin/users`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.TOKEN || 'your_token_here'}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Admin access granted');
      const adminUsers = data.users.filter(u => u.role === 'SUPER_ADMIN' || u.role === 'ADMIN');
      console.log('Super Admins found:', adminUsers.length);
      adminUsers.forEach(user => {
        console.log(`  - ${user.username} (${user.id}): ${user.role}`);
      });
    } else {
      const errorData = await response.json();
      console.log('❌ Admin access denied:', errorData.error);
      console.log('Current role in database:', errorData.currentRole);
    }
  } catch (error) {
    console.log('❌ Error checking admin access:', error.message);
  }

  console.log('\n💡 Solutions:');
  console.log('1. Log out and log back in to refresh your JWT token');
  console.log('2. Make sure you\'re logged in as the correct user');
  console.log('3. Check that your database user has SUPER_ADMIN role');
  console.log('4. Run the make-superadmin-api.js script if needed');
}

debugAdminAccess();
