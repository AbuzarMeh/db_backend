var express = require("express");
const moment = require('moment');
var mysql = require("mysql2");
var app = express();
var connection = require('./database');
const bearerToken = require('express-bearer-token');
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken"); // Add missing JWT import
const { verifyToken, verifyAdmin, verifyRole } = require("./middleware/auth");
const SECRET_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozLCJlbWFpbCI6ImFkbWluQGFkbWluLmNvbSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc0NTMyODQzMCwiZXhwIjoxNzQ1MzMyMDMwfQ.fsF6kKidREhgQitmze2WdWTUmmdxQ6VFheORp36RptI";
var cors = require('cors')
app.use(cors())
app.use(express.json());
app.use(bearerToken());

app.use(cors({
  origin: 'http://localhost:5173', // allow your frontend origin
  credentials: true
}));

app.get('/', function (req, res) {
  return res.send("Welcome to our db Project");
});

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function generateTeamId() {
  return 'team-' + crypto.randomBytes(6).toString('hex'); // Generates a random 12-character team ID
}

// ----------- Table Creation (Unchanged) ------------------
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
      amount DECIMAL(10,2),
      FOREIGN KEY (user_id) REFERENCES user(user_id),
      FOREIGN KEY (sponsorship_id) REFERENCES sponsorship(id),
      FOREIGN KEY (accommodation_id) REFERENCES accommodation(accommodation_id)
    );`,

    // Judge
    `CREATE TABLE IF NOT EXISTS judge (
      judge_id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT,
      event_id INT,
      FOREIGN KEY (user_id) REFERENCES user(user_id),
      FOREIGN KEY (event_id) REFERENCES event(event_id)
    );`,

    // Score
    `CREATE TABLE IF NOT EXISTS score (
      score_id INT PRIMARY KEY AUTO_INCREMENT,
      team_id VARCHAR(100),
      event_round_id INT,
      score DECIMAL(5,2),
      FOREIGN KEY (event_round_id) REFERENCES event_round(event_round_id)
    );`,

    // Token 
    `
    CREATE TABLE IF NOT EXISTS tokens (
      token VARCHAR(255) PRIMARY KEY,
      user_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
    )`
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

// Add endpoint for fetching user registrations
app.get("/my-registrations", verifyToken, (req, res) => {
  const userId = req.user.user_id;

  const sql = `
    SELECT 
      p.participant_id, 
      p.payment_status,
      p.team_id,
      e.event_id,
      e.name AS event_name,
      e.category AS event_category,
      p.created_at AS registration_date
    FROM participant p
    JOIN event e ON p.event_id = e.event_id
    WHERE p.user_id = ?
  `;

  connection.query(sql, [userId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching registrations", error: err });
    }

    res.status(200).json({ registrations: results });
  });
});

// Add endpoint for admin to fetch pending payments
app.get("/pending-payments", verifyRole("admin"), (req, res) => {
  const sql = `
    SELECT 
      p.payment_id, 
      p.user_id,
      u.name AS user_name,
      u.email AS user_email,
      p.amount,
      p.account_number,
      p.date,
      p.team_id,
      e.name AS event_name,
      e.event_id
    FROM payment p
    JOIN user u ON p.user_id = u.user_id
    LEFT JOIN participant pa ON p.team_id = pa.team_id
    LEFT JOIN event e ON pa.event_id = e.event_id
    WHERE p.verified_status = FALSE
    GROUP BY p.payment_id
  `;

  connection.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching pending payments", error: err });
    }

    res.status(200).json({ payments: results });
  });
});

// Judge-related endpoints
app.get("/admin/judges/events", verifyRole("admin"), (req, res) => {
  const query = `
    SELECT e.event_id, e.name, e.category, u.name AS judge_name, j.judge_id
    FROM judge j
    JOIN event e ON j.event_id = e.event_id
    JOIN user u ON j.user_id = u.user_id
    ORDER BY e.name
  `;

  connection.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching judge assignments", error: err });
    }
    res.json({ events: results });
  });
});

// Get count of scores submitted by a judge
app.get("/judge/score-count", verifyRole("judge"), (req, res) => {
  const userId = req.user.user_id;
  
  const query = `
    SELECT COUNT(*) as count
    FROM score s
    JOIN event_round er ON s.event_round_id = er.event_round_id
    JOIN judge j ON er.event_id = j.event_id
    WHERE j.user_id = ?
  `;
  
  connection.query(query, [userId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching score count", error: err });
    }
    res.json({ count: results[0].count });
  });
});

// Get judge scoring history
app.get("/judge/scoring-history", verifyRole("judge"), (req, res) => {
  const userId = req.user.user_id;
  
  const query = `
    SELECT s.score_id, s.score, s.team_id, er.roundType, e.name AS event_name, e.event_id
    FROM score s
    JOIN event_round er ON s.event_round_id = er.event_round_id
    JOIN event e ON er.event_id = e.event_id
    JOIN judge j ON e.event_id = j.event_id
    WHERE j.user_id = ?
    ORDER BY s.score_id DESC
  `;
  
  connection.query(query, [userId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching scoring history", error: err });
    }
    res.json({ history: results });
  });
});

// Get previously submitted scores for a judge
app.get("/judge/scores/:eventId/:teamId", verifyRole("judge"), (req, res) => {
  const { eventId, teamId } = req.params;
  const userId = req.user.user_id;
  
  const query = `
    SELECT s.score_id, s.score, er.roundType, er.event_round_id
    FROM score s
    JOIN event_round er ON s.event_round_id = er.event_round_id
    JOIN judge j ON er.event_id = j.event_id
    WHERE er.event_id = ? AND s.team_id = ? AND j.user_id = ?
  `;
  
  connection.query(query, [eventId, teamId, userId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching scores", error: err });
    }
    res.json({ scores: results });
  });
});

// Get event results (for judges)
app.get("/judge/event/:eventId/results", verifyRole("judge"), (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.user_id;
  
  // First verify the judge is assigned to this event
  const verifyQuery = `
    SELECT * FROM judge WHERE user_id = ? AND event_id = ?
  `;
  
  connection.query(verifyQuery, [userId, eventId], (err, judges) => {
    if (err) {
      return res.status(500).json({ message: "Error verifying judge access", error: err });
    }
    
    if (judges.length === 0) {
      return res.status(403).json({ message: "Not authorized to view results for this event" });
    }
    
    // Get the results, grouped by team_id with average score
    const resultsQuery = `
      SELECT 
        p.team_id, 
        GROUP_CONCAT(DISTINCT u.name SEPARATOR ', ') as team_members,
        AVG(s.score) as average_score,
        COUNT(DISTINCT er.event_round_id) as rounds_completed
      FROM participant p
      JOIN user u ON p.user_id = u.user_id
      LEFT JOIN score s ON p.team_id = s.team_id
      LEFT JOIN event_round er ON s.event_round_id = er.event_round_id
      WHERE p.event_id = ?
      GROUP BY p.team_id
      ORDER BY average_score DESC
    `;
    
    connection.query(resultsQuery, [eventId], (err, results) => {
      if (err) {
        return res.status(500).json({ message: "Error fetching event results", error: err });
      }
      res.json({ results });
    });
  });
});

// ================= EVENT ENDPOINTS =================
// Get all events
app.get("/events", (req, res) => {
  const query = `
    SELECT e.*, u.name as organizer_name
    FROM event e
    JOIN user u ON e.organizer_id = u.user_id
    WHERE e.accepted = TRUE
  `;
  
  connection.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching events", error: err });
    }
    res.json({ events: results });
  });
});

// Create a new event
app.post("/event", verifyToken, (req, res) => {
  const { name, description, max_participants, registration_fee, category, rules, team_allowed, max_team_participants_limit } = req.body;
  const organizer_id = req.user.user_id;
  
  const query = `
    INSERT INTO event (name, description, max_participants, registration_fee, category, rules, team_allowed, max_team_participants_limit, organizer_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  connection.query(query, [name, description, max_participants, registration_fee, category, rules, team_allowed, max_team_participants_limit, organizer_id], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Error creating event", error: err });
    }
    res.status(201).json({ message: "Event created successfully", event_id: result.insertId });
  });
});

