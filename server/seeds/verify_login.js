
import fetch from 'node-fetch';

async function testLogin(username, password) {
    console.log(`\n🔑 Testing Login: ${username} / ${password}`);
    try {
        const res = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.error) {
            console.log('❌ FAILED:', data.msg);
        } else {
            console.log('✅ SUCCESS:', data.user.name, `(${data.user.role})`);
        }
    } catch (e) {
        console.log('💀 ERROR:', e.message);
    }
}

async function run() {
    // 1. Test Admin
    await testLogin('admin', '123');

    // 2. Test New Driver (with 0)
    await testLogin('0946290290', '123');

    // 3. Test New Driver (without 0 - user behavior?)
    await testLogin('946290290', '123');

    // 4. Test New Driver (wrong pass)
    await testLogin('0946290290', '123456');

    // 5. Test another random one
    await testLogin('0982180337', '123');
}

run();
