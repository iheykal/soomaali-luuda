const http = require('http');

console.log('🧪 DIAGNOSTIC: Testing Gems API Connectivity...');

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/deposit-gems',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
        // Note: We are testing 403 vs 404 here. 
        // 403/401 means Route Exists but auth failed (GOOD). 
        // 404 means Route Missing (BAD).
    }
};

const req = http.request(options, (res) => {
    console.log(`\n📡 Response Status: ${res.statusCode} ${res.statusMessage}`);
    console.log('headers:', JSON.stringify(res.headers, null, 2));

    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('\n📦 Response Body:');
        console.log(data);

        if (res.statusCode === 404) {
            console.log('\n❌ RESULT: Route NOT FOUND (404). Server is not running the new code.');
        } else if (res.statusCode === 401 || res.statusCode === 403) {
            console.log('\n✅ RESULT: Route EXISTS! (Auth error is expected here, means endpoint is reachable).');
        } else if (res.statusCode === 200) {
            console.log('\n✅ RESULT: Route WORKING perfectly!');
        } else {
            console.log(`\n⚠️ RESULT: Unexpected status ${res.statusCode}. Check server logs.`);
        }
    });
});

req.on('error', (e) => {
    console.error(`\n❌ Connection Error: ${e.message}`);
    console.log('Is the backend server running on port 5000?');
});

req.end();
