require('dotenv').config({ path: '../.env' });
const db = require('../db');

function normalize(str) {
    if (!str) return '';
    return str
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ي/g, 'ى')
        .replace(/\s+/g, '');
}

async function runCleanup() {
    console.log("=== بدء عملية تصحيح الأسماء في قاعدة البيانات ===");
    
    try {
        // 1. Fetch all raw names mapped to their frequency
        console.log("Fetching and analyzing names...");
        const rows = await db.all(`
            SELECT nom, COUNT(*) as freq FROM (
                SELECT de_part as nom FROM clients_record WHERE de_part IS NOT NULL AND TRIM(de_part) != ''
                UNION ALL
                SELECT nom_cl1 as nom FROM clients_record WHERE nom_cl1 IS NOT NULL AND TRIM(nom_cl1) != ''
                UNION ALL
                SELECT nom_cl2 as nom FROM clients_record WHERE nom_cl2 IS NOT NULL AND TRIM(nom_cl2) != ''
                UNION ALL
                SELECT nom_cl2 as nom FROM cnss WHERE nom_cl2 IS NOT NULL AND TRIM(nom_cl2) != ''
            ) AS all_names
            GROUP BY nom
        `);

        // 2. Group by normalized string
        const groups = {};
        for (let row of rows) {
            const raw = row.nom;
            const norm = normalize(raw);
            const freq = parseInt(row.freq);
            
            if (!groups[norm]) {
                groups[norm] = [];
            }
            groups[norm].push({ raw, freq });
        }

        // 3. Find groups that have variations (spelled differently but mean the same)
        let totalUpdates = 0;

        for (let norm in groups) {
            const members = groups[norm];
            if (members.length > 1) {
                // Determine the "Master" spelling by highest frequency
                members.sort((a, b) => b.freq - a.freq);
                const master = members[0].raw;
                const variantsToReplace = members.slice(1).map(m => m.raw);

                console.log(`\nFound Variation Group [Master: "${master}"]:`);
                console.log(` -> Replacing variations: ${variantsToReplace.map(v => `"${v}"`).join(', ')}`);

                for (let variant of variantsToReplace) {
                    // Update clients_record
                    const res1 = await db.run(`UPDATE clients_record SET de_part = ? WHERE de_part = ?`, [master, variant]);
                    const res2 = await db.run(`UPDATE clients_record SET nom_cl1 = ? WHERE nom_cl1 = ?`, [master, variant]);
                    const res3 = await db.run(`UPDATE clients_record SET nom_cl2 = ? WHERE nom_cl2 = ?`, [master, variant]);
                    
                    // Update cnss
                    const res4 = await db.run(`UPDATE cnss SET nom_cl2 = ? WHERE nom_cl2 = ?`, [master, variant]);
                    
                    const changes = (res1.changes||0) + (res2.changes||0) + (res3.changes||0) + (res4.changes||0);
                    totalUpdates += changes;
                }
            }
        }

        console.log(`\n=== انتهت العملية. تم تصحيح وتوحيد الإملاء في عدد ${totalUpdates} سجل. ===`);

    } catch (err) {
        console.error("حدث خطأ أثناء التصحيح:", err);
    }
}

runCleanup();
