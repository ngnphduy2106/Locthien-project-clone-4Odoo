import fetch from 'node-fetch';

async function testDispatch() {
    const API_BASE = 'http://localhost:3001/api';
    console.log('Fetching orders...');
    const res = await fetch(`${API_BASE}/orders?includeDeleted=false`);
    const data = await res.json();

    if (!data.pending || data.pending.length === 0) {
        console.log('No pending orders found. Exiting.');
        return;
    }

    // Pick first pending order
    const orderId = data.pending[0].id || data.pending[0].soDon;
    console.log(`Testing assignment for Order ID: ${orderId}`);

    console.log('\n--- 1. Testing Single Assign --');
    const assignPayload = {
        driverName: "Tài Xế Test",
        plate: "51A-99999",
        note: "Test note from script",
        assistantName: "Phụ Xe Test",
        deliveryTime: "Sáng mai 8h"
    };

    const assignRes = await fetch(`${API_BASE}/orders/${orderId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignPayload)
    });

    const assignResult = await assignRes.json();
    console.log('Assign Result:', assignResult);

    // Check if it saved correctly
    // We can fetch the order detail or just trust the response 

    console.log('\n--- 2. Testing Multi Assign --');
    const multiPayload = {
        assignments: [
            {
                driver_name: "Tài xế 1",
                plate: "51A-11111",
                assistant_name: "Phụ xe 1",
                delivery_time: "Sáng",
                qty: 10,
                type: "internal",
                note: "Split 1"
            },
            {
                driver_name: "Tài xế 2",
                plate: "51B-22222",
                assistant_name: "Phụ xe 2",
                delivery_time: "Chiều",
                qty: 20,
                type: "external",
                note: "Split 2"
            }
        ]
    };

    const multiRes = await fetch(`${API_BASE}/orders/${orderId}/assign-multi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(multiPayload)
    });

    const multiResult = await multiRes.json();
    console.log('Multi Assign Result:', multiResult);

    console.log('\nDone testing!');
    process.exit(0);
}

testDispatch().catch(console.error);