// Get event by ID
app.get("/event/:eventId", (req, res) => {
  const { eventId } = req.params;
  
  const query = `
    SELECT e.*, u.name as organizer_name
    FROM event e
    JOIN user u ON e.organizer_id = u.user_id
    WHERE e.event_id = ?
  `;
  
  connection.query(query, [eventId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching event", error: err });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }
    
    res.json({ event: results[0] });
  });
});

// Get event rounds
app.get("/event/:eventId/rounds", (req, res) => {
  const { eventId } = req.params;
  
  const query = `
    SELECT er.*, v.name as venue_name, v.location
    FROM event_round er
    JOIN venue v ON er.venue_id = v.venue_id
    WHERE er.event_id = ?
    ORDER BY er.date_time ASC
  `;
  
  connection.query(query, [eventId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching event rounds", error: err });
    }
    res.json({ rounds: results });
  });
});

// Accept an event (admin only)
app.put("/event/accept/:eventId", verifyRole("admin"), (req, res) => {
  const { eventId } = req.params;
  
  const query = "UPDATE event SET accepted = TRUE WHERE event_id = ?";
  
  connection.query(query, [eventId], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Error accepting event", error: err });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Event not found" });
    }
    
    res.json({ message: "Event accepted successfully" });
  });
});

// Reject an event (admin only)
app.put("/event/:eventId/reject", verifyRole("admin"), (req, res) => {
  const { eventId } = req.params;
  const { reason } = req.body;
  
  const query = "DELETE FROM event WHERE event_id = ?";
  
  connection.query(query, [eventId], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Error rejecting event", error: err });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Event not found" });
    }
    
    res.json({ message: "Event rejected and removed successfully" });
  });
});

