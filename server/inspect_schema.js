const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database_v3.sqlite', sqlite3.OPEN_READONLY);

// Print full DDL for all tables containing oeuvre
db.all('SELECT name, sql FROM sqlite_master WHERE type="table"', [], (e, rows) => {
    if (e) return console.log(e.message);
    rows.forEach(t => {
        if (t.sql && (t.sql.toLowerCase().includes('oeuvre') || t.name.toLowerCase().includes('oeuvre'))) {
            console.log('\n=== TABLE:', t.name, '===\n');
            console.log(t.sql);
        }
    });
    db.close();
});
