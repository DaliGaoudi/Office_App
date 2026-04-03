const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database_v3.sqlite');

db.all("SELECT name FROM sqlite_master WHERE name LIKE '%uvre%'", (err, tables) => {
    console.log('TABLES FOUND:', tables.map(t => t.name));
    
    tables.forEach(table => {
        db.all(`PRAGMA table_info("${table.name}")`, (err2, rows) => {
            console.log('TABLE:', table.name);
            console.log('COLS:', JSON.stringify(rows.map(r => r.name)));
            
            db.get(`SELECT * FROM "${table.name}" LIMIT 1`, (err3, row) => {
                console.log('SAMPLE:', JSON.stringify(row));
            });
        });
    });
});
setTimeout(() => db.close(), 1000);
