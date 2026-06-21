# 🎯 Campus Complaint Management System

A complete complaint management system for educational institutions with separate interfaces for students and administrators.

## 📁 Project Structure

### 🎯 Core Files
- **`server.js`** - Main backend server with all APIs
- **`complaints.db`** - SQLite database with all data
- **`package.json`** - Node.js dependencies

### 👨‍🎓 Student Interface
- **`index.html`** - Landing page
- **`signup.html`** - Student registration
- **`login.html`** - Authentication page
- **`dashboard.html`** - Student dashboard (view complaints, feedback)
- **`complaint-form.html`** - Submit new complaints
- **`profile.html`** - User profile management

### 👨‍💼 Admin Interface
- **`admin-panel.html`** - Complete admin panel with navigation cards
  - 📋 All Complaints section (view, assign, resolve)
  - ⭐ Student Feedback section (ratings, reviews)

### 📂 Supporting Files
- **`js/auth.js`** - Authentication utilities
- **`uploads/`** - Complaint images and profile pictures
- **`.vscode/settings.json`** - VS Code configuration

## 🚀 Features

### 👨‍🎓 Student Features
- ✅ User registration and login
- ✅ Submit complaints with images
- ✅ View complaint status and assigned staff
- ✅ Delete pending complaints
- ✅ Rate and review resolved complaints
- ✅ Real-time status updates

### 👨‍💼 Admin Features
- ✅ Clean navigation with card-based interface
- ✅ View all complaints with filters
- ✅ Manually assign staff with contact details
- ✅ Update complaint status
- ✅ View detailed complaint information
- ✅ Comprehensive feedback analytics
- ✅ Export data functionality
- ✅ Real-time updates

## 🛠️ Technology Stack
- **Backend:** Node.js, Express.js, Socket.io
- **Database:** SQLite3
- **Frontend:** HTML, CSS (TailwindCSS), JavaScript
- **Authentication:** JWT tokens
- **File Upload:** Multer
- **Real-time:** WebSocket connections

## 📊 Database Tables
- **users** - Student and admin accounts
- **complaints** - All complaint records
- **staff** - Staff member information
- **feedback** - Student ratings and reviews

## 🎯 Key Highlights
- **Clean Admin Interface** - Card-based navigation
- **Real-time Updates** - Instant status changes
- **Complete Workflow** - From submission to resolution
- **Professional Design** - Modern UI/UX
- **Mobile Responsive** - Works on all devices

## 🚀 Getting Started

### Local Development
1. Install dependencies: `npm install`
2. Start server: `node server.js`
3. Access: `http://localhost:3001`
4. Admin: run `node change-admin-credentials.js` once to create your admin
   login (edit the email/password inside that file first)

### 🌍 Deployment (taaki dusre devices/users bhi use kar sakein)

⚠️ **Important:** Ye app Vercel jaise pure-serverless platforms par theek se kaam
nahi karega, kyunki ye Socket.io (persistent WebSocket connections) aur SQLite
(local disk par file-based database) use karta hai — dono ko ek hamesha-chalne
wale server aur persistent file storage ki zaroorat hoti hai, jo serverless
functions provide nahi karte. Iske liye **Render** ya **Railway** jaisa
platform best rahega (dono free tier offer karte hain).

**Render par deploy karne ke steps:**
1. Apna code GitHub par push karein (`.env` file push na karein — wo
   `.gitignore` mein already excluded hai)
2. [render.com](https://render.com) par jaakar "New Web Service" banayein,
   apna GitHub repo connect karein
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. Environment variables set karein (Render dashboard mein "Environment" tab):
   - `JWT_SECRET` → ek naya random secret (terminal mein generate karein:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `NODE_ENV` → `production`
   - `PORT` → Render khud set kar deta hai, isse chhod sakte hain
6. Deploy hone ke baad Render aapko ek public URL dega
   (e.g. `https://your-app.onrender.com`) — yahi link kisi ke saath bhi
   share kar sakte hain, aur wo apne kisi bhi device (phone/laptop) se
   khol sakta hai.

**Railway par deploy karne ke steps:** same as above — Railway bhi
GitHub repo se directly deploy karta hai aur "Variables" tab mein
environment variables set karne deta hai.

**Heroku (agar use kar rahe hain):**
- `Procfile` already maujood hai (`web: node server.js`)
- Environment variables Heroku dashboard ke "Settings → Config Vars"
  mein set karein (`JWT_SECRET`, `NODE_ENV=production`)

### ⚠️ Deploy karne se pehle zaroor karein
- `change-admin-credentials.js` mein admin email/password apna set karein
  (default password change kiye bina deploy mat karein)
- `.env` file kabhi GitHub par commit na karein - usme secrets hote hain
- File uploads (`uploads/` folder) free-tier hosting par restart hone par
  delete ho sakte hain, kyunki zyada tar free hosting "ephemeral" (temporary)
  filesystem deta hai. Production ke liye Cloudinary/S3 jaisi external
  storage service consider karein agar uploads permanently chahiye.

**Environment Variables Reference:**
```
PORT=3001                  # hosting platform usually sets this automatically
JWT_SECRET=<your-own-random-secret>
NODE_ENV=production
```

---
*Built with ❤️ for educational institutions*
