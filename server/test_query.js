const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database_v3.sqlite');

const dossiersTable = '"clients_\u0153uvre"';
const actionsTable  = '"\u0153uvre_type"';
const where = 'WHERE c.id_so = ?';
const params = ['35'];

const query = `
    SELECT c.* 
    FROM ${dossiersTable} c
    ${where}
    AND c.id_o IN (SELECT DISTINCT id_o FROM ${actionsTable})
    ORDER BY c.id_o DESC
`;

console.log('Query:', query);

db.all(query, params, (err, rows) => {
    if (err) {
        console.error('SQL Error:', err.message);
    } else {
        console.log('Success, rows:', rows.length);
    }
    db.close();
});
