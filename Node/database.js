var mysql = require("mysql2");

var connection = mysql.createConnection({
    host: 'localhost',
    database: 'nascon',
    user: 'root',
    password: 'password',
    port: 3305
})

module.exports = connection;