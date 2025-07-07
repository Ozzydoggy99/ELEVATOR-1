const db = require('../db');

console.log('Testing root db.js connection...');

db.pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to the database:', err);
    } else {
        console.log('Successfully connected to PostgreSQL database using root db.js');
        release();
    }
    db.pool.end();
}); 