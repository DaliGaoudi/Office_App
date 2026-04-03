const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database_v3.sqlite');
const sqlDumpPath = path.join(__dirname, '..', '..', 'to_improve', 'huissierirdb.sql');

if (fs.existsSync(dbPath)) {
    console.log('Removing old database_v3.sqlite');
    fs.unlinkSync(dbPath);
}

const db = new sqlite3.Database(dbPath);

async function migrate() {
    let sql = fs.readFileSync(sqlDumpPath, 'utf8');

    // Remove specific MySQL syntaxes
    sql = sql.replace(/ENGINE=MyISAM/gi, '');
    sql = sql.replace(/ENGINE=InnoDB/gi, '');
    sql = sql.replace(/DEFAULT CHARSET=\w+/gi, '');
    sql = sql.replace(/CHARACTER SET \w+ COLLATE \w+/gi, '');
    sql = sql.replace(/COLLATE \w+/gi, '');
    
    // Fix Data Types
    sql = sql.replace(/int\(\d+\)/gi, 'INTEGER');
    sql = sql.replace(/int NOT NULL/gi, 'INTEGER NOT NULL');
    sql = sql.replace(/varchar\(\d+\)/gi, 'TEXT');
    sql = sql.replace(/longtext/gi, 'TEXT');

    // Clean up inline keys that SQLite doesn't support inside CREATE TABLE
    sql = sql.replace(/,\s*(UNIQUE )?KEY `?\w+`? \(`?\w+`?\)/gi, '');
    sql = sql.replace(/,\s*PRIMARY KEY \(`?\w+`?\)/gi, ''); 
    sql = sql.replace(/INTEGER NOT NULL AUTO_INCREMENT/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');

    // We'll replace the word ALTER TABLE with a comment prefix so it gets ignored
    sql = sql.replace(/ALTER TABLE/gi, '-- ALTER TABLE');
    sql = sql.replace(/ADD PRIMARY KEY/gi, '-- ADD PRIMARY KEY');
    sql = sql.replace(/MODIFY/gi, '-- MODIFY');
    sql = sql.replace(/ADD CONSTRAINT/gi, '-- ADD CONSTRAINT');

    // Fix Escaping
    sql = sql.replace(/\\'/g, "''");
    sql = sql.replace(/\\"/g, '"');

    // Remove MySQL specific sets and comments
    sql = sql.replace(/^SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";/gm, '');
    sql = sql.replace(/^START TRANSACTION;/gm, '');
    sql = sql.replace(/^COMMIT;/gm, '');
    sql = sql.replace(/^SET time_zone = "\+00:00";/gm, '');
    sql = sql.replace(/\/\*!40101 .*?\*\/;/g, '');

    // Write to intermediate file
    const outPath = path.join(__dirname, 'migrated.sql');
    fs.writeFileSync(outPath, sql, 'utf8');
    console.log('Cleaned SQL written to migrated.sql');
}

migrate().catch(console.error);
