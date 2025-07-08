const db = require('./config/database');

async function checkTemplate6() {
    try {
        console.log('=== Template 6 Details ===\n');
        
        // Get template details
        const templateResult = await db.query('SELECT * FROM templates WHERE id = 6');
        if (templateResult.rows.length === 0) {
            console.log('Template 6 not found.');
            return;
        }
        
        const template = templateResult.rows[0];
        console.log('Template details:');
        console.log(`  ID: ${template.id}`);
        console.log(`  Name: ${template.name}`);
        console.log(`  Color: ${template.color}`);
        console.log(`  Stationary: ${template.stationary}`);
        console.log(`  Created: ${template.created_at}`);
        console.log('');
        
        // Parse robot data
        let robot = template.robot;
        if (typeof robot === 'string') {
            try {
                robot = JSON.parse(robot);
            } catch (e) {
                console.error('Error parsing robot JSON:', e);
                robot = null;
            }
        }
        
        if (robot) {
            console.log('Assigned robot:');
            console.log(`  Serial Number: ${robot.serial_number || robot.serialNumber}`);
            console.log(`  Name: ${robot.name}`);
            console.log(`  Public IP: ${robot.public_ip || robot.publicIP}`);
            console.log(`  Private IP: ${robot.private_ip || robot.privateIP}`);
            console.log('');
        } else {
            console.log('No robot assigned to this template.');
        }
        
        // Check robot status in database
        if (robot && robot.serial_number) {
            const robotResult = await db.query('SELECT * FROM robots WHERE serial_number = $1', [robot.serial_number]);
            if (robotResult.rows.length > 0) {
                const dbRobot = robotResult.rows[0];
                console.log('Robot status in database:');
                console.log(`  Status: ${dbRobot.status}`);
                console.log(`  Last updated: ${dbRobot.updated_at}`);
            } else {
                console.log('Robot not found in robots table.');
            }
        }
        
    } catch (err) {
        console.error('Error checking template 6:', err);
    } finally {
        await db.pool.end();
    }
}

checkTemplate6(); 