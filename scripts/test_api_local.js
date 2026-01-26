
import fetch from 'node-fetch';

async function testDiag() {
    const driver = "Phan Đình Phi";
    // Target the diagnostic server
    const url = `http://localhost:3002/api/orders/my/${encodeURIComponent(driver)}?role=DRIVER`;

    console.log(`📡 Testing Diagnostic API: ${url}`);

    try {
        const res = await fetch(url);
        console.log(`📊 Status: ${res.status} ${res.statusText}`);

        const data = await res.json();
        console.log(`📦 Data:`, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(`❌ Fetch Error:`, e.message);
    }
}

testDiag();
