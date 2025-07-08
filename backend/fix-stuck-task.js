const db = require('./config/database');

async function fixStuckTask() {
    try {
        console.log('=== Fixing Stuck Task ===\n');
        
        // Find the stuck task
        const stuckTaskResult = await db.query(`
            SELECT * FROM task_queue 
            WHERE robot_serial_number = 'L382502104972ic' 
            AND status = 'in_progress'
            ORDER BY started_at ASC
            LIMIT 1
        `);
        
        if (stuckTaskResult.rows.length === 0) {
            console.log('No stuck task found for robot L382502104972ic');
            return;
        }
        
        const stuckTask = stuckTaskResult.rows[0];
        console.log('Found stuck task:');
        console.log(`  ID: ${stuckTask.id}`);
        console.log(`  Type: ${stuckTask.type}`);
        console.log(`  Floor: ${stuckTask.floor}, Shelf: ${stuckTask.shelf_point}`);
        console.log(`  Started: ${stuckTask.started_at}`);
        console.log(`  Duration: ${Math.round((new Date() - new Date(stuckTask.started_at)) / 1000 / 60)} minutes`);
        console.log('');
        
        // Mark the task as failed
        await db.query(
            `UPDATE task_queue 
             SET status = 'failed', 
                 completed_at = NOW(), 
                 error_message = 'Task manually marked as failed due to being stuck in progress'
             WHERE id = $1`,
            [stuckTask.id]
        );
        
        console.log('✅ Stuck task marked as failed. New tasks should now be processed.');
        
        // Check if there are queued tasks waiting
        const queuedTasksResult = await db.query(`
            SELECT COUNT(*) as count 
            FROM task_queue 
            WHERE robot_serial_number = 'L382502104972ic' 
            AND status = 'queued'
        `);
        
        console.log(`\nQueued tasks waiting: ${queuedTasksResult.rows[0].count}`);
        
    } catch (err) {
        console.error('Error fixing stuck task:', err);
    } finally {
        await db.pool.end();
    }
}

fixStuckTask(); 