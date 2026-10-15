const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function main() {
  const appPassword = process.env.RRS_APP_PASSWORD;
  if (!appPassword || !/^[A-Fa-f0-9]{64}$/.test(appPassword)) {
    throw new Error('Application password is missing or has an unexpected format.');
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    const [rows] = await connection.execute(
      'SELECT COUNT(*) AS accountCount FROM mysql.user WHERE User = ? AND Host = ?',
      ['railway_app', 'localhost'],
    );

    if (Number(rows[0].accountCount) !== 0) {
      throw new Error('railway_app already exists; refusing to change its password.');
    }

    // The generated password uses only letters and digits, so it is safe
    // to interpolate into this quoted MySQL account statement.
    await connection.query(
      "CREATE USER 'railway_app'@'localhost' IDENTIFIED BY '" + appPassword + "'",
    );
    await connection.query(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON `railway_reservation`.* TO 'railway_app'@'localhost'",
    );

    console.log('Application account created with database-scoped data privileges.');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Database account setup failed:', error.message);
  process.exitCode = 1;
});
