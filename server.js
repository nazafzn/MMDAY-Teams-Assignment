// server.js - Backend for Team Assignment System
// This server handles user registration, team assignment, and data retrieval

const express = require('express');
const Database = require('better-sqlite3');
const QRCode = require('qrcode');
const path = require('path');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURATION - Customize your teams here!
// ============================================
const TEAMS = ['Red', 'Blue', 'Green', 'Yellow'];

// Color mapping for each team (for frontend display)
const TEAM_COLORS = {
  'Red': '#FF5252',
  'Blue': '#2196F3',
  'Green': '#4CAF50',
  'Yellow': '#FFEB3B'
};

// Emoji for each team
const TEAM_EMOJIS = {
  'Red': '🔴',
  'Blue': '🔵',
  'Green': '🟢',
  'Yellow': '🟡'
};

// ============================================
// DATABASE SETUP
// ============================================
// Initialize SQLite database (auto-creates file if doesn't exist)
const db = new Database('./teams.db');
console.log('✓ Connected to SQLite database');

// Create users table if it doesn't exist
// This table stores: id, name (unique), assigned_team, and timestamp
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    team TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('✓ Users table ready');

// Prepare database statements for better performance
// These are pre-compiled queries that execute faster
const getUserByName = db.prepare('SELECT * FROM users WHERE name = ?');
const createUser = db.prepare('INSERT INTO users (name, team) VALUES (?, ?)');
const getAllUsers = db.prepare('SELECT * FROM users ORDER BY created_at DESC');
const getTeamStats = db.prepare('SELECT team, COUNT(*) as count FROM users GROUP BY team');

// ============================================
// MIDDLEWARE
// ============================================
// Parse incoming JSON requests
app.use(express.json());

// Serve static files (HTML, CSS, JS) from the 'public' folder
app.use(express.static('public'));

// ============================================
// ROUTES
// ============================================

/**
 * GET /
 * Serves the main dashboard page with QR code
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * GET /api/generate-qr
 * Generates a QR code that points to the team assignment page
 * Returns: { success: boolean, qrCode: string (base64), url: string }
 */
app.get('/api/generate-qr', async (req, res) => {
  try {
    // Build the full URL for the assignment page
    const assignmentUrl = `${req.protocol}://${req.get('host')}/team`;

    // Generate QR code as a data URL (can be directly embedded in HTML)
    const qrCodeDataUrl = await QRCode.toDataURL(assignmentUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Return the QR code and URL
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

/**
 * GET /team
 * Serves the team assignment page (what users see when they scan the QR code)
 */
app.get('/team', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'team.html'));
});

/**
 * POST /api/assign-team
 * Handles user registration and team assignment
 * 
 * Request body: { name: string }
 * Response: { success: boolean, name: string, team: string, color: string, emoji: string, isNewUser: boolean }
 * 
 * Logic:
 * 1. If user exists in database, return their existing team
 * 2. If user is new, assign them a random team from TEAMS array
 * 3. Save new user to database
 */
app.post('/api/assign-team', (req, res) => {
  const { name } = req.body;

  // Validate that name was provided
  if (!name || name.trim() === '') {
    return res.status(400).json({ success: false, error: 'Name is required' });
  }

  // Sanitize the name (remove leading/trailing whitespace)
  const cleanName = name.trim();

  try {
    // Check if user already exists in database
    const existingUser = getUserByName.get(cleanName);

    // If user exists, return their original team assignment
    if (existingUser) {
      console.log(`✓ Returning existing user: ${cleanName} -> ${existingUser.team}`);
      return res.json({
        success: true,
        name: existingUser.name,
        team: existingUser.team,
        color: TEAM_COLORS[existingUser.team],
        emoji: TEAM_EMOJIS[existingUser.team],
        isNewUser: false
      });
    }

    // User is new: assign a random team
    // Math.random() returns 0-0.999, multiply by array length to get valid index
    const randomTeam = TEAMS[Math.floor(Math.random() * TEAMS.length)];

    // Save the new user to database
    try {
      createUser.run(cleanName, randomTeam);
      console.log(`✓ New user created: ${cleanName} -> ${randomTeam}`);

      res.json({
        success: true,
        name: cleanName,
        team: randomTeam,
        color: TEAM_COLORS[randomTeam],
        emoji: TEAM_EMOJIS[randomTeam],
        isNewUser: true
      });
    } catch (insertError) {
      console.error('Error saving user:', insertError);
      res.status(500).json({ success: false, error: 'Failed to save user' });
    }
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

/**
 * GET /api/stats
 * Returns statistics about team distribution
 * Useful for analytics and monitoring
 * 
 * Response: { success: boolean, stats: { teamName: count, ... } }
 */
app.get('/api/stats', (req, res) => {
  try {
    const rows = getTeamStats.all();

    // Initialize stats with 0 for all teams
    const stats = {};
    TEAMS.forEach(team => stats[team] = 0);

    // Populate with actual counts from database
    rows.forEach(row => stats[row.team] = row.count);

    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

/**
 * GET /admin
 * Simple admin panel to view all registered users
 * Shows: ID, Name, Team, Registration Date
 */
app.get('/admin', (req, res) => {
  try {
    const allUsers = getAllUsers.all();

    // Build HTML table with all users
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Admin Panel - User Registrations</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            padding: 30px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
          }
          .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          }
          h1 { 
            color: #333; 
            margin-bottom: 10px;
          }
          .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin: 30px 0;
          }
          .stat-box {
            padding: 20px;
            border-radius: 10px;
            color: white;
            text-align: center;
            font-weight: bold;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px;
          }
          th, td { 
            padding: 12px; 
            text-align: left; 
            border-bottom: 1px solid #ddd; 
          }
          th { 
            background: #667eea; 
            color: white;
          }
          tr:hover { 
            background: #f9f9f9; 
          }
          .team-badge { 
            padding: 5px 12px; 
            border-radius: 20px; 
            color: white; 
            font-weight: bold;
            display: inline-block;
          }
          .total {
            font-size: 1.2em;
            color: #667eea;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>👥 Registered Users</h1>
          <div class="total">Total Users: ${allUsers.length}</div>
          
          <h2>Team Distribution</h2>
          <div class="stats">
            ${(() => {
              const teamCounts = {};
              TEAMS.forEach(team => teamCounts[team] = 0);
              allUsers.forEach(u => teamCounts[u.team]++);
              
              return TEAMS.map(team => `
                <div class="stat-box" style="background: ${TEAM_COLORS[team]}">
                  ${TEAM_EMOJIS[team]} ${team}<br>
                  <strong>${teamCounts[team]}</strong>
                </div>
              `).join('');
            })()}
          </div>

          <h2>All Users</h2>
          <table>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Team</th>
              <th>Registered</th>
            </tr>
            ${allUsers.map((u, i) => `
              <tr>
                <td>${i + 1}</td>
                <td><strong>${u.name}</strong></td>
                <td>
                  <span class="team-badge" style="background: ${TEAM_COLORS[u.team]}">
                    ${TEAM_EMOJIS[u.team]} ${u.team}
                  </span>
                </td>
                <td>${new Date(u.created_at).toLocaleString()}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).send('Error loading admin panel');
  }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('=================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Dashboard: http://localhost:${PORT}`);
  console.log(`📊 Admin Panel: http://localhost:${PORT}/admin`);
  console.log('=================================');
});

// Graceful shutdown - close database connection on exit
process.on('SIGINT', () => {
  db.close();
  console.log('\n✓ Database connection closed');
  process.exit(0);
});