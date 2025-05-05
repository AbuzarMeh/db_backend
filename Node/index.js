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
    )`

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

app.post("/create-participant-trigger", (req, res) => {
  const triggerQuery = `
    DELIMITER $$

    CREATE TRIGGER close_registration_if_full
    AFTER INSERT ON participant
    FOR EACH ROW
    BEGIN
      DECLARE participant_count INT;
      DECLARE max_allowed INT;

      SELECT COUNT(*) INTO participant_count
      FROM participant
      WHERE event_id = NEW.event_id;

      SELECT max_participants INTO max_allowed
      FROM event
      WHERE event_id = NEW.event_id;

      IF participant_count >= max_allowed THEN
        UPDATE event
        SET accepted = FALSE
        WHERE event_id = NEW.event_id;
      END IF;
    END$$

    DELIMITER ;
  `;

  // Run the query
  connection.query(triggerQuery, (err, result) => {
    if (err) {
      console.error("❌ Error creating trigger:", err.message);
      return res.status(500).send(`Error: ${err.message}`);
    }
    res.send("✅ Trigger created successfully to close registration if event is full.");
  });
});

app.post('/create-trigger/setPaymentStatusTrue', (req, res) => {
  const createTriggerSql = `
          DELIMITER $$
        CREATE TRIGGER update_related_payment_status
        AFTER UPDATE ON payment
        FOR EACH ROW
        BEGIN
          -- Only run this if payment was just verified
          IF NEW.verified_status = TRUE AND OLD.verified_status = FALSE THEN

            -- If it's a sponsorship payment
            IF NEW.sponsorship_id IS NOT NULL THEN
              UPDATE sponsorship
              SET payment_status = TRUE
              WHERE id = NEW.sponsorship_id;

            -- If it's an accommodation payment
            ELSEIF NEW.accommodation_id IS NOT NULL THEN
              UPDATE accommodation
              SET payment_status = TRUE
              WHERE accommodation_id = NEW.accommodation_id;

            -- If it's a team/participant payment
            ELSEIF NEW.team_id IS NOT NULL THEN
              UPDATE participant
              SET payment_status = TRUE
              WHERE team_id = NEW.team_id ;
            END IF;
          END IF;
        END$$
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

app.post("/alter/event-table", (req, res) => {
  const sql = `
    ALTER TABLE event
    ADD COLUMN registration_open BOOLEAN DEFAULT TRUE;
  `;

  connection.query(sql, (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Error adding column to event table", error: err });
    }

    res.status(200).json({ message: "Column 'registration_open' added to event table successfully" });
  });
});

app.post("/create/scheduled/events", (req, res) => {
  const createEventQuery1 = `
    CREATE EVENT remove_unpaid_participants
    ON SCHEDULE EVERY 1 DAY
    STARTS '2025-05-04 00:00:00'
    DO
    BEGIN
      DELETE FROM participant
      WHERE payment_status = FALSE;
    END;
  `;

  const createEventQuery2 = `
    CREATE EVENT close_registration_2_days_left
    ON SCHEDULE EVERY 1 DAY
    STARTS '2025-05-04 00:00:00'
    DO
    BEGIN
      UPDATE event
      SET registration_open = FALSE
      WHERE registration_open = TRUE AND registration_deadline <= NOW() + INTERVAL 2 DAY;
    END;
  `;

  // Create the event to remove unpaid participants
  connection.query(createEventQuery1, (err1, result1) => {
    if (err1) {
      return res.status(500).json({ message: "Error creating event to remove unpaid participants", error: err1 });
    }

    // Create the event to close registration 2 days before the event round
    connection.query(createEventQuery2, (err2, result2) => {
      if (err2) {
        return res.status(500).json({ message: "Error creating event to close registration", error: err2 });
      }

      // Success response
      res.status(200).json({
        message: "Scheduled events for unpaid participants removal and event registration closure created successfully"
      });
    });
  });
});