// Get events created by the current organizer
app.get("/organizer-events", verifyToken, (req, res) => {
  const organizer_id = req.user.user_id;
  
  const query = `
    SELECT * FROM event 
    WHERE organizer_id = ?
  `;
  
  connection.query(query, [organizer_id], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching organizer events", error: err });
    }
    res.json({ events: results });
  });
});

// Add a new round to an event
app.post("/event-round/add", verifyToken, (req, res) => {
  const { event_id, roundType, date_time, venue_id } = req.body;
  
  // First verify if user is the organizer of this event or an admin
  const verifyQuery = `
    SELECT organizer_id FROM event WHERE event_id = ?
  `;
  
  connection.query(verifyQuery, [event_id], (err, events) => {
    if (err) {
      return res.status(500).json({ message: "Error verifying event ownership", error: err });
    }
    
    if (events.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }
    
    if (events[0].organizer_id !== req.user.user_id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Not authorized to add rounds to this event" });
    }
    
    const insertQuery = `
      INSERT INTO event_round (event_id, roundType, date_time, venue_id)
      VALUES (?, ?, ?, ?)
    `;
    
    connection.query(insertQuery, [event_id, roundType, date_time, venue_id], (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Error adding event round", error: err });
      }
      res.status(201).json({ message: "Event round added successfully", round_id: result.insertId });
    });
  });
});

// Get participants for an event
app.get("/participants/event/:eventId", verifyToken, (req, res) => {
  const { eventId } = req.params;
  
  const query = `
    SELECT p.participant_id, p.payment_status, p.team_id, u.name, u.email
    FROM participant p
    JOIN user u ON p.user_id = u.user_id
    WHERE p.event_id = ?
    ORDER BY p.team_id
  `;
  
  connection.query(query, [eventId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching participants", error: err });
    }
    res.json({ participants: results });
  });
});

