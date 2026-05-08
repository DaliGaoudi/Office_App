require('dotenv').config();
const db = require('../db');

async function addClientAliasesColumn() {
  try {
    await db.run(`ALTER TABLE admin_admin ADD COLUMN client_aliases TEXT`);
    console.log("Column client_aliases added successfully.");
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log("Column client_aliases already exists.");
    } else {
      console.error(err);
    }
  }
}

addClientAliasesColumn();
