const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

console.log('Environment variables:');
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', typeof process.env.DB_PASSWORD, process.env.DB_PASSWORD ? '***' : 'undefined');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_SSL:', process.env.DB_SSL);

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'robot_interface',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_SSL === 'true'
});

console.log('Pool config:', {
    user: pool.options.user,
    database: pool.options.database,
    host: pool.options.host,
    port: pool.options.port,
    ssl: pool.options.ssl
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to PostgreSQL:', err);
    } else {
        console.log('Successfully connected to PostgreSQL');
        release();
    }
    pool.end();
}); 