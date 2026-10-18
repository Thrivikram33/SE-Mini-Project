
const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../.env")
});

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password:( process.env.DB_PASSWORD || "Baby@123"),
  database: process.env.DB_NAME || "railway_reservation",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