// ================= PARTICIPANT AND REGISTRATION ENDPOINTS =================
// Register participants for an event (team or individual)
app.post("/add-participants", verifyToken, (req, res) => {
  const { event_id, team_members } = req.body;
  const user_id = req.user.user_id;
  
  // Check if event exists and allows registration
  const eventQuery = "SELECT * FROM event WHERE event_id = ? AND accepted = TRUE";
  
  connection.query(eventQuery, [event_id], (err, events) => {
    if (err) {
      return res.status(500).json({ message: "Error checking event", error: err });
    }
    
    if (events.length === 0) {
      return res.status(404).json({ message: "Event not found or not approved" });
    }
    
    // Generate a team ID for this registration
    const team_id = generateTeamId();
    
    // Register the main user
    const insertMainUser = `
      INSERT INTO participant (user_id, event_id, team_id)
      VALUES (?, ?, ?)
    `;
    
    connection.query(insertMainUser, [user_id, event_id, team_id], (err) => {
      if (err) {
        return res.status(500).json({ message: "Error registering main user", error: err });
      }
      
      // If there are team members and the event allows teams
      if (team_members && team_members.length > 0) {
        // Insert all team members
        const insertTeamMembers = `
          INSERT INTO participant (user_id, event_id, team_id)
          VALUES ?
        `;
        
        // Prepare values for bulk insert
        const values = team_members.map(member_id => [member_id, event_id, team_id]);
        
        connection.query(insertTeamMembers, [values], (err) => {
          if (err) {
            return res.status(500).json({ message: "Error registering team members", error: err });
          }
          
          res.status(201).json({ 
            message: "Registration successful", 
            team_id: team_id 
          });
        });
      } else {
        res.status(201).json({ 
          message: "Registration successful", 
          team_id: team_id 
        });
      }
    });
  });
});

// Check if user exists by email
app.post("/check-user-exists", (req, res) => {
  const { email } = req.body;
  
  const query = "SELECT user_id, name, email FROM user WHERE email = ?";
  
  connection.query(query, [email], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error checking user", error: err });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ exists: false });
    }
    
    res.json({ 
      exists: true, 
      user: {
        user_id: results[0].user_id,
        name: results[0].name,
        email: results[0].email
      } 
    });
  });
});

// ================= PAYMENT ENDPOINTS =================
// Add payment for event registration
app.post("/add-payment/event", verifyToken, (req, res) => {
  const { team_id, amount, account_number } = req.body;
  const user_id = req.user.user_id;
  
  const query = `
    INSERT INTO payment (user_id, payment_type, date, team_id, amount, account_number)
    VALUES (?, 'event', NOW(), ?, ?, ?)
  `;
  
  connection.query(query, [user_id, team_id, amount, account_number], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Error adding payment", error: err });
    }
    res.status(201).json({ message: "Payment added successfully", payment_id: result.insertId });
  });
});

