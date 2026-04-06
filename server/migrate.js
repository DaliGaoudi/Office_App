require('dotenv').config();
const db = require('./db');

async function migrate() {
    console.log("Starting migration...");
    try {
        // Add service_petitioner_name
        console.log("Adding service_petitioner_name...");
        await db.run("ALTER TABLE clients_record ADD COLUMN IF NOT EXISTS service_petitioner_name VARCHAR(255)");
        
        // Add service_petitioner_contact
        console.log("Adding service_petitioner_contact...");
        await db.run("ALTER TABLE clients_record ADD COLUMN IF NOT EXISTS service_petitioner_contact VARCHAR(255)");
        
        // Add date_echeance
        console.log("Adding date_echeance...");
        await db.run("ALTER TABLE clients_record ADD COLUMN IF NOT EXISTS date_echeance VARCHAR(100)");

        console.log("Migration completed successfully.");
    } catch (err) {
        console.error("Migration failed:", err);
    }
}

migrate();
