const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper: build the public base URL (protocol + host) from the incoming request.
// FIX: pehle code mein 'http://localhost:3001' hardcoded tha jo deploy karne
// ke baad galat URLs banata tha (e.g. uploaded image links). Ye function
// request se hi sahi domain nikal leta hai, chahe app localhost pe chale
// ya kisi bhi cloud host (Render/Railway/Heroku) pe deploy ho.
function getBaseUrl(req) {
    return `${req.protocol}://${req.get('host')}`;
}

// Enhanced CORS middleware for maximum compatibility
app.use((req, res, next) => {
    // Always allow all origins for development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma');
    res.setHeader('Access-Control-Expose-Headers', 'Authorization, Content-Length, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    
    // Handle preflight requests immediately
    if (req.method === 'OPTIONS') {
        res.status(204).send();
        return;
    }
    
    next();
});

// Standard CORS middleware as backup
app.use(cors({
    origin: '*',
    credentials: false, // Set to false when origin is '*'
    optionsSuccessStatus: 204,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Debug middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log('Origin:', req.headers.origin);
    console.log('User-Agent:', req.headers['user-agent']);
    next();
});

app.use(express.json());
app.use(express.static('public'));
app.use(express.static('.')); // Serve HTML files from root directory
app.use('/uploads', express.static('uploads'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Create profile pictures directory
if (!fs.existsSync('uploads/profiles')) {
    fs.mkdirSync('uploads/profiles');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        // Allow only images
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Profile photo upload configuration
const profileStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/profiles/')
    },
    filename: function (req, file, cb) {
        const userId = req.user.id;
        const extension = path.extname(file.originalname);
        cb(null, `profile-${userId}-${Date.now()}${extension}`);
    }
});

const uploadProfile = multer({
    storage: profileStorage,
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB limit for profile photos
    },
    fileFilter: function (req, file, cb) {
        // Allow only images
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Initialize SQLite Database
const db = new sqlite3.Database('complaints.db');

// Create tables
db.serialize(() => {
    // Users table (only create if not exists)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password TEXT,
        student_id TEXT,
        role TEXT DEFAULT 'student',
        google_id TEXT,
        profile_picture TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Staff table
    db.run(`CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        department TEXT NOT NULL,
        phone TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Complaints table
    db.run(`CREATE TABLE IF NOT EXISTS complaints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        complaint_type TEXT NOT NULL,
        location TEXT NOT NULL,
        room_number TEXT,
        block TEXT,
        hostel_name TEXT,
        image_path TEXT,
        status TEXT DEFAULT 'pending',
        assigned_to INTEGER,
        priority TEXT DEFAULT 'medium',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        manual_staff_name TEXT,
        manual_staff_phone TEXT,
        manual_staff_email TEXT,
        manual_staff_department TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (assigned_to) REFERENCES staff (id)
    )`);

    // Safety net: if an OLDER complaints.db (created before this fix) is reused,
    // the table will already exist without these columns. ALTER TABLE adds them
    // if missing, so the app doesn't crash with "no such column" errors.
    // (SQLite errors here are safely ignored if the column already exists.)
    const manualStaffColumns = [
        ['manual_staff_name', 'TEXT'],
        ['manual_staff_phone', 'TEXT'],
        ['manual_staff_email', 'TEXT'],
        ['manual_staff_department', 'TEXT']
    ];
    manualStaffColumns.forEach(([col, type]) => {
        db.run(`ALTER TABLE complaints ADD COLUMN ${col} ${type}`, (err) => {
            // Ignore "duplicate column name" errors - means it already exists
            if (err && !err.message.includes('duplicate column')) {
                console.error(`Migration warning for column ${col}:`, err.message);
            }
        });
    });

    // Feedback table
    db.run(`CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complaint_id) REFERENCES complaints (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Insert default staff members
    const defaultStaff = [
        ['John Smith', 'plumber@institute.edu', 'Plumbing', '+91-9876543210'],
        ['Mike Johnson', 'electrician@institute.edu', 'Electricity', '+91-9876543211'],
        ['Sarah Wilson', 'janitor@institute.edu', 'Cleaning', '+91-9876543212'],
        ['David Brown', 'supervisor@institute.edu', 'General', '+91-9876543213'],
        ['Lisa Davis', 'internet@institute.edu', 'Internet', '+91-9876543214']
    ];

    const insertStaff = db.prepare(`INSERT OR IGNORE INTO staff (name, email, department, phone) VALUES (?, ?, ?, ?)`);
    defaultStaff.forEach(staff => {
        insertStaff.run(staff);
    });
    insertStaff.finalize();
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        
        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        req.user = user;
        next();
    });
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Complaint Tracker API is running' });
});

// Database test endpoint
// SECURITY FIX: pehle ye endpoint production mein bhi sabke liye khula tha
// aur database schema details expose karta tha. Ab ye sirf development
// environment mein chalega (NODE_ENV=production set hone par band ho jayega).
app.get('/api/test-db', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not found' });
    }
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
        if (err) {
            res.status(500).json({ error: 'Database error', details: err.message });
        } else if (row) {
            db.all("PRAGMA table_info(users)", (err, columns) => {
                if (err) {
                    res.status(500).json({ error: 'Failed to get table info', details: err.message });
                } else {
                    res.json({ 
                        status: 'OK', 
                        message: 'Users table exists',
                        columns: columns.map(col => ({ name: col.name, type: col.type }))
                    });
                }
            });
        } else {
            res.status(404).json({ error: 'Users table not found' });
        }
    });
});

