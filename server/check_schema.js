require('dotenv').config();
const db = require('./db');

async function checkSchema() {
  try {
    console.log("--- registre table ---");
    const registreCols = await db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'registre'");
    console.log(registreCols);

    console.log("\n--- execution table ---");
    const executionCols = await db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'execution'");
    console.log(executionCols);

    console.log("\n--- execution_actions table (if exists) ---");
    try {
      const actionCols = await db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'execution_actions'");
      console.log(actionCols);
    } catch(e) {
      console.log("execution_actions table might not exist under this name.");
    }

  } catch (err) {
    console.error(err);
  }
}

checkSchema();
