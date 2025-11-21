// Fix admin role via API since direct DB access is timing out
// This uses the existing /api/admin/update-role endpoint

const API_URL = 'http://192.168.100.32:5000';

// We need to target the specific USER account that the user is logged in with
// From the database output, it's the one with phone: "auto_691a421554469a7dd48dd71b"

async function fixAdminViaAPI() {
  try {
    console.log('🔧 Fixing admin role via API...');

    // The user is logged in with the account that has phone: "auto_691a421554469a7dd48dd71b"
    // We need to update this specific account to SUPER_ADMIN
    const phoneToUpdate = 'auto_691a421554469a7dd48dd71b';

    console.log(`🎯 Updating user with phone: ${phoneToUpdate} to SUPER_ADMIN role`);

    const response = await fetch(`${API_URL}/api/admin/update-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        usernameOrPhone: phoneToUpdate,
        newRole: 'SUPER_ADMIN'
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ SUCCESS!');
      console.log('Response:', data);

      if (data.user) {
        console.log('📊 Updated User:');
        console.log(`   Username: ${data.user.username}`);
        console.log(`   Role: ${data.user.role}`);
        console.log(`   ID: ${data.user.id}`);
      }

      console.log('\n🎉 FIX COMPLETE!');
      console.log('💡 Now log out and log back in to refresh your JWT token');
      console.log('   You should now have SUPER_ADMIN access to the dashboard');

    } else {
      console.log('❌ API Error:', data.error);

      if (data.error.includes('Cannot read properties of null')) {
        console.log('💡 This might mean the user was not found with that phone number');
        console.log('   Trying alternative: update by the main phone number "610251014"');

        // Try updating by the main phone number
        const response2 = await fetch(`${API_URL}/api/admin/update-role`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            usernameOrPhone: '610251014',
            newRole: 'SUPER_ADMIN'
          })
        });

        const data2 = await response2.json();

        if (response2.ok) {
          console.log('✅ SUCCESS with main phone number!');
          console.log('Response:', data2);
        } else {
          console.log('❌ Still failed:', data2.error);
        }
      }
    }

  } catch (error) {
    console.error('❌ Connection Error:', error.message);
    console.log('\n💡 Make sure the backend server is running on http://192.168.100.32:5000');
  }
}

fixAdminViaAPI();
