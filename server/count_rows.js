const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database_v3.sqlite');

db.get('SELECT COUNT(*) as cnt FROM "clients_œuvre"', (err, row) => {
    console.log(`clients_œuvre: ${row ? row.cnt : 'ERR'}`);
});
db.get('SELECT COUNT(*) as cnt FROM "oeuvre"', (err, row) => {
    console.log(`oeuvre: ${row ? row.cnt : 'ERR'}`);
});
db.get('SELECT COUNT(*) as cnt FROM "œuvre_type"', (err, row) => {
    console.log(`œuvre_type: ${row ? row.cnt : 'ERR'}`);
});
db.close();
