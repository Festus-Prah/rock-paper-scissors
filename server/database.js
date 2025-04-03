const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Define path to the database file relative to this file's location (inside server/)
const dbPath = path.join(__dirname, 'users.db');

// Create and export the database connection
// Use SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE for explicit creation
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('FATAL: Database connection error:', err.message);
        // Optionally exit the process if DB connection is critical
        process.exit(1);
    }
    console.log('[DB] Successfully connected to SQLite database:', dbPath);
});

// Run table creation logic immediately after connection
db.serialize(() => {
    // Users table: Stores basic info, tracks last visit and associated game
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        username TEXT NOT NULL,
        visit_time TEXT,
        game_id TEXT,
        UNIQUE(ip),    -- Ensure IP is unique
        UNIQUE(username) -- Ensure username is unique
    )`, (err) => {
        if (err) {
            console.error('[DB Error] Error creating users table:', err.message);
        } else {
             console.log('[DB] Users table verified/created.');
        }
    });

    // Games table: Tracks active online game rooms
    db.run(`CREATE TABLE IF NOT EXISTS games (
        game_id TEXT PRIMARY KEY NOT NULL,
        player1_ip TEXT,
        player2_ip TEXT,
        created_at TEXT,
        status TEXT DEFAULT 'waiting' -- 'waiting', 'active', 'finished', 'abandoned'
    )`, (err) => {
        if (err) {
            console.error('[DB Error] Error creating games table:', err.message);
        } else {
             console.log('[DB] Games table verified/created.');
        }
    });
});

// Export the database connection object
module.exports = db;