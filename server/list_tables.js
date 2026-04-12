require('dotenv').config();
const db = require('./db');

async function listTables() {
  try {
    const tables = await db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log("Tables in public schema:");
    console.log(tables.map(t => t.table_name));

    for (const table of tables) {
        console.log(`\n--- ${table.table_name} columns ---`);
        const cols = await db.all(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table.table_name}'`);
        console.log(cols);
    }
  } catch (err) {
    console.error(err);
  }
}

listTables();
