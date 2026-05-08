require('dotenv').config();
const db = require('../db');

async function createAuditTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      username VARCHAR(255),
      action VARCHAR(50),
      entity VARCHAR(50),
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  try {
    console.log("Creating audit_logs table...");
    await db.run(query);
    console.log("Table created successfully.");
  } catch (err) {
    console.error("Error creating table:", err);
  } finally {
    process.exit(0);
  }
}

createAuditTable();