app.post('/create/participant-trigger', (req, res) => {
  const createTriggerQuery = `
    DELIMITER $$

    CREATE TRIGGER close_registration_if_max_participants_reached
    AFTER INSERT ON participant
    FOR EACH ROW
    BEGIN
      -- Declare a variable to hold the current count of participants
      DECLARE participant_count INT;

      -- Get the current number of participants for the event
      SELECT COUNT(*) INTO participant_count
      FROM participant
      WHERE event_id = NEW.event_id;

      -- Get the max participants allowed for the event
      DECLARE max_participants INT;
      SELECT max_participants INTO max_participants
      FROM event
      WHERE event_id = NEW.event_id;

      -- If the participant count is greater than or equal to max participants, close registration
      IF participant_count >= max_participants THEN
        UPDATE event
        SET accepted = FALSE
        WHERE event_id = NEW.event_id;
      END IF;
    END $$

    DELIMITER ;
  `;

  // Execute the query to create the trigger
  connection.query(createTriggerQuery, (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Error creating trigger', error: err });
    }

    // Send success response if the query was successful
    res.status(200).json({ message: 'Trigger created successfully to close registration when max participants are reached' });
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
    connection.query(
      "INSERT INTO tokens (token, user_id) VALUES (?, ?)", 
      [token, user.user_id], 
      (err) => {
        if (err) return res.status(500).json({ error: "Token storage error", err });

        res.json({
          message: "Login successful",
          token,
          role: user.role // Include user role in response
        });
      }
    );
  });
});

app.post("/payment/verify", verifyRole("admin"), (req, res) => {
  const { payment_id } = req.body;

  if (!payment_id) {
    return res.status(400).json({ message: "payment_id is required" });
  }

  const sql = `
    UPDATE payment
    SET verified_status = true
    WHERE payment_id = ?
  `;

  connection.query(sql, [payment_id], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Failed to verify payment", error: err });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.status(200).json({ message: "Payment verified successfully" });
  });
});

app.get("/participants/event", verifyRole("admin"), (req, res) => {
  const sql = "SELECT * FROM participant_list_with_event";

  connection.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching participant list with event details", error: err });
    }

    res.status(200).json({
      message: "Participant list with event details",
      data: results
    });
  });
});

app.get("/participants/accommodation", verifyRole("admin"), (req, res) => {
  const sql = "SELECT * FROM participant_with_accommodation";

  connection.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching participant list with accommodation details", error: err });
    }

    res.status(200).json({
      message: "Participant list with accommodation details",
      data: results
    });
  });
});

app.post("/create/view/participant_event", verifyRole("admin"), (req, res) => {
  const createViewQuery = `
    CREATE VIEW IF NOT EXISTS participant_list_with_event AS
    SELECT 
      p.participant_id,
      u.name AS participant_name,
      u.email AS participant_email,
      e.name AS event_name,
      e.category AS event_category,
      p.team_id,
      p.payment_status AS participant_payment_status
    FROM participant p
    INNER JOIN user u ON p.user_id = u.user_id
    INNER JOIN event e ON p.event_id = e.event_id;
  `;

  connection.query(createViewQuery, (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Error creating view for participant list with event", error: err });
    }

    res.status(200).json({
      message: "View for participant list with event created successfully"
    });
  });
});


app.post("/create/view/participant_accommodation", verifyRole("admin"), (req, res) => {
  const createViewQuery = `
    CREATE VIEW IF NOT EXISTS participant_with_accommodation AS
    SELECT 
      p.participant_id,
      u.name AS participant_name,
      u.email AS participant_email,
      a.room_type,
      a.cost AS accommodation_cost,
      a.payment_status AS accommodation_payment_status,
      p.team_id
    FROM participant p
    INNER JOIN user u ON p.user_id = u.user_id
    LEFT JOIN accommodation a ON p.user_id = a.user_id;
  `;

  connection.query(createViewQuery, (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Error creating view for participant list with accommodation", error: err });
    }

    res.status(200).json({
      message: "View for participant list with accommodation created successfully"
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

app.get("/venues", (req, res) => {
  const query = `SELECT * FROM venue`;
  connection.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching venues:", err);
      return res.status(500).json({ message: "Error fetching venues", error: err });
    }
    res.json(results);
  });
});

app.get("/booked-venues", (req, res) => {
  const query = `
    SELECT 
      v.venue_id,
      v.name AS venue_name,
      v.location,
      v.type,
      v.capacity,
      er.event_round_id,
      er.date_time,
      e.name AS event_name,
      e.event_id
    FROM event_round er
    INNER JOIN venue v ON er.venue_id = v.venue_id
    INNER JOIN event e ON er.event_id = e.event_id
    ORDER BY er.date_time ASC
  `;

  connection.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching booked venue instances:", err);
      return res.status(500).json({ message: "Error fetching booked venues", error: err });
    }
    res.json(results);
  });
});


