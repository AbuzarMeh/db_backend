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
app.get('/', function(req, res){
    return "Welcome to our db Project"
});

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

app.get("/create-tables", (req, res) => {
    const queries = [
  
      // User Table
      `CREATE TABLE IF NOT EXISTS user (
        user_id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        password VARCHAR(255),
        contact VARCHAR(20),
        role VARCHAR(50)
      );`,
  
      // Sponsor Table
      `CREATE TABLE IF NOT EXISTS sponsor (
        sponsor_id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        contact_id VARCHAR(100),
        contact_person VARCHAR(100),
        FOREIGN KEY (user_id) REFERENCES user(user_id)
      );`,
  
      // Sponsorship Packages
      `CREATE TABLE IF NOT EXISTS sponsorship_package (
        package_id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100),
        perks TEXT,
        price DECIMAL(10,2)
      );`,
  
      // Sponsorship
      `CREATE TABLE IF NOT EXISTS sponsorship (
        id INT PRIMARY KEY AUTO_INCREMENT,
        sponsor_id INT,
        package_id INT,
        payment_status BOOLEAN,
        FOREIGN KEY (sponsor_id) REFERENCES sponsor(sponsor_id),
        FOREIGN KEY (package_id) REFERENCES sponsorship_package(package_id)
      );`,
  
      // Venue
      `CREATE TABLE IF NOT EXISTS venue (
        venue_id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100),
        location VARCHAR(255),
        type VARCHAR(50),
        capacity INT
      );`,
  
      // Event
      `CREATE TABLE IF NOT EXISTS event (
        event_id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100),
        description TEXT,
        max_participants INT,
        registration_fee DECIMAL(10,2),
        category VARCHAR(50),
        rules TEXT,
        team_allowed BOOLEAN,
        max_team_participants_limit INT,
        organizer_id INT,
        accepted BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (organizer_id) REFERENCES user(user_id)
      );`,
  
      // Event Round
      `CREATE TABLE IF NOT EXISTS event_round (
        event_round_id INT PRIMARY KEY AUTO_INCREMENT,
        event_id INT,
        roundType VARCHAR(100),
        date_time DATETIME,
        venue_id INT,
        FOREIGN KEY (event_id) REFERENCES event(event_id),
        FOREIGN KEY (venue_id) REFERENCES venue(venue_id)
      );`,
  
      // Participants
      `CREATE TABLE IF NOT EXISTS participant (
        participant_id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        event_id INT,
        payment_status BOOLEAN DEFAULT FALSE,
        team_id VARCHAR(100),
        FOREIGN KEY (user_id) REFERENCES user(user_id),
        FOREIGN KEY (event_id) REFERENCES event(event_id)
      );`,
  
      // Accommodation
      `CREATE TABLE IF NOT EXISTS accommodation (
        accommodation_id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        room_type VARCHAR(50),
        cost DECIMAL(10,2),
        assigned BOOLEAN DEFAULT FALSE,
        payment_status BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (user_id) REFERENCES user(user_id)
      );`,
  
      // Payment
      `CREATE TABLE IF NOT EXISTS payment (
        payment_id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        payment_type VARCHAR(50),
        verified_status BOOLEAN DEFAULT FALSE,
        date DATETIME,
        sponsorship_id INT,
        accommodation_id INT,
        team_id VARCHAR(100),
        FOREIGN KEY (user_id) REFERENCES user(user_id),
        FOREIGN KEY (sponsorship_id) REFERENCES sponsorship(id),
        FOREIGN KEY (accommodation_id) REFERENCES accommodation(accommodation_id)
      );`,
  
      // Judge
      `CREATE TABLE IF NOT EXISTS judge (
        judge_id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        event_round_id INT,
        FOREIGN KEY (user_id) REFERENCES user(user_id),
        FOREIGN KEY (event_round_id) REFERENCES event_round(event_round_id)
      );`,
  
      // Score
      `CREATE TABLE IF NOT EXISTS score (
        score_id INT PRIMARY KEY AUTO_INCREMENT,
        team_id VARCHAR(100),
        event_round_id INT,
        score DECIMAL(5,2),
        FOREIGN KEY (event_round_id) REFERENCES event_round(event_round_id)
      );`
    ];
  
    // Execute all queries one by one
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
      )
    `;
  
    connection.query(createTableSQL, (err, result) => {
      if (err) {
        console.error("Error creating tokens table:", err);
        return res.status(500).json({ message: "Error creating tokens table", error: err });
      }
  
      res.status(201).json({ message: "Tokens table created successfully!" });
    });
  });





  
  





  app.post("/register", async (req, res) => {
    const { name, email, password, contact, role } = req.body;
  
    if (!name || !email || !password || !contact || !role) {
      return res.status(400).json({ message: "All fields are required." });
    }
  
    const checkQuery = "SELECT * FROM user WHERE email = ?";
    connection.query(checkQuery, [email], async (err, results) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
  
      if (results.length > 0) {
        return res.status(409).json({ message: "Email already registered." });
      }
  
      try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
  
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
  
      // Store token in DB
      connection.query("INSERT INTO tokens (token, user_id) VALUES (?, ?)", [token, user.user_id], (err) => {
        if (err) return res.status(500).json({ error: "Token storage error", err });
  
        res.json({ message: "Login successful", token }); // Send plain token
      });
    });
  });

  app.post("/addVenue", verifyAdmin, (req, res) => {
    const { name, location, type, capacity } = req.body;
  
    if (!name || !location || !type || !capacity) {
      return res.status(400).json({ error: "All fields are required." });
    }
  
    const sql = `INSERT INTO venue (name, location, type, capacity) VALUES (?, ?, ?, ?)`;
    connection.query(sql, [name, location, type, capacity], (err, result) => {
      if (err) {
        console.error("Error inserting venue:", err);
        return res.status(500).json({ error: "Database error." });
      }
      res.status(201).json({ message: "Venue added successfully!", venue_id: result.insertId });
    });
  });
  


app.listen(3000, function(){
    console.log('App listening on port 3000');
    connection.connect(function(err){
        if(err) throw err;
        console.log('Database connected Yayyyyy!');
});});