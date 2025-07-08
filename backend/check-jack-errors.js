const db = require('./config/database');

async function checkJackErrors() {
    try {
        console.log('=== Checking Task Queue for Jack Errors ===\n');
        
        // Get all tasks with detailed error information
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
                error_message,
                detailed_error
            FROM task_queue 
            WHERE (type ILIKE '%pickup%' OR type ILIKE '%dropoff%' OR type ILIKE '%jack%')
            ORDER BY created_at DESC
            LIMIT 20
        `);
        
        if (result.rows.length === 0) {
            console.log('No jack-related tasks found in the queue.');
            return;
        }
        
        console.log(`Found ${result.rows.length} jack-related tasks:\n`);
        
        result.rows.forEach((task, index) => {
            console.log(`\n${index + 1}. Task ID: ${task.id}`);
            console.log(`   Template: ${task.template_id}`);
            console.log(`   Robot: ${task.robot_serial_number}`);
            console.log(`   Type: ${task.type}`);
            console.log(`   Floor: ${task.floor}, Shelf: ${task.shelf_point}`);
            console.log(`   Status: ${task.status}`);
            console.log(`   Created: ${task.created_at}`);
            if (task.started_at) console.log(`   Started: ${task.started_at}`);
            if (task.completed_at) console.log(`   Completed: ${task.completed_at}`);
            
            if (task.error_message) {
                console.log(`   Error Message: ${task.error_message}`);
            }
            
            if (task.detailed_error) {
                console.log(`   📋 Detailed Error Information:`);
                try {
                    const detailedError = typeof task.detailed_error === 'string' 
                        ? JSON.parse(task.detailed_error) 
                        : task.detailed_error;
                    
                    if (detailedError.operation === 'jack') {
                        console.log(`      Operation: ${detailedError.operation}`);
                        console.log(`      Service: ${detailedError.service}`);
                        console.log(`      Robot: ${detailedError.robot_serial}`);
                        console.log(`      Start Time: ${detailedError.start_time}`);
                        
                        if (detailedError.request) {
                            console.log(`      Request URL: ${detailedError.request.url}`);
                            console.log(`      Request Method: ${detailedError.request.method}`);
                        }
                        
                        if (detailedError.response) {
                            console.log(`      Response Status: ${detailedError.response.status} ${detailedError.response.statusText}`);
                            console.log(`      Response Time: ${detailedError.response.responseTime}ms`);
                            
                            if (detailedError.response.data) {
                                console.log(`      Response Data: ${JSON.stringify(detailedError.response.data, null, 6)}`);
                            }
                            
                            if (detailedError.response.text) {
                                console.log(`      Response Text: ${detailedError.response.text}`);
                            }
                        }
                        
                        if (detailedError.error) {
                            console.log(`      Error Message: ${detailedError.error.message}`);
                            console.log(`      Error Stack: ${detailedError.error.stack}`);
                            console.log(`      Error End Time: ${detailedError.error.end_time}`);
                        }
                        
                        if (detailedError.success) {
                            console.log(`      ✅ Operation completed successfully`);
                            console.log(`      End Time: ${detailedError.end_time}`);
                        }
                    } else {
                        console.log(`      Other operation: ${JSON.stringify(detailedError, null, 6)}`);
                    }
                } catch (parseError) {
                    console.log(`      Failed to parse detailed error: ${parseError.message}`);
                    console.log(`      Raw data: ${task.detailed_error}`);
                }
            } else {
                console.log(`   📋 No detailed error information available`);
            }
            
            console.log('   ' + '─'.repeat(80));
        });
        
        // Summary of failed tasks
        const failedTasks = result.rows.filter(task => task.status === 'failed');
        if (failedTasks.length > 0) {
            console.log(`\n📊 Summary: ${failedTasks.length} failed jack-related tasks`);
            
            const errorTypes = {};
            failedTasks.forEach(task => {
                const errorType = task.error_message || 'Unknown';
                errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
            });
            
            console.log('\nError types:');
            Object.entries(errorTypes).forEach(([error, count]) => {
                console.log(`   ${error}: ${count} tasks`);
            });
        }
        
    } catch (err) {
        console.error('Error checking jack errors:', err);
    } finally {
        await db.pool.end();
    }
}

checkJackErrors(); 