// --------------------------------- EVENT ------------------------------// 

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

app.post('/add-participants', verifyRole('student'), (req, res) => {
  const { emails, event_id } = req.body;
  const user_id = req.user.user_id;

  if (!emails || !event_id) {
    return res.status(400).json({ message: "Emails and event_id are required" });
  }


  // 1. Check if event is accepted
  const checkEventSql = `SELECT accepted FROM event WHERE event_id = ?`;
  connection.query(checkEventSql, [event_id], (err, result) => {
    if (err) return res.status(500).json({ message: 'Database error', error: err });
    if (result.length === 0) return res.status(404).json({ message: 'Event not found' });
    if (result[0].accepted !== 1) return res.status(403).json({ message: 'Event not approved by admin' });

    const team_id = generateTeamId();
    const values = [[user_id, event_id, false, team_id]];

    if (emails.length === 0) {
      // Only the current user is joining
      insertParticipants(values, res, team_id);
    } else {
      // 2. Get user IDs from emails
      const placeholders = emails.map(() => '?').join(',');
      const getUsersSql = `SELECT user_id FROM user WHERE email IN (${placeholders})`;

      connection.query(getUsersSql, emails, (userErr, users) => {
        if (userErr) return res.status(500).json({ message: 'Error fetching users', error: userErr });
        if (users.length !== emails.length) {
          return res.status(400).json({ message: 'Some emails do not exist in the system' });
        }

        users.forEach(user => {
          values.push([user.user_id, event_id, false, team_id]);
        });

        insertParticipants(values, res, team_id);
      });
    }
  });
});

// Helper function to insert participants
function insertParticipants(values, res, team_id) {
  const insertSql = `
    INSERT INTO participant (user_id, event_id, payment_status, team_id)
    VALUES ?
  `;
  connection.query(insertSql, [values], (insertErr, result) => {
    if (insertErr) {
      return res.status(500).json({ message: 'Error inserting participants', error: insertErr });
    }
    return res.status(201).json({
      message: 'Participants added successfully',
      team_id,
      inserted_count: result.affectedRows
    });
  });
}

app.post('/add-payment/event', verifyRole('student'), (req, res) => {
  const { payment_type, event_id, account_number , amount } = req.body;  // Added account_number to the request body
  const user_id = req.user.user_id; // Assuming user_id is added to req.user by your verifyRole middleware

  if (!payment_type || !event_id || !account_number) {
    return res.status(400).json({ message: 'Payment type, event ID, and account number are required' });
  }

  // Step 1: Find the team_id for the given user_id and event_id
  const sqlFindTeam = `
    SELECT team_id
    FROM participant
    WHERE user_id = ? AND event_id = ?
  `;

  connection.query(sqlFindTeam, [user_id, event_id], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Error fetching participant', error: err });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'User is not participating in the event' });
    }

    const team_id = results[0].team_id;

    // Step 2: Insert the payment record into the payment table
    const sqlInsertPayment = `
      INSERT INTO payment (user_id, payment_type, date, sponsorship_id, accommodation_id, team_id, account_number , amount )
      VALUES (?, ?, NOW(), ?, ?, ?, ?)
    `;

    connection.query(
      sqlInsertPayment,
      [user_id, payment_type, null, null, team_id, account_number , amount],
      (err, result) => {
        if (err) {
          return res.status(500).json({ message: 'Error inserting payment', error: err });
        }

        return res.status(201).json({
          message: 'Payment added successfully',
          payment_id: result.insertId
        });
      }
    );
  });
});

