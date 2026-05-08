require('dotenv').config();
const db = require('../db');

async function countDistinctClients() {
  try {
    const res = await db.all("SELECT COUNT(DISTINCT nom_cl1) as total FROM clients_record WHERE nom_cl1 IS NOT NULL AND nom_cl1 != ''");
    console.log("Total unique client names:", res[0].total);
  } catch (err) {
    console.error(err);
  }
}

countDistinctClients();
