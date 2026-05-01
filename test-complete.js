import fetch from 'node-fetch';

async function testComplete() {
    const API_BASE = 'http://localhost:3001/api';
    console.log('Fetching orders to assign and complete...');

    // 1. Get a pending order
    const res = await fetch(`${API_BASE}/orders?includeDeleted=false`);
    const data = await res.json();

    if (!data.pending || data.pending.length === 0) {
        console.log('No pending orders. Try again later.');
        return;
    }

    const targetOrder = data.pending[0];
    const orderId = targetOrder.id || targetOrder.soDon;
    console.log(`\n--- Selected Order: ${orderId} ---`);

    // 2. Multi-assign
    console.log('\n--- 1. Multi Assigning 2 drivers ---');
    const multiPayload = {
        assignments: [
            { driver_name: "Tài xế 1", plate: "51A-11111", qty: 10, type: "internal" },
            { driver_name: "Tài xế 2", plate: "51B-22222", assistant_name: "Phụ xe 2", qty: 20, type: "external" }
        ]
    };

    const multiRes = await fetch(`${API_BASE}/orders/${orderId}/assign-multi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(multiPayload)
    });
    console.log('Assign Result:', (await multiRes.json()).msg);

    // 3. Find assignment ID
    const assignRes = await fetch(`${API_BASE}/orders/${orderId}/assignments`);
    const assignData = await assignRes.json();
    const assignments = assignData.data || [];
    console.log(`Found ${assignments.length} assignments.`);

    if (assignments.length < 2) return;

    // 4. Complete JUST ONE of them
    const targetAssign = assignments[1]; // Phụ xe 2
    console.log(`\n--- 2. Completing ONE split assignment (ID: ${targetAssign.id}) ---`);
    const completePayload = {
        type: 'XUAT',
        warehouse: 'LT1',
        partner: 'Test',
        driver_name: 'Tài xế 2',
        plate: '51B-22222',
        cart: [{ code: 'SP1', name: 'San pham 1', qty: 20, weight_kg: 20, unit: 'kg' }],
        local_items: [],
        delivery_note: "Xong som",
        sender: 'Tài xế 2',
        assignment_id: targetAssign.id
    };

    const compRes = await fetch(`${API_BASE}/orders/${orderId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(completePayload)
    });
    console.log('Complete Result:', await compRes.json());

    console.log('\nDone!');
    process.exit(0);
}

testComplete().catch(console.error);
