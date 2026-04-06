require('dotenv').config({ path: './server/.env' });
const db = require('../db');

async function fixExecutionData() {
    console.log("🚀 Starting Execution Data Cleanup and Schema Upgrade...");
    try {
        // 1. Check current state
        const nullRows = await db.all('SELECT * FROM "œuvre_type" WHERE id IS NULL');
        console.log(`Found ${nullRows.length} rows with NULL id.`);

        if (nullRows.length > 0) {
            console.log("Updating NULL IDs...");
            const maxIdResult = await db.get('SELECT COALESCE(MAX(id), 0) as maxid FROM "œuvre_type"');
            let nextId = maxIdResult.maxid + 1;

            // Simple loop to update each NULL row with a unique ID
            // Using a loop because it's easier to debug and track than a complex multi-join update in this environment
            for (const row of nullRows) {
                // Since there's no PK, we'll try to target by other identifying fields (id_o, type_operation, date_r, id_user)
                // But safer to use Postgres ctid if we can... let's check if ctid is available
                // Actually, I'll just use a subquery to pick 1 record at a time.
                await db.run('UPDATE "œuvre_type" SET id = $1 WHERE ctid = (SELECT ctid FROM "œuvre_type" WHERE id IS NULL LIMIT 1)', [nextId++]);
            }
            console.log(`✅ Assigned ${nullRows.length} unique IDs.`);
        }

        // 2. Add NOT NULL constraint
        console.log("Setting id column to NOT NULL...");
        await db.run('ALTER TABLE "œuvre_type" ALTER COLUMN id SET NOT NULL');

        // 3. Add Primary Key
        console.log("Adding PRIMARY KEY constraint to id...");
        try {
            await db.run('ALTER TABLE "œuvre_type" ADD PRIMARY KEY (id)');
            console.log("✅ PRIMARY KEY added successfully.");
        } catch (e) {
            if (e.message.includes('already exists')) {
                console.log("ℹ️ PRIMARY KEY already exists, skipping...");
            } else {
                throw e;
            }
        }

        // 4. Setup Sequence for Auto-increment
        console.log("Setting up SERIAL sequence for id...");
        try {
            // Check if sequence already exists
            const seqCheck = await db.all("SELECT 1 FROM pg_class WHERE relname = 'œuvre_type_id_seq'");
            if (seqCheck.length === 0) {
                await db.run('CREATE SEQUENCE œuvre_type_id_seq');
            }
            
            // Set sequence to current max
            await db.run('SELECT setval(\'œuvre_type_id_seq\', (SELECT MAX(id) FROM "œuvre_type"))');
            
            // Associate with column
            await db.run('ALTER TABLE "œuvre_type" ALTER COLUMN id SET DEFAULT nextval(\'œuvre_type_id_seq\')');
            await db.run('ALTER SEQUENCE œuvre_type_id_seq OWNED BY "œuvre_type".id');
            console.log("✅ Auto-increment sequence configured.");
        } catch (e) {
            console.log("⚠️ Sequence setup warning:", e.message);
        }

        console.log("\n🎉 Database upgrade completed successfully.");
    } catch (err) {
        console.error("\n❌ Database upgrade failed:", err);
        process.exit(1);
    }
}

fixExecutionData();
