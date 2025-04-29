var mysql = require("mysql2");

var connection = mysql.createConnection({
    host: 'localhost',
    database: 'nascon',
    user: 'root',
    password: 'abuzar@1234'
})

module.exports = connection;