require('dotenv').config();
const db = require('../db');

async function checkClients() {
  try {
    const clients = await db.all(`
      SELECT nom_cl1, COUNT(*) as count 
      FROM clients_record 
      WHERE nom_cl1 IS NOT NULL AND nom_cl1 != '' 
      GROUP BY nom_cl1 
      ORDER BY count DESC 
      LIMIT 30
    `);
    console.log(clients);
  } catch (err) {
    console.error(err);
  }
}

checkClients();
