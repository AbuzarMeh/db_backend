var mysql = require("mysql2");

var connection = mysql.createConnection({
    host: 'localhost',
    database: 'nascon',
    user: 'root',
    password: ''
})

module.exports = connection;