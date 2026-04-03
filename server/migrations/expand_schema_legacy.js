const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../database_v3.sqlite');
const db = new sqlite3.Database(dbPath);

const columnsToAdd = [
    'cl1_profession', 'cl1_adresse', 'cl1_avocat', 'cl1_tel', 'cl1_adressepersonnel',
    'cl2_profession', 'cl2_adresse', 'cl2_avocat', 'cl2_tel', 'cl2_adressepersonnel',
    'fin_date', 'resume', 'tribunal', 'nombre', 'date_s', 'resultat',
    'origine', 'exemple', 'version_bureau', 'orientation', 'mobilite',
    'imprimer', 'inscri', 'delimitation', 'poste', 'autre', 'TVA',
    'montant_partiel1', 'montant_partiel2', 'salaire'
];

db.serialize(() => {
    // Check existing columns to avoid SQLITE_ERROR: duplicate column name
    db.all("PRAGMA table_info(clients_record)", (err, rows) => {
        if (err) {
            console.error("Error reading schema:", err);
            process.exit(1);
        }

        const existingColumns = rows.map(r => r.name);
        
        columnsToAdd.forEach(column => {
            if (!existingColumns.includes(column)) {
                db.run(`ALTER TABLE clients_record ADD COLUMN ${column} TEXT`, (err) => {
                    if (err) {
                        console.error(`Error adding column ${column}:`, err.message);
                    } else {
                        console.log(`Column ${column} added successfully.`);
                    }
                });
            } else {
                console.log(`Column ${column} already exists.`);
            }
        });
    });
});
