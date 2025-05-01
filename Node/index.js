var express = require("express");
const moment = require('moment');
var mysql = require("mysql2");
var app = express();
var connection = require('./database');
const bearerToken = require('express-bearer-token');
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { verifyToken, verifyAdmin, verifyRole } = require("./middleware/auth");
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

app.post('/create-trigger/checkVenueAvailabilityBeforeInsert', (req, res) => {
  const createTriggerSql = `
      -- Change the delimiter to $$ temporarily
      DELIMITER $$

      CREATE TRIGGER check_venue_availability_before_insert
      BEFORE INSERT ON event_round
      FOR EACH ROW
      BEGIN
          -- Declare the variable to store the count of bookings
          DECLARE venue_count INT;

          -- Check if the venue is already booked at the selected date and time
          SELECT COUNT(*) INTO venue_count
          FROM event_round
          WHERE venue_id = NEW.venue_id
            AND DATE(NEW.date_time) = DATE(date_time)  -- Compare only the date part
            AND TIME(NEW.date_time) BETWEEN TIME(date_time) AND ADDTIME(TIME(date_time), '02:00:00'); -- Assuming a 2-hour round duration

          -- If the venue is already booked, throw an error
          IF venue_count > 0 THEN
              SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The venue is already booked for this date and time.';
          END IF;
      END $$

      -- Reset the delimiter to the default semicolon
      DELIMITER ;
  `;

  // Execute the query to create the trigger
  connection.query(createTriggerSql, (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Error creating trigger', error: err });
    }
    res.status(200).json({ message: 'Trigger created successfully', result });
  });
});

app.post("/alter-event-add-status", (req, res) => {
  const sql = `
      ALTER TABLE event
      ADD COLUMN status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending'
  `;

  connection.query(sql, (err, result) => {
      if (err) {
          // Column might already exist, return meaningful error
          if (err.code === "ER_DUP_FIELDNAME") {
              return res.status(400).json({ message: "Column 'status' already exists" });
          }
          return res.status(500).json({ message: "Failed to alter event table", error: err });
      }

      res.status(200).json({ message: "Column 'status' added to event table successfully" });
  });
});