app.get("/participants/event/:event_id", (req, res) => {
  const { event_id } = req.params;

  const sql = `
    SELECT 
      participant.participant_id,
      participant.team_id,
      user.user_id,
      user.name,
      user.email,
      participant.payment_status
    FROM participant
    JOIN user ON participant.user_id = user.user_id
    WHERE participant.event_id = ?
  `;

  connection.query(sql, [event_id], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Failed to retrieve participants", error: err });
    }

    res.status(200).json({ participants: results });
  });
});

app.get("/organizer-events", (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Missing Authorization header" });
  }

  const token = authHeader.split(" ")[1]; // Expecting format: Bearer <token>

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const organizerId = decoded.user_id; // Assuming token includes { user_id: ... }

    const query = `
      SELECT * FROM event
      WHERE organizer_id = ?
    `;

    connection.query(query, [organizerId], (err, results) => {
      if (err) {
        console.error("Error fetching organizer's events:", err);
        return res.status(500).json({ message: "Error fetching events", error: err });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "No events found for this organizer" });
      }

      res.json(results);
    });

  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token", error: err });
  }
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
  const { payment_type, sponsorship_id, account_number , amount } = req.body;

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
          INSERT INTO payment (user_id, payment_type, verified_status, date, sponsorship_id, account_number , amount)
          VALUES (?, ?, false, ?, ?, ?)
      `;
      const now = moment().format("YYYY-MM-DD HH:mm:ss");  // Using moment here
      connection.query(insertSql, [req.user.user_id, payment_type, now, sponsorship_id, account_number,amount], (err, result) => {
          if (err) return res.status(500).json({ message: "Payment failed", error: err });

          res.status(201).json({ message: "Payment added successfully", payment_id: result.insertId });
      });
  });
});

app.get("/sponsorship/funds", verifyRole("admin"), async (req, res) => {
  try {
    // Total sponsorship
    const totalQuery = `
      SELECT SUM(amount) AS total_funds
      FROM payment
      WHERE sponsorship_id is NOT NULL AND verified_status = TRUE
    `;

    // Sponsor-wise breakdown
    const breakdownQuery = `
      SELECT sp.sponsor_id, sp.contact_person AS sponsor_name, SUM(p.amount) AS sponsor_total
      FROM payment p
      JOIN sponsorship s ON p.sponsorship_id = s.id
      JOIN sponsor sp ON s.sponsor_id = sp.sponsor_id
      WHERE sponsorship_id is NOT NULL AND p.verified_status = TRUE
      GROUP BY sp.sponsor_id, sp.contact_person
    `;

    connection.query(totalQuery, (err, totalResult) => {
      if (err) {
        return res.status(500).json({ message: "Error fetching total sponsorship funds", error: err });
      }

      connection.query(breakdownQuery, (err2, breakdownResult) => {
        if (err2) {
          return res.status(500).json({ message: "Error fetching sponsor-wise totals", error: err2 });
        }

        res.status(200).json({
          total_sponsorship_funds: totalResult[0].total_funds || 0,
          sponsor_breakdown: breakdownResult,
        });
      });
    });

  } catch (error) {
    res.status(500).json({ message: "Unexpected error", error });
  }
});


app.get("/report/sponsorships", verifyRole("admin"), (req, res) => {
  const sql = `
    SELECT 
      sp.sponsor_id,
      sp.contact_person AS sponsor_name,
      s.id AS sponsorship_id,
      s.payment_status AS sponsorship_status,
      p.payment_id,
      p.verified_status AS payment_verified,
      p.date AS payment_date,
      p.amount AS payment_amount
    FROM sponsorship s
    INNER JOIN sponsor sp ON s.sponsor_id = sp.sponsor_id
    INNER JOIN payment p ON p.sponsorship_id = s.id
    WHERE p.sponsorship_id is NOT NULL 
  `;

  connection.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error fetching sponsorship report", error: err });
    }

    res.status(200).json({
      message: "Sponsorship details with payment information",
      data: results
    });
  });
});





//------------------------------------ACCOMODATION -------------------------------/ 



app.post("/accommodation/request", verifyRole("student"), (req, res) => {
  const { room_type, cost } = req.body;

  if (!room_type || !cost) {
    return res.status(400).json({ message: "room_type and cost are required" });
  }

  const sql = `
    INSERT INTO accommodation (user_id, room_type, cost, assigned, payment_status)
    VALUES (?, ?, ?, false, false)
  `;

  connection.query(
    sql,
    [req.user.user_id, room_type, cost],
    (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Accommodation request failed", error: err });
      }

      res.status(201).json({
        message: "Accommodation request submitted",
        accommodation_id: result.insertId
      });
    }
  );
});

app.post("/accommodation/accept", verifyRole("admin"), (req, res) => {
  const { accommodation_id } = req.body;

  if (!accommodation_id) {
    return res.status(400).json({ message: "accommodation_id is required" });
  }

  const sql = `
    UPDATE accommodation
    SET assigned = true
    WHERE accommodation_id = ?
  `;

  connection.query(sql, [accommodation_id], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Failed to accept accommodation", error: err });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Accommodation request not found" });
    }

    res.status(200).json({ message: "Accommodation request accepted successfully" });
  });
});

app.post("/payment/accommodation", verifyRole("student"), (req, res) => {
  const { accommodation_id, amount } = req.body;

  if (!accommodation_id || !amount) {
    return res.status(400).json({ message: "accommodation_id and amount are required" });
  }

  const sql = `
    INSERT INTO payment (
      user_id,
      payment_type,
      verified_status,
      date,
      accommodation_id,
      amount
    ) VALUES (?, 'accommodation', false, NOW(), ?, ?)
  `;

  connection.query(
    sql,
    [req.user.user_id, accommodation_id, amount],
    (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Failed to process accommodation payment", error: err });
      }

      res.status(201).json({
        message: "Accommodation payment submitted for verification",
        payment_id: result.insertId
      });
    }
  );
});

app.get("/report/participants-accommodation", verifyRole("admin"), (req, res) => {
  const sql = `
    SELECT 
      u.user_id,
      u.name AS participant_name,
      a.accommodation_id,
      a.room_type,
      a.cost,
      a.assigned,
      a.payment_status
    FROM participant p
    INNER JOIN user u ON p.user_id = u.user_id
    INNER JOIN accommodation a ON p.user_id = a.user_id
    WHERE a.assigned = TRUE
  `;

  connection.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Error generating report", error: err });
    }

    res.status(200).json({
      message: "Participants with assigned accommodations",
      data: results
    });
  });
});


//------------------------------------ Accomodations -------------------------------/ 

app.get("/admin/judges", verifyAdmin, (req, res) => {
  const query = `
    SELECT u.user_id, u.name, u.email
    FROM user u
    WHERE u.role = 'judge'
  `;

  connection.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching judges:", err);
      return res.status(500).json({ message: "Error fetching judges", error: err });
    }

    res.json(results);
  });
});

app.post("/admin/assign-judge", verifyAdmin, (req, res) => {
  const { user_id, event_id } = req.body;

  if (!user_id || !event_id) {
    return res.status(400).json({ message: "Missing user_id or event_id" });
  }

  const insertQuery = `
    INSERT INTO judge (user_id, event_id)
    VALUES (?, ?)
  `;

  connection.query(insertQuery, [user_id, event_id], (err, result) => {
    if (err) {
      console.error("Error assigning judge:", err);
      return res.status(500).json({ message: "Error assigning judge", error: err });
    }

    res.json({ message: "Judge assigned successfully", judge_id: result.insertId });
  });
});

app.post("/judge/mark-score", verifyRole('judge'), (req, res) => {
  const { team_id, event_round_id, score } = req.body;

  if (!team_id || !event_round_id || score === undefined) {
    return res.status(400).json({ message: "Missing required fields: team_id, event_round_id, score" });
  }

  const insertQuery = `
    INSERT INTO score (team_id, event_round_id, score)
    VALUES (?, ?, ?)
  `;

  connection.query(insertQuery, [team_id, event_round_id, score], (err, result) => {
    if (err) {
      console.error("Error marking score:", err);
      return res.status(500).json({ message: "Error saving score", error: err });
    }

    res.json({ message: "Score marked successfully", score_id: result.insertId });
  });
});



app.listen(3000, () => {
  console.log(`Server is running on http://localhost:${3000}`);
});