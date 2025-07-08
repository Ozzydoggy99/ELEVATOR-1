const db = require('../config/database');

async function addStationaryColumn() {
    try {
        // Check if the column already exists
        const result = await db.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'templates' AND column_name = 'stationary'
        `);
        if (result.rows.length > 0) {
            console.log("'stationary' column already exists in 'templates' table.");
            return;
        }
        // Add the column
        await db.query('ALTER TABLE templates ADD COLUMN stationary BOOLEAN DEFAULT FALSE;');
        console.log("'stationary' column added to 'templates' table.");
    } catch (err) {
        console.error('Error adding stationary column:', err);
    } finally {
        await db.pool.end();
    }
}

addStationaryColumn(); 