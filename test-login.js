import fetch from 'node-fetch';

const testLogin = async () => {
    try {
        console.log('🧪 Testing Login API...');
        const response = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: '0901234567',
                password: '123456'
            })
        });

        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));

        if (data.error) {
            console.log('❌ Login Failed:', data.message);
        } else {
            console.log('✅ Login Success! User:', data.user?.name);
        }
    } catch (error) {
        console.error('❌ Test Error:', error.message);
    }
};

testLogin();
