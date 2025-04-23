var connection = require('./../database'); 
const jwt = require('jsonwebtoken');
const SECRET_KEY = "ILIKEPLAYINGBASKETBALL12345678"; 

function verifyToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing or malformed token" });
    }

    const token = authHeader.split(" ")[1];
    const sql = `
      SELECT user.*, tokens.token FROM tokens
      JOIN user ON user.user_id = tokens.user_id
      WHERE tokens.token = ?
    `;

    connection.query(sql, [token], (err, results) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      if (results.length === 0) return res.status(403).json({ message: "Invalid or expired token" });

      req.user = results[0]; // Contains user info
      next();
    });
}

function verifyAdmin(req, res, next) {
    verifyToken(req, res, () => {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Admin access only" });
      }
      next();
    });
}

module.exports = { verifyAdmin };

