const db = require('../config/database');

async function addDetailedErrorColumn() {
    try {
        console.log('Adding detailed_error column to task_queue table...');
        
        // Check if column already exists
        const checkResult = await db.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'task_queue' AND column_name = 'detailed_error'
        `);
        
        if (checkResult.rows.length > 0) {
            console.log('detailed_error column already exists');
            return;
        }
        
        // Add the detailed_error column
        await db.query(`
            ALTER TABLE task_queue 
            ADD COLUMN detailed_error JSONB
        `);
        
        console.log('✅ Successfully added detailed_error column to task_queue table');
        
        // Add an index for better query performance
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_task_queue_detailed_error 
            ON task_queue USING GIN (detailed_error)
        `);
        
        console.log('✅ Successfully added index for detailed_error column');
        
    } catch (error) {
        console.error('❌ Error adding detailed_error column:', error);
        throw error;
    } finally {
        await db.pool.end();
    }
}

addDetailedErrorColumn(); 