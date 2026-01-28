import fetch from 'node-fetch';

const testLoginCorrect = async () => {
    try {
        console.log('🧪 Testing Login with CORRECT credentials...');
        const response = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: '0901234567',
                password: '234567'  // ← CORRECT password
            })
        });

        const data = await response.json();

        if (data.error) {
            console.log('❌ Login Failed:', data.msg || data.message);
        } else {
            console.log('✅ Login SUCCESS!');
            console.log('User:', data.user?.name);
            console.log('Role:', data.user?.role);
        }
    } catch (error) {
        console.error('❌ Test Error:', error.message);
    }
};

testLoginCorrect();