// Verify payment (admin only)
app.post("/payment/verify", verifyRole("admin"), (req, res) => {
  const { payment_id } = req.body;
  
  connection.beginTransaction(err => {
    if (err) {
      return res.status(500).json({ message: "Error starting transaction", error: err });
    }
    
    // Update payment status
    const updatePayment = "UPDATE payment SET verified_status = TRUE WHERE payment_id = ?";
    
    connection.query(updatePayment, [payment_id], (err, result) => {
      if (err) {
        connection.rollback();
        return res.status(500).json({ message: "Error verifying payment", error: err });
      }
      
      if (result.affectedRows === 0) {
        connection.rollback();
        return res.status(404).json({ message: "Payment not found" });
      }
      
      // Get payment details to update other tables
      const getPayment = "SELECT * FROM payment WHERE payment_id = ?";
      
      connection.query(getPayment, [payment_id], (err, payments) => {
        if (err) {
          connection.rollback();
          return res.status(500).json({ message: "Error fetching payment details", error: err });
        }
        
        const payment = payments[0];
        
        // Handle different payment types
        if (payment.team_id) {
          // Update participants payment status
          const updateParticipants = "UPDATE participant SET payment_status = TRUE WHERE team_id = ?";
          
          connection.query(updateParticipants, [payment.team_id], (err) => {
            if (err) {
              connection.rollback();
              return res.status(500).json({ message: "Error updating participant payment status", error: err });
            }
            
            connection.commit(err => {
              if (err) {
                connection.rollback();
                return res.status(500).json({ message: "Error committing transaction", error: err });
              }
              
              res.json({ message: "Payment verified successfully" });
            });
          });
        } else if (payment.accommodation_id) {
          // Update accommodation payment status
          const updateAccommodation = "UPDATE accommodation SET payment_status = TRUE WHERE accommodation_id = ?";
          
          connection.query(updateAccommodation, [payment.accommodation_id], (err) => {
            if (err) {
              connection.rollback();
              return res.status(500).json({ message: "Error updating accommodation payment status", error: err });
            }
            
            connection.commit(err => {
              if (err) {
                connection.rollback();
                return res.status(500).json({ message: "Error committing transaction", error: err });
              }
              
              res.json({ message: "Payment verified successfully" });
            });
          });
        } else if (payment.sponsorship_id) {
          // Update sponsorship payment status
          const updateSponsorship = "UPDATE sponsorship SET payment_status = TRUE WHERE id = ?";
          
          connection.query(updateSponsorship, [payment.sponsorship_id], (err) => {
            if (err) {
              connection.rollback();
              return res.status(500).json({ message: "Error updating sponsorship payment status", error: err });
            }
            
            connection.commit(err => {
              if (err) {
                connection.rollback();
                return res.status(500).json({ message: "Error committing transaction", error: err });
              }
              
              res.json({ message: "Payment verified successfully" });
            });
          });
        } else {
          connection.commit(err => {
            if (err) {
              connection.rollback();
              return res.status(500).json({ message: "Error committing transaction", error: err });
            }
            
            res.json({ message: "Payment verified successfully" });
          });
        }
      });
    });
  });
});

// Add payment for accommodation
app.post("/payment/accommodation", verifyToken, (req, res) => {
  const { accommodation_id, amount, account_number } = req.body;
  const user_id = req.user.user_id;
  
  const query = `
    INSERT INTO payment (user_id, payment_type, date, accommodation_id, amount, account_number)
    VALUES (?, 'accommodation', NOW(), ?, ?, ?)
  `;
  
  connection.query(query, [user_id, accommodation_id, amount, account_number], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Error adding accommodation payment", error: err });
    }
    res.status(201).json({ message: "Accommodation payment added successfully", payment_id: result.insertId });
  });
});

// Add sponsorship payment
app.post("/payment/add/sponsorship", verifyToken, (req, res) => {
  const { sponsorship_id, amount, account_number } = req.body;
  const user_id = req.user.user_id;
  
  const query = `
    INSERT INTO payment (user_id, payment_type, date, sponsorship_id, amount, account_number)
    VALUES (?, 'sponsorship', NOW(), ?, ?, ?)
  `;
  
  connection.query(query, [user_id, sponsorship_id, amount, account_number], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Error adding sponsorship payment", error: err });
    }
    res.status(201).json({ message: "Sponsorship payment added successfully", payment_id: result.insertId });
  });
});

