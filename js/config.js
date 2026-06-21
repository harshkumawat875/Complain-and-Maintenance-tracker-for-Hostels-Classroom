// ============================================================
// Central App Configuration
// ============================================================
// Is file ka kaam: backend API ka sahi URL automatically detect karna.
//
// Pehle saare HTML/JS files mein "http://localhost:3001" hardcoded tha,
// isliye jab project deploy hota tha (Render/Railway/Heroku etc.), 
// browser hamesha aapke local computer se hi connect karne ki koshish 
// karta tha — jo kisi doosre device/user ke liye kabhi kaam nahi karta.
//
// Ab is file mein hum window.location.origin use karte hain, jo apne aap
// current domain (jahan se site khul rahi hai) le leta hai.
// Local pe chalaoge to ye "http://localhost:3001" banega,
// aur deploy karne ke baad ye apne aap deployed URL (e.g. 
// "https://your-app.onrender.com") ban jayega — koi manual change nahi karna padega.
// ============================================================

const API_BASE_URL = window.location.origin;

// Socket.io bhi isi base URL ka use karega (real-time updates ke liye)
const SOCKET_URL = window.location.origin;
