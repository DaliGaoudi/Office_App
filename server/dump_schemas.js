const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database_v3.sqlite');

function getTableSchema(tableName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info("${tableName}")`, (err, rows) => {
      if (err) reject(err);
      else resolve({ name: tableName, columns: rows });
    });
  });
}

const main = async () => {
  try {
    const list = ['clients_oeuvre', 'clients_œuvre', 'oeuvre', 'œuvre', 'oeuvre_type', 'œuvre_type'];
    for (const name of list) {
        try {
            const schema = await getTableSchema(name);
            if (schema.columns.length > 0) {
                console.log(`\nTable: ${name}`);
                schema.columns.forEach(c => {
                    console.log(` - ${c.name} (${c.type})`);
                });
            }
        } catch (e) {
            // Table might not exist
        }
    }
  } catch (err) {
    console.error(err);
  } finally {
    db.close();
  }
};

main();
