const db = require('./db');
require('dotenv').config();

async function checkPasswords() {
    try {
        const users = await db.all("SELECT id, username, password FROM admin_admin");
        console.table(users);
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

checkPasswords();