app.post("/alter-payment-account", (req, res) => {
  const sql = `
      ALTER TABLE payment
      ADD COLUMN account_number VARCHAR(100) NOT NULL;
  `;

  connection.query(sql, (err, result) => {
      if (err) {
          // Column might already exist, return meaningful error
          if (err.code === "ER_DUP_FIELDNAME") {
              return res.status(400).json({ message: "Column 'account_number' already exists" });
          }
          return res.status(500).json({ message: "Failed to alter payment table", error: err });
      }

      res.status(200).json({ message: "Column 'account_number' added to event table successfully" });
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

app.post("/sponsor/add", (req, res) => {
  const { user_id, contact_id, contact_person } = req.body;

  if (!user_id || !contact_id || !contact_person) {
      return res.status(400).json({ message: "All fields (user_id, contact_id, contact_person) are required" });
  }

  const sql = `
      INSERT INTO sponsor (user_id, contact_id, contact_person)
      VALUES (?, ?, ?)
  `;

  connection.query(sql, [user_id, contact_id, contact_person], (err, result) => {
      if (err) {
          return res.status(500).json({ message: "Failed to add sponsor", error: err });
      }

      res.status(201).json({ message: "Sponsor added successfully", sponsor_id: result.insertId });
  });
});


// 🌟 EVENT MANAGEMENT MODULE 🌟

app.post("/event", verifyRole("organizer"), (req, res) => {
  const {
      name,
      description,
      max_participants,
      registration_fee,
      category,
      rules,
      team_allowed,
      max_team_participants_limit
  } = req.body;

  // Validate all required fields
  if (
      !name || !description || max_participants == null ||
      registration_fee == null || !category || !rules ||
      team_allowed == null || max_team_participants_limit == null
  ) {
      return res.status(400).json({ message: "All fields are required." });
  }

  const organizer_id = req.user.user_id; // Extract from verified token

  const sql = `
      INSERT INTO event (
          name, description, max_participants, registration_fee,
          category, rules, team_allowed, max_team_participants_limit, organizer_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
      name,
      description,
      max_participants,
      registration_fee,
      category,
      rules,
      team_allowed,
      max_team_participants_limit,
      organizer_id
  ];

  connection.query(sql, values, (err, result) => {
      if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Error creating event.", error: err });
      }

      res.status(201).json({
          message: "Event created successfully.",
          event_id: result.insertId
      });
  });
});

app.post("/event-round/add", verifyRole("organizer"), (req, res) => {
  const { event_id, roundType, date_time, venue_id } = req.body;

  if (!event_id || !roundType || !date_time || !venue_id) {
    return res.status(400).json({ message: "Event ID, round type, date/time, and venue ID are required" });
  }

  // Step 1: Try inserting the new event round (this will trigger the check for venue availability)
  const insertSql = `
    INSERT INTO event_round (event_id, roundType, date_time, venue_id)
    VALUES (?, ?, ?, ?)
  `;

  connection.query(insertSql, [event_id, roundType, date_time, venue_id], (err, result) => {
    if (err) {
      // Check if the error is related to the venue conflict
      if (err.code === '45000') {
        return res.status(400).json({ message: err.message });
      }
      return res.status(500).json({ message: "Failed to add event round", error: err });
    }

    res.status(201).json({ message: "Event round added successfully", event_round_id: result.insertId });
  });
});

app.get("/events", (req, res) => {
  const sql = `
      SELECT 
          e.*, 
          u.name AS organizer_name, 
          u.email AS organizer_email 
      FROM event e 
      JOIN user u ON e.organizer_id = u.user_id
  `;
  connection.query(sql, (err, results) => {
      if (err) return res.status(500).json({ message: "Error fetching events", error: err });
      res.status(200).json({ events: results });
  });
});

app.get("/events/accepted" , (req, res) => {
  const sql = `
      SELECT 
          e.*, 
          u.name AS organizer_name, 
          u.email AS organizer_email 
      FROM event e 
      JOIN user u ON e.organizer_id = u.user_id
      WHERE e.accepted = TRUE
  `;
  connection.query(sql, (err, results) => {
      if (err) return res.status(500).json({ message: "Error fetching accepted events", error: err });
      res.status(200).json({ accepted_events: results });
  });
});

app.get("/event/:eventId/rounds", (req, res) => {
  const { eventId } = req.params;
  const sql = `
      SELECT 
          er.*, 
          v.name AS venue_name, 
          v.location AS venue_location, 
          v.capacity 
      FROM event_round er
      JOIN venue v ON er.venue_id = v.venue_id
      WHERE er.event_id = ?
  `;
  connection.query(sql, [eventId], (err, results) => {
      if (err) return res.status(500).json({ message: "Error fetching event rounds", error: err });
      res.status(200).json({ event_rounds: results });
  });
});

app.post("/event/accept/:event_id", verifyAdmin, (req, res) => {
  const { event_id } = req.params;

  const sql = `
      UPDATE event
      SET status = 'accepted', accepted = 1
      WHERE event_id = ?
  `;

  connection.query(sql, [event_id], (err, result) => {
      if (err) {
          return res.status(500).json({ message: "Failed to accept event", error: err });
      }
      if (result.affectedRows === 0) {
          return res.status(404).json({ message: "Event not found" });
      }

      res.status(200).json({ message: "Event accepted successfully" });
  });
});


app.put("/event/:eventId/reject", verifyAdmin, (req, res) => {
  const { eventId } = req.params;

  const sql = `
      UPDATE event
      SET status = 'accepted', accepted = 0
      WHERE event_id = ?
  `;

  connection.query(sql, [eventId], (err, result) => {
      if (err) {
          return res.status(500).json({ message: "Database error while rejecting event", error: err });
      }
      if (result.affectedRows === 0) {
          return res.status(404).json({ message: "Event not found" });
      }
      res.status(200).json({ message: "Event rejected successfully" });
  });
});




//---------------------------------SponsorShip ----------------------------------------------//

app.post("/sponsorship/package", verifyAdmin, (req, res) => {
  const { name, perks, price } = req.body;

  // Validate required fields
  if (!name || !perks || price === undefined) {
      return res.status(400).json({ message: "All fields (name, perks, price) are required." });
  }

  const sql = `
      INSERT INTO sponsorship_package (name, perks, price)
      VALUES (?, ?, ?)
  `;

  connection.query(sql, [name, perks, price], (err, result) => {
      if (err) {
          return res.status(500).json({ message: "Failed to add sponsorship package", error: err });
      }

      res.status(201).json({
          message: "Sponsorship package added successfully",
          package_id: result.insertId
      });
  });
});

app.get("/sponsorship/packages", (req, res) => {
  const sql = `
      SELECT package_id, name, perks, price
      FROM sponsorship_package
  `;

  connection.query(sql, (err, results) => {
      if (err) {
          return res.status(500).json({ message: "Failed to fetch packages", error: err });
      }

      res.status(200).json({ packages: results });
  });
});

app.post("/sponsorship/add", verifyRole("sponsor"), (req, res) => {
  const { package_id, payment_status } = req.body;

  if (!package_id || typeof payment_status === 'undefined') {
      return res.status(400).json({ message: "package_id and payment_status are required" });
  }

  // Step 1: Get sponsor_id from user_id
  const getSponsorSql = `SELECT sponsor_id FROM sponsor WHERE user_id = ?`;
  connection.query(getSponsorSql, [req.user.user_id], (err, sponsorResults) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      if (sponsorResults.length === 0) return res.status(404).json({ message: "Sponsor not found" });

      const sponsor_id = sponsorResults[0].sponsor_id;

      // Step 2: Insert into sponsorship table
      const insertSql = `
          INSERT INTO sponsorship (sponsor_id, package_id, payment_status)
          VALUES (?, ?, ?)
      `;
      connection.query(insertSql, [sponsor_id, package_id, payment_status], (err, result) => {
          if (err) return res.status(500).json({ message: "Failed to add sponsorship", error: err });

          res.status(201).json({ message: "Sponsorship added successfully", sponsorship_id: result.insertId });
      });
  });
});

app.post("/payment/add/sponsorship", verifyRole("sponsor"), (req, res) => {
  const { payment_type, sponsorship_id, account_number } = req.body;

  if (!payment_type || !sponsorship_id || !account_number) {
      return res.status(400).json({ message: "payment_type, sponsorship_id, and account_number are required" });
  }

  // Step 1: Verify that the sponsorship_id belongs to this sponsor's user_id
  const checkSql = ` 
      SELECT s.id 
      FROM sponsorship s
      JOIN sponsor sp ON s.sponsor_id = sp.sponsor_id
      WHERE s.id = ? AND sp.user_id = ? 
  `;
  connection.query(checkSql, [sponsorship_id, req.user.user_id], (err, result) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      if (result.length === 0) {
          return res.status(403).json({ message: "Unauthorized: Sponsorship does not belong to you." });
      }

      // Step 2: Add payment with account number
      const insertSql = `
          INSERT INTO payment (user_id, payment_type, verified_status, date, sponsorship_id, account_number)
          VALUES (?, ?, false, ?, ?, ?)
      `;
      const now = moment().format("YYYY-MM-DD HH:mm:ss");  // Using moment here
      connection.query(insertSql, [req.user.user_id, payment_type, now, sponsorship_id, account_number], (err, result) => {
          if (err) return res.status(500).json({ message: "Payment failed", error: err });

          res.status(201).json({ message: "Payment added successfully", payment_id: result.insertId });
      });
  });
});



app.listen(3000, () => {
  console.log(`Server is running on http://localhost:${3000}`);
});