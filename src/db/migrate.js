const fs = require('fs');
const path = require('path');
const db = require('./connection');

async function migrate() {
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    console.log('Running migrations...');
    
    for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        console.log(`  - ${file}`);
        await db.query(sql);
    }
    
    console.log('Migrations complete!');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});

