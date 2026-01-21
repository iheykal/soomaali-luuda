// Quick test to verify gems API routes are working
// Run this: node backend/test_gems_api.js

const token = 'YOUR_ADMIN_TOKEN_HERE'; // Replace with your actual admin token
const userId = 'USER_ID_HERE'; // Replace with a user ID to test

console.log('🧪 Testing Gems API...\n');

// Test 1: Deposit gems
fetch('http://localhost:5001/api/admin/deposit-gems', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
        userId: userId,
        gemAmount: 10,
        comment: 'Test deposit'
    })
})
    .then(res => res.json())
    .then(data => {
        console.log('✅ Deposit result:', data);
    })
    .catch(err => {
        console.error('❌ Deposit failed:', err.message);
    });

// Test 2: Get gems balance
setTimeout(() => {
    fetch(`http://localhost:5001/api/admin/gems/${userId}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
        .then(res => res.json())
        .then(data => {
            console.log('\n✅ Gem balance:', data);
        })
        .catch(err => {
            console.error('❌ Get balance failed:', err.message);
        });
}, 1000);
