const db = require('./config/database');

class RobotConfig {
    constructor(config) {
        this.serialNumber = config.serialNumber || config.serial_number;
        this.publicIp = config.publicIP || config.publicIp || config.ip;
        this.localIp = config.privateIP || config.privateIp;
        this.secret = config.secretKey || config.secret;
    }

    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Public-IP': this.publicIp,
            'X-Private-IP': this.localIp,
            'X-Serial-Number': this.serialNumber,
            'X-Secret-Key': this.secret
        };
    }

    getBaseUrl() {
        return `http://${this.publicIp}:8090`;
    }
}

async function fixRobotEmergencyStop() {
    try {
        console.log('=== Fixing Robot Emergency Stop Issue ===\n');
        
        // Get robot information from database
        const robotResult = await db.query('SELECT * FROM robots WHERE serial_number = $1', ['L382502104972ic']);
        
        if (robotResult.rows.length === 0) {
            console.error('Robot not found in database');
            return;
        }
        
        const robot = robotResult.rows[0];
        const robotConfig = new RobotConfig({
            serialNumber: robot.serial_number,
            publicIP: robot.public_ip,
            privateIP: robot.private_ip,
            secretKey: robot.secret_key
        });
        
        console.log('Robot:', robot.name || robot.serial_number);
        console.log('IP:', robotConfig.publicIp);
        
        // Check current status
        console.log('\n--- Current Robot Status ---');
        try {
            const statusResponse = await fetch(`${robotConfig.getBaseUrl()}/chassis/status`, {
                method: 'GET',
                headers: robotConfig.getHeaders()
            });
            
            if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                console.log('Control Mode:', statusData.control_mode);
                console.log('Emergency Stop Pressed:', statusData.emergency_stop_pressed);
                console.log('Wheel Overloaded:', statusData.wheel_overloaded);
                
                if (statusData.emergency_stop_pressed) {
                    console.log('\n❌ EMERGENCY STOP IS PRESSED!');
                    console.log('This is preventing jack operations from working.');
                    console.log('\nTo fix this:');
                    console.log('1. Physically release the emergency stop button on the robot');
                    console.log('2. Wait for the robot to reset');
                    console.log('3. Change control mode to "auto"');
                }
                
                if (statusData.control_mode === 'manual') {
                    console.log('\n⚠️ Control mode is "manual" - should be "auto" for automated operations');
                }
            }
        } catch (error) {
            console.log('Failed to get status:', error.message);
        }
        
        // Try to change control mode to auto
        console.log('\n--- Attempting to Change Control Mode to Auto ---');
        try {
            const controlResponse = await fetch(`${robotConfig.getBaseUrl()}/chassis/status`, {
                method: 'PATCH',
                headers: robotConfig.getHeaders(),
                body: JSON.stringify({
                    control_mode: 'auto'
                })
            });
            
            console.log('Control Mode Change Status:', controlResponse.status, controlResponse.statusText);
            
            if (controlResponse.ok) {
                const controlData = await controlResponse.json();
                console.log('Response:', controlData);
                console.log('✅ Control mode changed to auto successfully');
            } else {
                const errorText = await controlResponse.text();
                console.log('❌ Failed to change control mode:', errorText);
            }
        } catch (error) {
            console.log('❌ Error changing control mode:', error.message);
        }
        
        // Check status again
        console.log('\n--- Updated Robot Status ---');
        try {
            const statusResponse2 = await fetch(`${robotConfig.getBaseUrl()}/chassis/status`, {
                method: 'GET',
                headers: robotConfig.getHeaders()
            });
            
            if (statusResponse2.ok) {
                const statusData2 = await statusResponse2.json();
                console.log('Control Mode:', statusData2.control_mode);
                console.log('Emergency Stop Pressed:', statusData2.emergency_stop_pressed);
                console.log('Wheel Overloaded:', statusData2.wheel_overloaded);
                
                if (!statusData2.emergency_stop_pressed && statusData2.control_mode === 'auto') {
                    console.log('\n✅ Robot is ready for jack operations!');
                } else {
                    console.log('\n❌ Robot still needs attention:');
                    if (statusData2.emergency_stop_pressed) {
                        console.log('- Emergency stop is still pressed');
                    }
                    if (statusData2.control_mode !== 'auto') {
                        console.log('- Control mode is not auto');
                    }
                }
            }
        } catch (error) {
            console.log('Failed to get updated status:', error.message);
        }
        
        // Test jack operation if robot is ready
        console.log('\n--- Testing Jack Operation ---');
        try {
            const jackResponse = await fetch(`${robotConfig.getBaseUrl()}/services/jack_up`, {
                method: 'POST',
                headers: robotConfig.getHeaders(),
                body: JSON.stringify({})
            });
            
            console.log('Jack Operation Status:', jackResponse.status, jackResponse.statusText);
            const jackData = await jackResponse.text();
            console.log('Jack Response:', jackData);
            
            if (jackResponse.ok) {
                console.log('✅ Jack operation test successful!');
            } else {
                console.log('❌ Jack operation still failing');
            }
        } catch (error) {
            console.log('❌ Error testing jack operation:', error.message);
        }
        
    } catch (error) {
        console.error('\n❌ Error fixing robot emergency stop:', error);
        console.error('Error stack:', error.stack);
    } finally {
        await db.pool.end();
    }
}

fixRobotEmergencyStop(); 