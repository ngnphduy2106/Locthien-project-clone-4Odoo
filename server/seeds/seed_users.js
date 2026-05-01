
import { db as firebaseDb } from '../db/firebase.js';

const users = [
    { id: '1', username: 'admin', password: '123', fullName: 'Quản Trị Viên', role: 'ADMIN', plate: '', status: 'ACTIVE' },
    { id: '2', username: '0946290290', password: '123', fullName: 'Nguyễn Hà My', role: 'ADMIN', plate: '51LD-197.09', status: 'ACTIVE' },
    { id: '3', username: '0377252109', password: '123', fullName: 'Trần Trọng Nghĩa', role: 'ASSISTANT', plate: '', status: 'ACTIVE' },
    { id: '4', username: '0343979151', password: '123', fullName: 'Nguyễn Thái Hoàng Long', role: 'ASSISTANT', plate: '', status: 'ACTIVE' },
    { id: '5', username: '0372403361', password: '123', fullName: 'Lê Kim Công', role: 'ASSISTANT', plate: '', status: 'ACTIVE' },
    { id: '6', username: '0899585319', password: '123', fullName: 'Phạm Hồng Hà', role: 'ASSISTANT', plate: '', status: 'ACTIVE' },
    { id: '7', username: '0921024038', password: '123', fullName: 'Lê Văn Chiến', role: 'ASSISTANT', plate: '', status: 'ACTIVE' },
    { id: '8', username: '0336073637', password: '123', fullName: 'Nguyễn Tấn Duy', role: 'ASSISTANT', plate: '', status: 'ACTIVE' },
    { id: '9', username: '0931222840', password: '123', fullName: 'Trần Duy Tâm', role: 'ASSISTANT', plate: '', status: 'ACTIVE' },
    { id: '10', username: '0946329329', password: '123', fullName: 'Lê Kim Chức', role: 'TESTER', plate: '', status: 'ACTIVE' },
    { id: '11', username: '0961418261', password: '123', fullName: 'Phan Đình Phi', role: 'DRIVER', plate: '51D-991.03', status: 'ACTIVE' },
    { id: '12', username: '0898463398', password: '123', fullName: 'Trương Quang Hào', role: 'DRIVER', plate: '51L-697.62', status: 'ACTIVE' },
    { id: '13', username: '0982180337', password: '123', fullName: 'Ngô Đình Chiến', role: 'DRIVER', plate: '51M-440.53', status: 'ACTIVE' },
    { id: '14', username: '0967411763', password: '123', fullName: 'Đoàn Văn Báu', role: 'DRIVER', plate: '50H-260.87', status: 'ACTIVE' },
    { id: '15', username: '0364666337', password: '123', fullName: 'Ngô Quang Đạt', role: 'DRIVER', plate: '51C-96.997', status: 'ACTIVE' },
    { id: '16', username: '0342709036', password: '123', fullName: 'Nguyễn Quốc Phục', role: 'DRIVER', plate: '51D-398.74', status: 'ACTIVE' },
    { id: '17', username: '0383086910', password: '123', fullName: 'Đoàn Văn Quý', role: 'DRIVER', plate: '50H-232.92', status: 'ACTIVE' },
    { id: '18', username: '974088973', password: '123', fullName: 'Huỳnh Hương', role: 'TESTER', plate: '', status: 'ACTIVE' },
    { id: '19', username: '0941222840', password: '123', fullName: 'Đức Anh', role: 'ADMIN', plate: '', status: 'ACTIVE' },
    { id: '20', username: '0911614444', password: '123', fullName: 'Khác', role: 'DRIVER', plate: '', status: 'ACTIVE' },
    { id: '21', username: '0979891929', password: '123', fullName: 'Không', role: 'ADMIN', plate: '', status: 'ACTIVE' },
    { id: '22', username: '0936351147', password: '123', fullName: 'Cẩm Tiên', role: 'TESTER', plate: '', status: 'ACTIVE' },
    { id: '23', username: '707304444', password: '123', fullName: 'Nguyễn Tấn Sang', role: 'TESTER', plate: '', status: 'ACTIVE' }
];

async function seedUsers() {
    console.log('🌱 Replacing Users with Real Data...');

    // 1. Clear existing users
    await firebaseDb.ref('users').remove();
    console.log('🗑️  Cleared old users.');

    // 2. Add new users
    for (const user of users) {
        // ID sanitization (just in case, though these integer IDs are safe)
        const safeId = String(user.id);

        await firebaseDb.ref(`users/${safeId}`).set({
            ...user,
            createdAt: new Date().toISOString()
        });
        console.log(`✅ Added: ${user.fullName} (${user.role}) - ${user.username}`);
    }

    console.log('✨ User Sync Information:');
    console.log(`- Total Users: ${users.length}`);
    console.log(`- Drivers: ${users.filter(u => u.role === 'DRIVER').length}`);

    process.exit(0);
}

seedUsers();
