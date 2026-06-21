# 👨‍💼 Admin Management Guide

## 🔧 How to Change Admin Credentials

### Method 1: Using Script (Recommended)
1. Open `change-admin-credentials.js`
2. Edit these lines:
   ```javascript
   const NEW_ADMIN_EMAIL = 'admin@mitsgwl.ac.in';  // Your new email
   const NEW_ADMIN_PASSWORD = 'admin123';          // Your new password  
   const NEW_ADMIN_NAME = 'System Administrator'; // Your new name
   ```
3. Run: `node change-admin-credentials.js`

### Method 2: Direct Database Access
1. Install SQLite browser or use command line
2. Open `complaints.db`
3. Find the users table
4. Update the admin user record

## 🔑 Current Admin Credentials
- **Email:** admin@mitsgwl.ac.in
- **Password:** admin123
- **Role:** admin

## 🚀 After Changing Credentials
1. Restart the server: `node server.js`
2. Login with new credentials
3. Test admin panel functionality

## 🛡️ Security Best Practices
- Use strong passwords (8+ characters)
- Include numbers and special characters
- Don't share credentials
- Change passwords regularly

## 📱 Admin Panel Access
- **URL:** http://localhost:3001/admin-panel.html
- **Features:** 
  - Manage all complaints
  - View student feedback
  - Assign staff members
  - Export data

---
*Keep this guide safe and secure!*