// Debug endpoint to check users
// SECURITY FIX: pehle ye route BINA kisi authentication ke sabhi users
// ke email, naam, aur role internet par expose kar raha tha — koi bhi
// is URL ko khol kar poori user list dekh sakta tha. Ab ye sirf
// development environment mein hi kaam karega.
app.get('/api/debug/users', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not found' });
    }
    db.all('SELECT id, email, name, role, created_at, CASE WHEN password IS NOT NULL THEN "YES" ELSE "NO" END as has_password FROM users', (err, users) => {
        if (err) {
            res.status(500).json({ error: 'Database error', details: err.message });
        } else {
            res.json({ 
                status: 'OK', 
                count: users.length,
                users: users
            });
        }
    });
});

// Manual user registration
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password, name, student_id, role } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }

        // Check if user already exists
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, existingUser) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (existingUser) {
                return res.status(400).json({ error: 'User already exists with this email' });
            }

            // Hash password
            const hashedPassword = bcrypt.hashSync(password, 10);
            console.log('Creating new user:', { email, name, student_id, role });

            // Create new user
            db.run(
                'INSERT INTO users (email, name, password, student_id, role) VALUES (?, ?, ?, ?, ?)',
                [email, name, hashedPassword, student_id || null, role || 'student'],
                function(err) {
                    if (err) {
                        console.error('Database error during user creation:', err);
                        return res.status(500).json({ error: 'Failed to create user: ' + err.message });
                    }

                    console.log('User created successfully with ID:', this.lastID);

                    const token = jwt.sign(
                        { id: this.lastID, email, role: role || 'student' },
                        JWT_SECRET,
                        { expiresIn: '24h' }
                    );

                    // Get the created user with profile picture info
                    db.get('SELECT id, email, name, student_id, role, profile_picture FROM users WHERE id = ?', [this.lastID], (err, newUser) => {
                        if (err) {
                            return res.status(500).json({ error: 'Failed to retrieve user data' });
                        }
                        
                        // Add profile picture URL if exists
                        if (newUser.profile_picture) {
                            newUser.profile_picture_url = `${getBaseUrl(req)}/uploads/${newUser.profile_picture}`;
                        }
                        
                        res.json({
                            message: 'User created successfully',
                            token,
                            user: newUser
                        });
                    });
                }
            );
        });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Manual user login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user
        // SECURITY FIX: pehle yahan plaintext password aur password hash
        // console.log mein print ho rahe the, jo server logs mein hamesha
        // ke liye save ho sakte the. Wo sab logs hata diye gaye hain.
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
            if (err) {
                console.error('Database error during login:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!user) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            // Check if user has a password (manual signup)
            if (!user.password) {
                return res.status(401).json({ error: 'Please use Google Sign-In for this account' });
            }

            // Check password
            const passwordMatch = bcrypt.compareSync(password, user.password);

            if (!passwordMatch) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            // Add profile picture URL if exists
            const userResponse = {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                student_id: user.student_id,
                profile_picture: user.profile_picture
            };
            
            if (user.profile_picture) {
                userResponse.profile_picture_url = `${getBaseUrl(req)}/uploads/${user.profile_picture}`;
            }
            
            res.json({
                message: 'Login successful',
                token,
                user: userResponse
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// Google OAuth (existing)
app.post('/api/auth/google', async (req, res) => {
    try {
        const { email, name, google_id, picture } = req.body;

        if (!email || !name) {
            return res.status(400).json({ error: 'Email and name are required' });
        }

        // Check if user exists
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (user) {
                // User exists, generate token
                const token = jwt.sign(
                    { id: user.id, email: user.email, role: user.role },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.json({
                    token,
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role,
                        profile_picture: user.profile_picture
                    }
                });
            } else {
                // Create new user
                db.run(
                    'INSERT INTO users (email, name, google_id, profile_picture) VALUES (?, ?, ?, ?)',
                    [email, name, google_id, picture],
                    function(err) {
                        if (err) {
                            return res.status(500).json({ error: 'Failed to create user' });
                        }

                        const token = jwt.sign(
                            { id: this.lastID, email, role: 'student' },
                            JWT_SECRET,
                            { expiresIn: '24h' }
                        );

                        res.json({
                            token,
                            user: {
                                id: this.lastID,
                                email,
                                name,
                                role: 'student',
                                profile_picture: picture
                            }
                        });
                    }
                );
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// Get complaint types and their assigned departments
app.get('/api/complaint-types', (req, res) => {
    const complaintTypes = {
        'Electricity': 'Electricity',
        'Plumbing': 'Plumbing', 
        'Cleaning': 'Cleaning',
        'Internet': 'Internet',
        'General': 'General',
        'Furniture': 'General',
        'Security': 'General',
        'Maintenance': 'General'
    };
    
    res.json(complaintTypes);
});

// Submit complaint
app.post('/api/complaints', authenticateToken, upload.single('image'), (req, res) => {
    try {
        const { title, description, complaint_type, location, room_number, block, hostel_name, priority } = req.body;
        const user_id = req.user.id;
        const complaint_id = 'CMP-' + Date.now();
        const image_path = req.file ? req.file.filename : null;

        if (!title || !description || !complaint_type || !location) {
            return res.status(400).json({ error: 'Required fields missing' });
        }

        // No auto-assignment - Admin will manually assign
        const assigned_to = null;

        db.run(`
            INSERT INTO complaints (
                complaint_id, user_id, title, description, complaint_type, 
                location, room_number, block, hostel_name, image_path, 
                assigned_to, priority
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            complaint_id, user_id, title, description, complaint_type,
            location, room_number, block, hostel_name, image_path,
            assigned_to, priority || 'medium'
        ], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to submit complaint' });
            }

            // Emit real-time notification
            io.emit('new_complaint', {
                id: this.lastID,
                complaint_id,
                title,
                complaint_type,
                location,
                assigned_to
            });

            res.json({
                message: 'Complaint submitted successfully',
                complaint_id,
                id: this.lastID
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit complaint' });
    }
});

// Get user's complaints
app.get('/api/my-complaints', authenticateToken, (req, res) => {
    const user_id = req.user.id;

    db.all(`
        SELECT c.*, s.name as assigned_staff_name, s.department, s.phone as staff_phone,
               c.manual_staff_name, c.manual_staff_phone, c.manual_staff_department, c.manual_staff_email
        FROM complaints c 
        LEFT JOIN staff s ON c.assigned_to = s.id 
        WHERE c.user_id = ? 
        ORDER BY c.created_at DESC
    `, [user_id], (err, complaints) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(complaints);
    });
});

// Get all complaints
app.get('/api/complaints', authenticateToken, (req, res) => {
    const { status, type, limit = 50 } = req.query;
    
    let query = `
        SELECT c.*, u.name as user_name, u.email as user_email, 
               s.name as assigned_staff_name, s.department 
        FROM complaints c 
        LEFT JOIN users u ON c.user_id = u.id 
        LEFT JOIN staff s ON c.assigned_to = s.id 
        WHERE 1=1
    `;
    
    const params = [];
    
    if (status) {
        query += ' AND c.status = ?';
        params.push(status);
    }
    
    if (type) {
        query += ' AND c.complaint_type = ?';
        params.push(type);
    }
    
    query += ' ORDER BY c.created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    db.all(query, params, (err, complaints) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(complaints);
    });
});

// Update complaint status
// SECURITY FIX: pehle is route mein koi ownership check nahi tha -
// matlab koi bhi logged-in student kisi bhi complaint (chahe wo unki na ho)
// ka status badal sakta tha. Ab hum check karte hain ki ya to wo
// complaint khud user ki ho, ya phir user admin ho.
app.put('/api/complaints/:id/status', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const requesting_user_id = req.user.id;
    const requesting_user_role = req.user.role;

    const validStatuses = ['pending', 'in_progress', 'resolved'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    // First confirm the complaint exists and check ownership
    db.get('SELECT * FROM complaints WHERE id = ?', [id], (err, complaint) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (!complaint) {
            return res.status(404).json({ error: 'Complaint not found' });
        }

        const isOwner = complaint.user_id === requesting_user_id;
        const isAdmin = requesting_user_role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: 'You do not have permission to update this complaint' });
        }

        const resolved_at = status === 'resolved' ? new Date().toISOString() : null;

        db.run(
            'UPDATE complaints SET status = ?, resolved_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [status, resolved_at, id],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Failed to update status' });
                }

                // Emit real-time update
                io.emit('status_update', { complaint_id: id, status });

                res.json({ message: 'Status updated successfully' });
            }
        );
    });
});

// Delete complaint (Student can only delete their own pending complaints)
app.delete('/api/complaints/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const user_id = req.user.id;

    // First check if complaint exists and belongs to user
    db.get('SELECT * FROM complaints WHERE id = ? AND user_id = ?', [id, user_id], (err, complaint) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!complaint) {
            return res.status(404).json({ error: 'Complaint not found or you do not have permission to delete it' });
        }

        // Only allow deletion of pending complaints
        if (complaint.status !== 'pending') {
            return res.status(400).json({ error: 'Only pending complaints can be deleted' });
        }

        // Delete the complaint
        db.run('DELETE FROM complaints WHERE id = ? AND user_id = ?', [id, user_id], function(err) {
            if (err) {
                console.error('Delete error:', err);
                return res.status(500).json({ error: 'Failed to delete complaint' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Complaint not found' });
            }

            // Also delete associated feedback if any
            db.run('DELETE FROM feedback WHERE complaint_id = ?', [id], (err) => {
                if (err) {
                    console.error('Feedback deletion error:', err);
                }
            });

            // Emit real-time update
            io.emit('complaint_deleted', { 
                complaint_id: id,
                user_id: user_id
            });

            res.json({ 
                message: 'Complaint deleted successfully',
                complaint_id: complaint.complaint_id
            });
        });
    });
});

// Submit feedback
app.post('/api/complaints/:id/feedback', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const user_id = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    db.run(
        'INSERT INTO feedback (complaint_id, user_id, rating, comment) VALUES (?, ?, ?, ?)',
        [id, user_id, rating, comment],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to submit feedback' });
            }
            res.json({ message: 'Feedback submitted successfully' });
        }
    );
});

// Upload profile photo
app.post('/api/profile/photo', authenticateToken, uploadProfile.single('photo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No photo uploaded' });
        }

        const userId = req.user.id;
        const photoPath = `profiles/${req.file.filename}`;

        // Update user's profile picture in database
        db.run(
            'UPDATE users SET profile_picture = ? WHERE id = ?',
            [photoPath, userId],
            function(err) {
                if (err) {
                    console.error('Database error updating profile picture:', err);
                    return res.status(500).json({ error: 'Failed to update profile picture' });
                }

                res.json({
                    message: 'Profile photo updated successfully',
                    photo_url: `/uploads/${photoPath}`
                });
            }
        );
    } catch (error) {
        console.error('Profile photo upload error:', error);
        res.status(500).json({ error: 'Failed to upload profile photo' });
    }
});

// Get user profile
app.get('/api/profile', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.get('SELECT id, email, name, student_id, role, profile_picture, created_at FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Add full URL for profile picture
        if (user.profile_picture) {
            user.profile_picture_url = `${getBaseUrl(req)}/uploads/${user.profile_picture}`;
        }

        res.json(user);
    });
});

// Update user profile
app.put('/api/profile', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { name, student_id } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }

    db.run(
        'UPDATE users SET name = ?, student_id = ? WHERE id = ?',
        [name, student_id || null, userId],
        function(err) {
            if (err) {
                console.error('Database error updating profile:', err);
                return res.status(500).json({ error: 'Failed to update profile' });
            }

            res.json({ message: 'Profile updated successfully' });
        }
    );
});

// Get dashboard stats
app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
    const queries = {
        total: 'SELECT COUNT(*) as count FROM complaints',
        pending: 'SELECT COUNT(*) as count FROM complaints WHERE status = "pending"',
        in_progress: 'SELECT COUNT(*) as count FROM complaints WHERE status = "in_progress"',
        resolved: 'SELECT COUNT(*) as count FROM complaints WHERE status = "resolved"'
    };

    const stats = {};
    let completed = 0;

    Object.keys(queries).forEach(key => {
        db.get(queries[key], (err, result) => {
            if (!err) {
                stats[key] = result.count;
            }
            completed++;
            if (completed === Object.keys(queries).length) {
                res.json(stats);
            }
        });
    });
});

// ============= ADMIN ROUTES =============

// Get all complaints for admin with full details
app.get('/api/admin/complaints', authenticateAdmin, (req, res) => {
    const { status, type, limit = 100 } = req.query;
    
    let query = `
        SELECT c.*, u.name as user_name, u.email as user_email, u.student_id,
               s.name as assigned_staff_name, s.department, s.phone as staff_phone,
               c.manual_staff_name, c.manual_staff_phone, c.manual_staff_department, c.manual_staff_email
        FROM complaints c 
        LEFT JOIN users u ON c.user_id = u.id 
        LEFT JOIN staff s ON c.assigned_to = s.id 
        WHERE 1=1
    `;
    
    const params = [];
    
    if (status) {
        query += ' AND c.status = ?';
        params.push(status);
    }
    
    if (type) {
        query += ' AND c.complaint_type = ?';
        params.push(type);
    }
    
    query += ' ORDER BY c.created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    db.all(query, params, (err, complaints) => {
        if (err) {
            console.error('Admin complaints fetch error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(complaints);
    });
});

// Get single complaint details for admin
app.get('/api/admin/complaints/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    
    db.get(`
        SELECT c.*, u.name as user_name, u.email as user_email, u.student_id,
               s.name as assigned_staff_name, s.department, s.phone as staff_phone
        FROM complaints c 
        LEFT JOIN users u ON c.user_id = u.id 
        LEFT JOIN staff s ON c.assigned_to = s.id 
        WHERE c.id = ?
    `, [id], (err, complaint) => {
        if (err) {
            console.error('Admin complaint fetch error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!complaint) {
            return res.status(404).json({ error: 'Complaint not found' });
        }
        
        res.json(complaint);
    });
});

// Assign complaint to staff manually (Admin only)
app.put('/api/admin/complaints/:id/assign', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const { manual_staff } = req.body;

    if (!manual_staff) {
        return res.status(400).json({ error: 'Manual staff details are required' });
    }

    const { name, phone, department, email } = manual_staff;

    if (!name || !phone) {
        return res.status(400).json({ error: 'Staff name and phone are required' });
    }

    // Update complaint with manual staff details
    db.run(`
        UPDATE complaints SET 
            assigned_to = NULL,
            manual_staff_name = ?,
            manual_staff_phone = ?,
            manual_staff_department = ?,
            manual_staff_email = ?,
            status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    `, [name, phone, department, email, id], function(err) {
        if (err) {
            console.error('Manual assignment error:', err);
            return res.status(500).json({ error: 'Failed to assign complaint' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Complaint not found' });
        }

        // Emit real-time update
        io.emit('complaint_assigned', { 
            complaint_id: id, 
            manual_staff: true,
            staff_name: name,
            staff_phone: phone
        });

        res.json({ 
            message: 'Complaint assigned successfully',
            assigned_to: `${name} (${phone})` 
        });
    });
});

// Update complaint status and details (Admin only)
app.put('/api/admin/complaints/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const { 
        title, 
        description, 
        complaint_type, 
        location, 
        room_number, 
        block, 
        status, 
        priority,
        assigned_to 
    } = req.body;

    if (!title || !description || !complaint_type || !location) {
        return res.status(400).json({ error: 'Required fields missing' });
    }

    const resolved_at = status === 'resolved' ? new Date().toISOString() : null;

    db.run(`
        UPDATE complaints SET 
            title = ?, 
            description = ?, 
            complaint_type = ?, 
            location = ?, 
            room_number = ?, 
            block = ?, 
            status = ?, 
            priority = ?, 
            assigned_to = ?,
            resolved_at = ?,
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    `, [
        title, 
        description, 
        complaint_type, 
        location, 
        room_number || null, 
        block || null, 
        status, 
        priority || 'medium',
        assigned_to || null, 
        resolved_at, 
        id
    ], function(err) {
        if (err) {
            console.error('Admin complaint update error:', err);
            return res.status(500).json({ error: 'Failed to update complaint' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Complaint not found' });
        }

        // Emit real-time update
        io.emit('complaint_updated', { complaint_id: id, status });

        res.json({ message: 'Complaint updated successfully' });
    });
});

// Delete complaint (Admin only)
app.delete('/api/admin/complaints/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;

    db.run('DELETE FROM complaints WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('Admin complaint delete error:', err);
            return res.status(500).json({ error: 'Failed to delete complaint' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Complaint not found' });
        }

        // Emit real-time update
        io.emit('complaint_deleted', { complaint_id: id });

        res.json({ message: 'Complaint deleted successfully' });
    });
});

// Get all staff members
app.get('/api/admin/staff', authenticateAdmin, (req, res) => {
    db.all(`
        SELECT s.*, 
               COUNT(c.id) as active_complaints
        FROM staff s 
        LEFT JOIN complaints c ON s.id = c.assigned_to AND c.status != 'resolved'
        WHERE s.is_active = 1
        GROUP BY s.id
        ORDER BY s.name
    `, (err, staff) => {
        if (err) {
            console.error('Staff fetch error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(staff);
    });
});

// Get all users (Admin only)
app.get('/api/admin/users', authenticateAdmin, (req, res) => {
    db.all(`
        SELECT u.id, u.email, u.name, u.student_id, u.role, u.created_at,
               COUNT(c.id) as total_complaints,
               COUNT(CASE WHEN c.status = 'pending' THEN 1 END) as pending_complaints
        FROM users u 
        LEFT JOIN complaints c ON u.id = c.user_id
        WHERE u.role = 'student'
        GROUP BY u.id
        ORDER BY u.created_at DESC
    `, (err, users) => {
        if (err) {
            console.error('Admin users fetch error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(users);
    });
});

// Admin dashboard statistics
app.get('/api/admin/stats', authenticateAdmin, (req, res) => {
    const queries = {
        totalComplaints: 'SELECT COUNT(*) as count FROM complaints',
        pendingComplaints: 'SELECT COUNT(*) as count FROM complaints WHERE status = "pending"',
        inProgressComplaints: 'SELECT COUNT(*) as count FROM complaints WHERE status = "in_progress"',
        resolvedComplaints: 'SELECT COUNT(*) as count FROM complaints WHERE status = "resolved"',
        unassignedComplaints: 'SELECT COUNT(*) as count FROM complaints WHERE assigned_to IS NULL',
        totalUsers: 'SELECT COUNT(*) as count FROM users WHERE role = "student"',
        activeStaff: 'SELECT COUNT(*) as count FROM staff WHERE is_active = 1',
        recentComplaints: `
            SELECT c.*, u.name as user_name, s.name as staff_name
            FROM complaints c 
            LEFT JOIN users u ON c.user_id = u.id 
            LEFT JOIN staff s ON c.assigned_to = s.id
            ORDER BY c.created_at DESC 
            LIMIT 5
        `
    };

    const stats = {};
    let completed = 0;
    const totalQueries = Object.keys(queries).length;

    Object.keys(queries).forEach(key => {
        if (key === 'recentComplaints') {
            db.all(queries[key], (err, result) => {
                if (!err) {
                    stats[key] = result;
                }
                completed++;
                if (completed === totalQueries) {
                    res.json(stats);
                }
            });
        } else {
            db.get(queries[key], (err, result) => {
                if (!err) {
                    stats[key] = result.count;
                }
                completed++;
                if (completed === totalQueries) {
                    res.json(stats);
                }
            });
        }
    });
});

// Get feedback for admin (Admin only)
app.get('/api/admin/feedback', authenticateAdmin, (req, res) => {
    const { complaint_id } = req.query;
    
    let query = `
        SELECT f.*, c.complaint_id, c.title, u.name as user_name, u.email as user_email
        FROM feedback f
        JOIN complaints c ON f.complaint_id = c.id
        JOIN users u ON f.user_id = u.id
        WHERE 1=1
    `;
    
    const params = [];
    
    if (complaint_id) {
        query += ' AND c.id = ?';
        params.push(complaint_id);
    }
    
    query += ' ORDER BY f.created_at DESC';

    db.all(query, params, (err, feedback) => {
        if (err) {
            console.error('Feedback fetch error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(feedback);
    });
});

// Get feedback summary/stats for admin
app.get('/api/admin/feedback/stats', authenticateAdmin, (req, res) => {
    const queries = {
        totalFeedback: 'SELECT COUNT(*) as count FROM feedback',
        averageRating: 'SELECT AVG(rating) as avg FROM feedback',
        ratingDistribution: `
            SELECT rating, COUNT(*) as count 
            FROM feedback 
            GROUP BY rating 
            ORDER BY rating DESC
        `,
        recentFeedback: `
            SELECT f.*, c.complaint_id, c.title, u.name as user_name
            FROM feedback f
            JOIN complaints c ON f.complaint_id = c.id
            JOIN users u ON f.user_id = u.id
            ORDER BY f.created_at DESC
            LIMIT 10
        `
    };

    const stats = {};
    let completed = 0;
    const totalQueries = Object.keys(queries).length;

    Object.keys(queries).forEach(key => {
        if (key === 'ratingDistribution' || key === 'recentFeedback') {
            db.all(queries[key], (err, result) => {
                if (!err) {
                    stats[key] = result;
                }
                completed++;
                if (completed === totalQueries) {
                    res.json(stats);
                }
            });
        } else {
            db.get(queries[key], (err, result) => {
                if (!err) {
                    stats[key] = key === 'averageRating' ? 
                        (result.avg ? parseFloat(result.avg).toFixed(1) : 0) : 
                        result.count;
                }
                completed++;
                if (completed === totalQueries) {
                    res.json(stats);
                }
            });
        }
    });
});

// Serve static files
app.use(express.static('.'));

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Complaint Tracker Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: SQLite (complaints.db)`);
    console.log(`📁 File uploads: /uploads directory`);
});

module.exports = app;
