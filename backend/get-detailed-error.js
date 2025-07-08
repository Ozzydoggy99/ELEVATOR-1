const db = require('./config/database');

async function getDetailedError() {
    try {
        console.log('=== Detailed Error Analysis ===\n');
        
        // Get the most recent failed task
        const failedTaskResult = await db.query(`
            SELECT * FROM task_queue 
            WHERE robot_serial_number = 'L382502104972ic' 
            AND status = 'failed' 
            AND error_message != 'Task manually marked as failed due to being stuck in progress'
            ORDER BY completed_at DESC 
            LIMIT 1
        `);
        
        if (failedTaskResult.rows.length === 0) {
            console.log('No recent failed tasks found for robot L382502104972ic');
            return;
        }
        
        const task = failedTaskResult.rows[0];
        console.log('Most recent failed task:');
        console.log(`  ID: ${task.id}`);
        console.log(`  Type: ${task.type}`);
        console.log(`  Floor: ${task.floor}, Shelf: ${task.shelf_point}`);
        console.log(`  Created: ${task.created_at}`);
        console.log(`  Started: ${task.started_at}`);
        console.log(`  Completed: ${task.completed_at}`);
        console.log(`  Duration: ${Math.round((new Date(task.completed_at) - new Date(task.started_at)) / 1000)} seconds`);
        console.log(`  Error: ${task.error_message}`);
        console.log('');
        
        // Parse enriched data
        if (task.enriched_data) {
            let enrichedData;
            try {
                enrichedData = typeof task.enriched_data === 'string' 
                    ? JSON.parse(task.enriched_data) 
                    : task.enriched_data;
                
                console.log('Enriched data used for this task:');
                console.log(`  Robot: ${enrichedData.robot?.name || enrichedData.robot?.serialNumber}`);
                console.log(`  Map: ${enrichedData.mapName}`);
                console.log(`  Central Load: ${enrichedData.centralLoad?.name || 'Not found'}`);
                console.log(`  Central Load Docking: ${enrichedData.centralLoadDocking?.name || 'Not found'}`);
                console.log(`  Shelf Load: ${enrichedData.shelfLoad?.name || 'Not found'}`);
                console.log(`  Shelf Load Docking: ${enrichedData.shelfLoadDocking?.name || 'Not found'}`);
                console.log(`  Charger: ${enrichedData.charger?.name || 'Not found'}`);
                console.log('');
                
                // Check if any required features are missing
                const missingFeatures = [];
                if (!enrichedData.centralLoad) missingFeatures.push('Central Load');
                if (!enrichedData.centralLoadDocking) missingFeatures.push('Central Load Docking');
                if (!enrichedData.shelfLoad) missingFeatures.push('Shelf Load');
                if (!enrichedData.shelfLoadDocking) missingFeatures.push('Shelf Load Docking');
                if (!enrichedData.charger) missingFeatures.push('Charger');
                
                if (missingFeatures.length > 0) {
                    console.log('⚠️  Missing required features:');
                    missingFeatures.forEach(feature => console.log(`  - ${feature}`));
                    console.log('');
                }
                
            } catch (e) {
                console.log('Could not parse enriched data:', e.message);
            }
        }
        
        // Check if there are any other recent failed tasks with different errors
        const recentFailedTasks = await db.query(`
            SELECT id, type, floor, shelf_point, error_message, completed_at
            FROM task_queue 
            WHERE robot_serial_number = 'L382502104972ic' 
            AND status = 'failed' 
            AND completed_at > NOW() - INTERVAL '1 hour'
            ORDER BY completed_at DESC
        `);
        
        if (recentFailedTasks.rows.length > 1) {
            console.log('Recent failed tasks (last hour):');
            recentFailedTasks.rows.forEach(t => {
                console.log(`  Task ${t.id}: ${t.type} (Floor ${t.floor}, Shelf ${t.shelf_point}) - ${t.error_message}`);
            });
        }
        
    } catch (err) {
        console.error('Error getting detailed error:', err);
    } finally {
        await db.pool.end();
    }
}

getDetailedError(); 