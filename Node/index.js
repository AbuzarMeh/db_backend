var express = require("express");
var mysql = require("mysql2");
var app = express();
var connection = require('./database');
const bearerToken = require('express-bearer-token');
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const { verifyAdmin } = require("./middleware/auth");
const SECRET_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozLCJlbWFpbCI6ImFkbWluQGFkbWluLmNvbSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc0NTMyODQzMCwiZXhwIjoxNzQ1MzMyMDMwfQ.fsF6kKidREhgQitmze2WdWTUmmdxQ6VFheORp36RptI";

app.use(express.json());
app.use(bearerToken());

app.get('/', function (req, res) {
  return res.send("Welcome to our db Project");
});

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// ----------- Table Creation (Unchanged) ------------------
app.get("/create-tables", (req, res) => {
  const queries = [ /* all your table creation queries from before */ ];

  let successCount = 0;
  queries.forEach((query, index) => {
    connection.query(query, (err, result) => {
      if (err) {
        console.error(`❌ Error in query ${index + 1}:`, err.message);
        return res.status(500).send(`Failed at query ${index + 1}: ${err.message}`);
      }
      successCount++;
      if (successCount === queries.length) {
        res.send("✅ All tables created successfully!");
      }
    });
  });
});

app.post("/createTokensTable", (req, res) => {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS tokens (
      token VARCHAR(255) PRIMARY KEY,
      user_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
    )`;
  connection.query(createTableSQL, (err) => {
    if (err) return res.status(500).json({ message: "Error creating tokens table", error: err });
    res.status(201).json({ message: "Tokens table created successfully!" });
  });
});

// ----------- Authentication ------------------
app.post("/register", async (req, res) => {
  const { name, email, password, contact, role } = req.body;

  if (!name || !email || !password || !contact || !role) {
    return res.status(400).json({ message: "All fields are required." });
  }

  connection.query("SELECT * FROM user WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });

    if (results.length > 0) return res.status(409).json({ message: "Email already registered." });

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const insertQuery = `
        INSERT INTO user (name, email, password, contact, role)
        VALUES (?, ?, ?, ?, ?)
      `;
      connection.query(insertQuery, [name, email, hashedPassword, contact, role], (err, result) => {
        if (err) return res.status(500).json({ message: "Error inserting user", error: err });
        res.status(201).json({ message: "User registered successfully", user_id: result.insertId });
      });
    } catch (hashErr) {
      res.status(500).json({ message: "Password hashing failed", error: hashErr });
    }
  });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  connection.query("SELECT * FROM user WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (results.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = generateToken();
    connection.query("INSERT INTO tokens (token, user_id) VALUES (?, ?)", [token, user.user_id], (err) => {
      if (err) return res.status(500).json({ error: "Token storage error", err });
      res.json({ message: "Login successful", token });
    });
  });
});

// ----------- Admin: Add Venue ------------------
app.post("/addVenue", verifyAdmin, (req, res) => {
  const { name, location, type, capacity } = req.body;

  if (!name || !location || !type || !capacity) {
    return res.status(400).json({ error: "All fields are required." });
  }

  const sql = `INSERT INTO venue (name, location, type, capacity) VALUES (?, ?, ?, ?)`;
  connection.query(sql, [name, location, type, capacity], (err, result) => {
    if (err) return res.status(500).json({ error: "Database error." });
    res.status(201).json({ message: "Venue added successfully!", venue_id: result.insertId });
  });
});

// ==========================================================
//       🌟 EVENT MANAGEMENT MODULE BACKEND STARTS HERE
// ==========================================================

// Create an event
app.post("/event", (req, res) => {
  const {
    name, description, max_participants, registration_fee,
    category, rules, team_allowed, max_team_participants_limit,
    organizer_id
  } = req.body;

  const sql = `INSERT INTO event 
    (name, description, max_participants, registration_fee, category, rules, team_allowed, max_team_participants_limit, organizer_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  connection.query(sql, [
    name, description, max_participants, registration_fee,
    category, rules, team_allowed, max_team_participants_limit,
    organizer_id
  ], (err, result) => {
    if (err) return res.status(500).json({ error: "Error creating event", err });
    res.status(201).json({ message: "Event created", event_id: result.insertId });
  });
});

// Get all events
app.get("/events", (req, res) => {
  connection.query("SELECT * FROM event", (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(results);
  });
});

// Get single event
app.get("/event/:id", (req, res) => {
  const eventId = req.params.id;
  connection.query("SELECT * FROM event WHERE event_id = ?", [eventId], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (results.length === 0) return res.status(404).json({ message: "Event not found" });
    res.json(results[0]);
  });
});

// Register for an event
app.post("/register-event", (req, res) => {
  const { user_id, event_id, team_id } = req.body;
  if (!user_id || !event_id) return res.status(400).json({ message: "Required fields missing" });

  const sql = `INSERT INTO participant (user_id, event_id, team_id) VALUES (?, ?, ?)`;
  connection.query(sql, [user_id, event_id, team_id || null], (err, result) => {
    if (err) return res.status(500).json({ error: "Error registering participant", err });
    res.status(201).json({ message: "Registered successfully", participant_id: result.insertId });
  });
});

// Schedule a round
app.post("/event-round", (req, res) => {
  const { event_id, roundType, date_time, venue_id } = req.body;

  const sql = `INSERT INTO event_round (event_id, roundType, date_time, venue_id) VALUES (?, ?, ?, ?)`;
  connection.query(sql, [event_id, roundType, date_time, venue_id], (err, result) => {
    if (err) return res.status(500).json({ error: "Error creating round", err });
    res.status(201).json({ message: "Round scheduled", round_id: result.insertId });
  });
});

// Judge assigns score
app.post("/score", (req, res) => {
  const { team_id, event_round_id, score } = req.body;

  const sql = `INSERT INTO score (team_id, event_round_id, score) VALUES (?, ?, ?)`;
  connection.query(sql, [team_id, event_round_id, score], (err, result) => {
    if (err) return res.status(500).json({ error: "Error submitting score", err });
    res.status(201).json({ message: "Score submitted", score_id: result.insertId });
  });
});

// Get leaderboard
app.get("/leaderboard/:event_id", (req, res) => {
  const event_id = req.params.event_id;
  const sql = `
    SELECT s.team_id, AVG(s.score) as avg_score
    FROM score s
    JOIN event_round er ON s.event_round_id = er.event_round_id
    WHERE er.event_id = ?
    GROUP BY s.team_id
    ORDER BY avg_score DESC
    LIMIT 3
  `;
  connection.query(sql, [event_id], (err, results) => {
    if (err) return res.status(500).json({ error: "Error fetching leaderboard", err });
    res.json({ winners: results });
  });
});

// ==========================================================
//       🌟 EVENT MANAGEMENT MODULE ENDS HERE
// ==========================================================

app.listen(3000, function () {
  console.log('App listening on port 3000');
  connection.connect(function (err) {
    if (err) throw err;
    console.log('Database connected Yayyyyy!');
  });
});
