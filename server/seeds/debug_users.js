
import { db } from '../db/index.js';

async function checkUsers() {
    console.log('🔍 Checking Users in DB...');
    const users = await db.getUsers();

    console.log(`Found ${users.length} users.`);

    if (users.length === 0) {
        console.log('❌ No users found!');
    } else {
        console.log('--- User List (ID | Username | Password | Role) ---');
        users.forEach(u => {
            console.log(`${u.id.padEnd(10)} | ${u.username.padEnd(15)} | ${u.password.padEnd(10)} | ${u.role}`);
        });
    }

    process.exit(0);
}

checkUsers();
