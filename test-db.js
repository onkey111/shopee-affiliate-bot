require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query('SELECT NOW()')
    .then(r => {
        console.log('DB Connected:', r.rows[0].now);
        pool.end();
    })
    .catch(e => {
        console.error('DB Error:', e.message);
        process.exit(1);
    });

