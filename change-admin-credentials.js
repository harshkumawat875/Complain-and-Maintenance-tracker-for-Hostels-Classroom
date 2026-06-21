// ⚠️ SECURITY NOTE:
// Ye script aapke database mein admin account banata/update karta hai.
// Yahan neeche jo password likha hai wahi aapka admin login password banega -
// isliye:
//   1. Deploy karne se PEHLE ek strong, unique password yahan set karein
//      (sirf "admin1234" jaisa simple password mat use karein)
//   2. Ye script run karne ke baad isse repo/zip mein commit na karein,
//      ya kam se kam password value yahan se hata dein
//   3. Agar GitHub par push kar rahe hain, to .gitignore mein add karna
//      sahi rahega taaki credentials publicly visible na ho

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

// 🔧 CHANGE THESE VALUES TO YOUR DESIRED ADMIN CREDENTIALS
const NEW_ADMIN_EMAIL = 'admin@mitsgwl.ac.in';     // Your new admin email
const NEW_ADMIN_PASSWORD = 'admin@@2004'; // ⚠️ CHANGE THIS before running in production
const NEW_ADMIN_NAME = 'System Administrator';     // Your new admin name

// Database connection
const dbPath = path.join(__dirname, 'complaints.db');
const db = new Database(dbPath);

console.log('🔧 Starting admin credential update process...');
console.log(`📧 New Email: ${NEW_ADMIN_EMAIL}`);
console.log(`👤 New Name: ${NEW_ADMIN_NAME}`);
console.log('🔒 Password will be encrypted and updated');

async function updateAdminCredentials() {
    try {
        // Hash the new password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(NEW_ADMIN_PASSWORD, saltRounds);

        console.log('🔐 Password encrypted successfully');

        // Check if admin user exists
        const existingAdmin = db.prepare('SELECT * FROM users WHERE role = ?').get('admin');

        if (existingAdmin) {
            // Update existing admin
            console.log('👤 Found existing admin user, updating...');
            db.prepare('UPDATE users SET email = ?, password = ?, name = ? WHERE role = ?')
                .run(NEW_ADMIN_EMAIL, hashedPassword, NEW_ADMIN_NAME, 'admin');

            console.log('✅ Admin credentials updated successfully!');
            console.log('\n📋 New Admin Details:');
            console.log(`   Email: ${NEW_ADMIN_EMAIL}`);
            console.log(`   Password: ${NEW_ADMIN_PASSWORD}`);
            console.log(`   Name: ${NEW_ADMIN_NAME}`);
            console.log('\n🚀 Please restart the server and login with new credentials');
        } else {
            // Create new admin user
            console.log('👤 No admin found, creating new admin user...');
            db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)')
                .run(NEW_ADMIN_EMAIL, hashedPassword, NEW_ADMIN_NAME, 'admin');

            console.log('✅ New admin user created successfully!');
            console.log('\n📋 Admin Details:');
            console.log(`   Email: ${NEW_ADMIN_EMAIL}`);
            console.log(`   Password: ${NEW_ADMIN_PASSWORD}`);
            console.log(`   Name: ${NEW_ADMIN_NAME}`);
            console.log('\n🚀 Please restart the server and login with new credentials');
        }

        db.close();
    } catch (error) {
        console.error('❌ Error:', error);
        db.close();
    }
}

// Run the update
updateAdminCredentials();
