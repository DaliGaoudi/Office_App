const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database_v3.sqlite');

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) return console.error(err);
    const table = tables.find(t => t.name.includes('uvre'));
    if (!table) return console.log('TABLE NOT FOUND');
    
    db.all(`PRAGMA table_info("${table.name}")`, (err2, rows) => {
        if (err2) return console.error(err2);
        const columnNames = rows.map(r => r.name);
        console.log('TABLE_NAME:' + table.name);
        console.log('COLUMNS_ARRAY:' + JSON.stringify(columnNames));
        
        db.get(`SELECT * FROM "${table.name}" LIMIT 1`, (err3, row) => {
            console.log('SAMPLE_ROW:' + JSON.stringify(row));
            db.close();
        });
    });
});
