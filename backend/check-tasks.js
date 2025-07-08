const db = require('./config/database');

console.log('Checking recent task executions in PostgreSQL (task_queue)...\n');

async function main() {
  // Query recent tasks with detailed information
  const query = `
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
    LIMIT 10
  `;

  try {
    const { rows } = await db.query(query);
    if (rows.length === 0) {
      console.log('No tasks found in the database.');
    } else {
      console.log('Recent Tasks:');
      console.log('=============');
      rows.forEach((task, index) => {
        console.log(`\n${index + 1}. Task ID: ${task.id}`);
        console.log(`   Template: ${task.template_id}`);
        console.log(`   Robot: ${task.robot_serial_number}`);
        console.log(`   Type: ${task.type}`);
        console.log(`   Floor: ${task.floor}, Shelf: ${task.shelf_point}`);
        console.log(`   Status: ${task.status}`);
        console.log(`   Created: ${task.created_at}`);
        if (task.started_at) console.log(`   Started: ${task.started_at}`);
        if (task.completed_at) console.log(`   Completed: ${task.completed_at}`);
        if (task.error_message) console.log(`   Error: ${task.error_message}`);
      });
    }

    // Check for failed tasks specifically
    console.log('\n\nFailed Tasks:');
    console.log('=============');
    const failedQuery = `
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
      WHERE status = 'failed'
      ORDER BY created_at DESC
      LIMIT 5
    `;
    const { rows: failedRows } = await db.query(failedQuery);
    if (failedRows.length === 0) {
      console.log('No failed tasks found.');
    } else {
      failedRows.forEach((task, index) => {
        console.log(`\n${index + 1}. Failed Task ID: ${task.id}`);
        console.log(`   Robot: ${task.robot_serial_number}`);
        console.log(`   Type: ${task.type}`);
        console.log(`   Failed at: ${task.created_at}`);
        console.log(`   Error: ${task.error_message || 'No error message'}`);
      });
    }

    // Check for tasks with jack operations
    console.log('\n\nTasks with Jack Operations:');
    console.log('===========================');
    const jackQuery = `
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
      WHERE type ILIKE '%jack%' OR type ILIKE '%pickup%' OR type ILIKE '%dropoff%'
      ORDER BY created_at DESC
      LIMIT 5
    `;
    const { rows: jackRows } = await db.query(jackQuery);
    if (jackRows.length === 0) {
      console.log('No tasks with jack operations found.');
    } else {
      jackRows.forEach((task, index) => {
        console.log(`\n${index + 1}. Jack Task ID: ${task.id}`);
        console.log(`   Robot: ${task.robot_serial_number}`);
        console.log(`   Type: ${task.type}`);
        console.log(`   Status: ${task.status}`);
        console.log(`   Created: ${task.created_at}`);
        if (task.error_message) {
          console.log(`   Error: ${task.error_message}`);
        }
      });
    }
  } catch (err) {
    console.error('Error querying PostgreSQL:', err);
  } finally {
    if (db.pool) db.pool.end();
  }
}

main(); 