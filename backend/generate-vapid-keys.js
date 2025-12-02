/**
 * VAPID Key Generator for Web Push Notifications
 * 
 * Run this script once to generate VAPID keys:
 * node generate-vapid-keys.js
 * 
 * Then copy the output to your .env file
 */

const webPush = require('web-push');

// Generate VAPID keys
const vapidKeys = webPush.generateVAPIDKeys();

console.log('\n=== VAPID Keys Generated ===\n');
console.log('Add these to your .env file:\n');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:your-email@example.com`);
console.log('\n===========================\n');
console.log('⚠️ IMPORTANT: Keep the private key secret!\n');

module.exports = vapidKeys;
