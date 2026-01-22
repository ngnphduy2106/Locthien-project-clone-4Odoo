
import fetch from 'node-fetch';

async function checkApi() {
    try {
        const res = await fetch('http://localhost:3000/api/orders');
        const data = await res.json();
        console.log('API Response Summary:');
        console.log('Pending:', data.pending ? data.pending.length : 'undefined');
        console.log('Assigned:', data.assigned ? data.assigned.length : 'undefined');
        console.log('Completed:', data.completed ? data.completed.length : 'undefined');
    } catch (e) {
        console.error('Fetch Error:', e.message);
    }
}

checkApi();
