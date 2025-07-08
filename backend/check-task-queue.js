const db = require('./config/database');

async function checkTaskQueue() {
    try {
        console.log('=== Task Queue Status ===\n');
        
        // Get all tasks
        const result = await db.query(`
            SELECT 
                id, 
                template_id, 
                robot_serial_number, 
                type, 
                floor, 
                shelf_point, 
                status, 
                created_at, 
                started_at, 
                completed_at,
                error_message
            FROM task_queue 
            ORDER BY created_at DESC
        `);
        
        if (result.rows.length === 0) {
            console.log('No tasks in queue.');
            return;
        }
        
        console.log(`Total tasks: ${result.rows.length}\n`);
        
        // Group by status
        const statusCounts = {};
        result.rows.forEach(task => {
            statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
        });
        
        console.log('Tasks by status:');
        Object.entries(statusCounts).forEach(([status, count]) => {
            console.log(`  ${status}: ${count}`);
        });
        console.log('');
        
        // Show recent tasks
        console.log('Recent tasks:');
        result.rows.slice(0, 10).forEach(task => {
            console.log(`  ID: ${task.id}`);
            console.log(`    Template: ${task.template_id}`);
            console.log(`    Robot: ${task.robot_serial_number}`);
            console.log(`    Type: ${task.type}`);
            console.log(`    Floor: ${task.floor}, Shelf: ${task.shelf_point}`);
            console.log(`    Status: ${task.status}`);
            console.log(`    Created: ${task.created_at}`);
            if (task.started_at) console.log(`    Started: ${task.started_at}`);
            if (task.completed_at) console.log(`    Completed: ${task.completed_at}`);
            if (task.error_message) console.log(`    Error: ${task.error_message}`);
            console.log('');
        });
        
        // Check for stuck tasks
        const stuckTasks = result.rows.filter(task => 
            task.status === 'in_progress' && 
            task.started_at && 
            (new Date() - new Date(task.started_at)) > 300000 // 5 minutes
        );
        
        if (stuckTasks.length > 0) {
            console.log('⚠️  Stuck tasks (in_progress for >5 minutes):');
            stuckTasks.forEach(task => {
                console.log(`  Task ${task.id} for robot ${task.robot_serial_number} started at ${task.started_at}`);
            });
        }
        
    } catch (err) {
        console.error('Error checking task queue:', err);
    } finally {
        await db.pool.end();
    }
}

checkTaskQueue(); 