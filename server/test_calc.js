const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database_v3.sqlite');

function computeActionSalaire(row) {
    const stored = parseFloat(row.salaire) || 0;
    if (stored > 0) return stored;
    const sum1Fields = ['origine', 'exemple', 'versionbureau', 'orientation', 'mobilite'];
    const sum1 = sum1Fields.reduce((s, k) => s + (parseFloat(row[k]) || 0), 0);
    const tva  = Math.round(sum1 * 19 / 100);
    const sum2Fields = ['imprimer', 'inscri', 'delimitation', 'postal', 'autre'];
    const sum2 = sum2Fields.reduce((s, k) => s + (parseFloat(row[k]) || 0), 0) + tva;
    return Math.round((sum1 + sum2) * 1000) / 1000;
}

db.all('SELECT * FROM "œuvre_type" LIMIT 10', (err, actions) => {
    if (err) return console.error(err);
    if (!actions || actions.length === 0) return console.log('No actions found in table.');
    actions.forEach(a => {
        console.log(`Action id: ${a.id}, id_o: ${a.id_o}, id_so: ${a.id_so}, computed: ${computeActionSalaire(a)}`);
    });
    db.close();
});
