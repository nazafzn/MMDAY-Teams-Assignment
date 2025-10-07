// server.js - Main backend server for QR Team Assignment System

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const QRCode = require('qrcode');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURATION - Customize your teams here!
// ============================================
const TEAMS = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'];

const TEAM_COLORS = {
  'Red': '#FF5252',
  'Blue': '#2196F3',
  'Green': '#4CAF50',
  'Yellow': '#FFEB3B',
  'Purple': '#9C27B0',
  'Orange': '#FF9800'
};

// ============================================
// DATABASE SETUP
// ============================================
const db = new sqlite3.Database('./teams.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('✓ Connected to SQLite database');
  }
});

// Create table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT UNIQUE NOT NULL,
    team TEXT NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Error creating table:', err);
  } else {
    console.log('✓ Database table ready');
  }
});

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json());
app.use(express.static('public'));

// ============================================
// ROUTES
// ============================================

// Home page - displays QR code generator dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Generate QR Code for the assignment page
app.get('/api/generate-qr', async (req, res) => {
  try {
    // Generate URL for the assignment page
    const assignmentUrl = `${req.protocol}://${req.get('host')}/assign`;
    
    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(assignmentUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    res.json({ 
      success: true, 
      qrCode: qrCodeDataUrl,
      url: assignmentUrl 
    });
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({ success: false, error: 'Failed to generate QR code' });
  }
});

// Assignment page - assigns team or retrieves existing assignment
app.get('/assign', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'assign.html'));
});

// API endpoint to get or create team assignment
app.post('/api/assign-team', (req, res) => {
  const { fingerprint } = req.body;
  
  if (!fingerprint) {
    return res.status(400).json({ success: false, error: 'Fingerprint required' });
  }

  // Check if user already has an assignment
  db.get(
    'SELECT team FROM assignments WHERE fingerprint = ?',
    [fingerprint],
    (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }

      // If assignment exists, return it
      if (row) {
        return res.json({
          success: true,
          team: row.team,
          color: TEAM_COLORS[row.team],
          isNewAssignment: false
        });
      }

      // Assign a random team
      const randomTeam = TEAMS[Math.floor(Math.random() * TEAMS.length)];

      // Store the assignment
      db.run(
        'INSERT INTO assignments (fingerprint, team) VALUES (?, ?)',
        [fingerprint, randomTeam],
        function(err) {
          if (err) {
            console.error('Error saving assignment:', err);
            return res.status(500).json({ success: false, error: 'Failed to save assignment' });
          }

          res.json({
            success: true,
            team: randomTeam,
            color: TEAM_COLORS[randomTeam],
            isNewAssignment: true
          });
        }
      );
    }
  );
});

// Get statistics (optional - for dashboard)
app.get('/api/stats', (req, res) => {
  db.all(
    'SELECT team, COUNT(*) as count FROM assignments GROUP BY team',
    [],
    (err, rows) => {
      if (err) {
        console.error('Error fetching stats:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }

      const stats = {};
      TEAMS.forEach(team => stats[team] = 0);
      rows.forEach(row => stats[row.team] = row.count);

      res.json({ success: true, stats });
    }
  );
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('=================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} to view dashboard`);
  console.log('=================================');
});

// shutdown cntrl C
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('\n✓ Database connection closed');
    }
    process.exit(0);
  });
});