// ================= AUTHENTICATION ENDPOINTS =================
// Register a new user
app.post("/register", async (req, res) => {
  const { name, email, password, contact, role } = req.body;
  
  try {
    // Check if user already exists
    connection.query("SELECT * FROM user WHERE email = ?", [email], async (err, results) => {
      if (err) {
        return res.status(500).json({ message: "Error checking user existence", error: err });
      }
      
      if (results.length > 0) {
        return res.status(400).json({ message: "User with this email already exists" });
      }
      
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Insert user
      const insertQuery = `
        INSERT INTO user (name, email, password, contact, role)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      connection.query(insertQuery, [name, email, hashedPassword, contact, role], (err, result) => {
        if (err) {
          return res.status(500).json({ message: "Error registering user", error: err });
        }
        
        // Generate token for user
        const token = generateToken();
        const user_id = result.insertId;
        
        // Store token in database
        connection.query(
          "INSERT INTO tokens (token, user_id) VALUES (?, ?)",
          [token, user_id],
          (err) => {
            if (err) {
              return res.status(500).json({ message: "Error storing user token", error: err });
            }
            
            // Create JWT token
            const jwtToken = jwt.sign(
              { user_id, email, role },
              SECRET_KEY,
              { expiresIn: "1h" }
            );
            
            res.status(201).json({
              message: "User registered successfully",
              user_id,
              token: jwtToken,
              role
            });
          }
        );
      });
    });
  } catch (error) {
    res.status(500).json({ message: "Error registering user", error: error.message });
  }
});

// User login
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  
  // Check if user exists
  connection.query("SELECT * FROM user WHERE email = ?", [email], async (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error during login", error: err });
    }
    
    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    
    const user = results[0];
    
    // Compare password
    try {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      
      // Generate token
      const token = generateToken();
      
      // Store token in database
      connection.query(
        "INSERT INTO tokens (token, user_id) VALUES (?, ?)",
        [token, user.user_id],
        (err) => {
          if (err) {
            return res.status(500).json({ message: "Error storing token", error: err });
          }
          
          // Create JWT token
          const jwtToken = jwt.sign(
            { user_id: user.user_id, email: user.email, role: user.role },
            SECRET_KEY,
            { expiresIn: "1h" }
          );
          
          res.json({
            message: "Login successful",
            user_id: user.user_id,
            name: user.name,
            role: user.role,
            token: jwtToken
          });
        }
      );
    } catch (error) {
      res.status(500).json({ message: "Error during login", error: error.message });
    }
  });
});

// Get user by email
app.get("/user/by-email", (req, res) => {
  const { email } = req.query;
  
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }
  
  const query = "SELECT user_id, name, email, role FROM user WHERE email = ?";
  
  connection.query(query, [email], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching user", error: err });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json({ user: results[0] });
  });
});

// ================= VENUE ENDPOINTS =================
// Get all venues
app.get("/venues", (req, res) => {
  connection.query("SELECT * FROM venue", (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching venues", error: err });
    }
    res.json({ venues: results });
  });
});

// Add a new venue (admin only)
app.post("/addVenue", verifyRole("admin"), (req, res) => {
  const { name, location, type, capacity } = req.body;
  
  const query = `
    INSERT INTO venue (name, location, type, capacity)
    VALUES (?, ?, ?, ?)
  `;
  
  connection.query(query, [name, location, type, capacity], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Error adding venue", error: err });
    }
    res.status(201).json({ message: "Venue added successfully", venue_id: result.insertId });
  });
});

// ================= JUDGE ENDPOINTS =================
// Get all judges (admin only)
app.get("/admin/judges", verifyRole("admin"), (req, res) => {
  const query = `
    SELECT u.user_id, u.name, u.email, u.contact
    FROM user u
    WHERE u.role = 'judge'
  `;
  
  connection.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching judges", error: err });
    }
    res.json({ judges: results });
  });
});

// Assign a judge to an event (admin only)
app.post("/admin/assign-judge", verifyRole("admin"), (req, res) => {
  const { user_id, event_id } = req.body;
  
  // Check if judge exists
  connection.query("SELECT * FROM user WHERE user_id = ? AND role = 'judge'", [user_id], (err, judges) => {
    if (err) {
      return res.status(500).json({ message: "Error checking judge", error: err });
    }
    
    if (judges.length === 0) {
      return res.status(404).json({ message: "Judge not found" });
    }
    
    // Check if event exists
    connection.query("SELECT * FROM event WHERE event_id = ?", [event_id], (err, events) => {
      if (err) {
        return res.status(500).json({ message: "Error checking event", error: err });
      }
      
      if (events.length === 0) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      // Check if assignment already exists
      connection.query(
        "SELECT * FROM judge WHERE user_id = ? AND event_id = ?",
        [user_id, event_id],
        (err, results) => {
          if (err) {
            return res.status(500).json({ message: "Error checking judge assignment", error: err });
          }
          
          if (results.length > 0) {
            return res.status(400).json({ message: "Judge is already assigned to this event" });
          }
          
          // Assign judge
          const insertQuery = "INSERT INTO judge (user_id, event_id) VALUES (?, ?)";
          
          connection.query(insertQuery, [user_id, event_id], (err, result) => {
            if (err) {
              return res.status(500).json({ message: "Error assigning judge", error: err });
            }
            res.status(201).json({ message: "Judge assigned successfully", judge_id: result.insertId });
          });
        }
      );
    });
  });
});

// Add a new judge (admin only)
app.post("/admin/judges/add", verifyRole("admin"), async (req, res) => {
  const { name, email, password, contact } = req.body;
  
  try {
    // Check if user already exists
    connection.query("SELECT * FROM user WHERE email = ?", [email], async (err, results) => {
      if (err) {
        return res.status(500).json({ message: "Error checking user existence", error: err });
      }
      
      if (results.length > 0) {
        return res.status(400).json({ message: "User with this email already exists" });
      }
      
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Insert user with judge role
      const insertQuery = `
        INSERT INTO user (name, email, password, contact, role)
        VALUES (?, ?, ?, ?, 'judge')
      `;
      
      connection.query(insertQuery, [name, email, hashedPassword, contact], (err, result) => {
        if (err) {
          return res.status(500).json({ message: "Error adding judge", error: err });
        }
        res.status(201).json({ message: "Judge added successfully", user_id: result.insertId });
      });
    });
  } catch (error) {
    res.status(500).json({ message: "Error adding judge", error: error.message });
  }
});

// Mark score for a participant (judge only)
app.post("/judge/mark-score", verifyRole("judge"), (req, res) => {
  const { team_id, event_round_id, score } = req.body;
  const judge_id = req.user.user_id;
  
  // Verify that the judge is assigned to this event
  const verifyQuery = `
    SELECT j.* FROM judge j
    JOIN event_round er ON j.event_id = er.event_id
    WHERE j.user_id = ? AND er.event_round_id = ?
  `;
  
  connection.query(verifyQuery, [judge_id, event_round_id], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error verifying judge assignment", error: err });
    }
    
    if (results.length === 0) {
      return res.status(403).json({ message: "Not authorized to score this event round" });
    }
    
    // Check if score already exists
    const checkQuery = "SELECT * FROM score WHERE team_id = ? AND event_round_id = ?";
    
    connection.query(checkQuery, [team_id, event_round_id], (err, scores) => {
      if (err) {
        return res.status(500).json({ message: "Error checking existing scores", error: err });
      }
      
      if (scores.length > 0) {
        // Update existing score
        const updateQuery = "UPDATE score SET score = ? WHERE team_id = ? AND event_round_id = ?";
        
        connection.query(updateQuery, [score, team_id, event_round_id], (err) => {
          if (err) {
            return res.status(500).json({ message: "Error updating score", error: err });
          }
          res.json({ message: "Score updated successfully" });
        });
      } else {
        // Insert new score
        const insertQuery = "INSERT INTO score (team_id, event_round_id, score) VALUES (?, ?, ?)";
        
        connection.query(insertQuery, [team_id, event_round_id, score], (err, result) => {
          if (err) {
            return res.status(500).json({ message: "Error marking score", error: err });
          }
          res.status(201).json({ message: "Score marked successfully", score_id: result.insertId });
        });
      }
    });
  });
});

// ================= ACCOMMODATION ENDPOINTS =================
// Get accommodation for a student
app.get("/student/accommodation", verifyToken, (req, res) => {
  const user_id = req.user.user_id;
  
  const query = "SELECT * FROM accommodation WHERE user_id = ?";
  
  connection.query(query, [user_id], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching accommodation", error: err });
    }
    res.json({ accommodations: results });
  });
});

// Request accommodation
app.post("/accommodation/request", verifyToken, (req, res) => {
  const { room_type } = req.body;
  const user_id = req.user.user_id;
  
  // Get cost based on room type
  let cost = 0;
  switch (room_type) {
    case 'single':
      cost = 1000;
      break;
    case 'double':
      cost = 750;
      break;
    case 'triple':
      cost = 500;
      break;
    default:
      cost = 0;
  }
  
  const query = `
    INSERT INTO accommodation (user_id, room_type, cost)
    VALUES (?, ?, ?)
  `;
  
  connection.query(query, [user_id, room_type, cost], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Error requesting accommodation", error: err });
    }
    res.status(201).json({ 
      message: "Accommodation requested successfully", 
      accommodation_id: result.insertId,
      cost: cost
    });
  });
});

// Accept accommodation request (admin only)
app.post("/accommodation/accept", verifyRole("admin"), (req, res) => {
  const { accommodation_id } = req.body;
  
  const query = "UPDATE accommodation SET assigned = TRUE WHERE accommodation_id = ?";
  
  connection.query(query, [accommodation_id], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Error accepting accommodation request", error: err });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Accommodation request not found" });
    }
    
    res.json({ message: "Accommodation request accepted" });
  });
});

// Get report on participants' accommodation (admin only)
app.get("/report/participants-accommodation", verifyRole("admin"), (req, res) => {
  const query = `
    SELECT a.*, u.name, u.email, u.contact
    FROM accommodation a
    JOIN user u ON a.user_id = u.user_id
    ORDER BY a.assigned, a.room_type
  `;
  
  connection.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error generating accommodation report", error: err });
    }
    res.json({ report: results });
  });
});

// ================= SPONSORSHIP ENDPOINTS =================
// Create a sponsorship package (admin only)
app.post("/sponsorship/package", verifyRole("admin"), (req, res) => {
  const { name, perks, price } = req.body;
  
  const query = `
    INSERT INTO sponsorship_package (name, perks, price)
    VALUES (?, ?, ?)
  `;
  
  connection.query(query, [name, perks, price], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Error creating sponsorship package", error: err });
    }
    res.status(201).json({ message: "Sponsorship package created successfully", package_id: result.insertId });
  });
});

// Get all sponsorship packages
app.get("/sponsorship/packages", (req, res) => {
  connection.query("SELECT * FROM sponsorship_package", (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching sponsorship packages", error: err });
    }
    res.json({ packages: results });
  });
});

// Get sponsorships for a sponsor
app.get("/sponsor/sponsorships", verifyToken, (req, res) => {
  const user_id = req.user.user_id;
  
  // Check if user is a sponsor
  connection.query("SELECT * FROM sponsor WHERE user_id = ?", [user_id], (err, sponsors) => {
    if (err) {
      return res.status(500).json({ message: "Error checking sponsor status", error: err });
    }
    
    if (sponsors.length === 0) {
      return res.status(404).json({ message: "Sponsor not found" });
    }
    
    const sponsor_id = sponsors[0].sponsor_id;
    
    // Get sponsorships
    const query = `
      SELECT s.*, sp.name, sp.perks, sp.price
      FROM sponsorship s
      JOIN sponsorship_package sp ON s.package_id = sp.package_id
      WHERE s.sponsor_id = ?
    `;
    
    connection.query(query, [sponsor_id], (err, results) => {
      if (err) {
        return res.status(500).json({ message: "Error fetching sponsorships", error: err });
      }
      res.json({ sponsorships: results });
    });
  });
});

app.listen(3000, () => {
  console.log(`Server is running on http://localhost:${3000}`);
});