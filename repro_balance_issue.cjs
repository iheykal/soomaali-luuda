const balance = 0.24999999999999994; // Simulating a dust value close to 0.25
const stake = 0.25;

console.log(`Balance: ${balance}`);
console.log(`Stake: ${stake}`);

console.log('--- Strict Check (Current Logic) ---');
if (balance < stake) {
    console.log('❌ FAILED: Insufficient funds (Strict)');
} else {
    console.log('✅ PASSED: Sufficient funds (Strict)');
}

console.log('\n--- Tolerance Check (Proposed Fix) ---');
const EPSILON = 0.0001;
if (balance + EPSILON < stake) {
    console.log('❌ FAILED: Insufficient funds (Tolerance)');
} else {
    console.log('✅ PASSED: Sufficient funds (Tolerance)');
}

console.log('\n--- Rounding Check (Alternative Fix) ---');
const roundedBalance = Math.round(balance * 100) / 100;
if (roundedBalance < stake) {
    console.log('❌ FAILED: Insufficient funds (Rounded)');
} else {
    console.log('✅ PASSED: Sufficient funds (Rounded)');
}
