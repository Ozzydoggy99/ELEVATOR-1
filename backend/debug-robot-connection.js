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

async function debugRobotConnection() {
    try {
        console.log('=== Debugging Robot Connection ===\n');
        
        // Get robot information from database
        const robotResult = await db.query('SELECT * FROM robots WHERE serial_number = $1', ['L382502104972ic']);
        
        if (robotResult.rows.length === 0) {
            console.error('Robot not found in database');
            return;
        }
        
        const robot = robotResult.rows[0];
        console.log('Robot Database Record:', {
            serial_number: robot.serial_number,
            public_ip: robot.public_ip,
            private_ip: robot.private_ip,
            secret_key: robot.secret_key ? '***HIDDEN***' : 'NOT SET',
            status: robot.status,
            name: robot.name
        });
        
        const robotConfig = new RobotConfig({
            serialNumber: robot.serial_number,
            publicIP: robot.public_ip,
            privateIP: robot.private_ip,
            secretKey: robot.secret_key
        });
        
        console.log('\nRobot Config:', {
            serialNumber: robotConfig.serialNumber,
            publicIp: robotConfig.publicIp,
            localIp: robotConfig.localIp,
            secret: robotConfig.secret ? '***HIDDEN***' : 'NOT SET'
        });
        
        const baseUrl = robotConfig.getBaseUrl();
        const headers = robotConfig.getHeaders();
        
        console.log('\nBase URL:', baseUrl);
        console.log('Headers:', headers);
        
        // Test different endpoints
        const endpoints = [
            '/ping',
            '/health',
            '/status',
            '/services',
            '/chassis/status',
            '/services/jack_up'
        ];
        
        for (const endpoint of endpoints) {
            console.log(`\n--- Testing ${endpoint} ---`);
            const url = baseUrl + endpoint;
            
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: headers,
                    signal: AbortSignal.timeout(5000) // 5 second timeout
                });
                
                console.log(`Status: ${response.status} ${response.statusText}`);
                console.log(`URL: ${response.url}`);
                
                const responseText = await response.text();
                console.log(`Response: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`);
                
            } catch (error) {
                console.log(`Error: ${error.message}`);
                if (error.cause) {
                    console.log(`Cause: ${error.cause.message}`);
                    console.log(`Code: ${error.cause.code}`);
                }
            }
        }
        
        // Test POST to jack_up with different timeouts
        console.log('\n--- Testing POST to jack_up with different timeouts ---');
        const jackUrl = baseUrl + '/services/jack_up';
        
        const timeouts = [3000, 5000, 10000];
        
        for (const timeout of timeouts) {
            console.log(`\nTesting with ${timeout}ms timeout...`);
            try {
                const response = await fetch(jackUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({}),
                    signal: AbortSignal.timeout(timeout)
                });
                
                console.log(`Status: ${response.status} ${response.statusText}`);
                const responseText = await response.text();
                console.log(`Response: ${responseText}`);
                
            } catch (error) {
                console.log(`Error (${timeout}ms): ${error.message}`);
                if (error.cause) {
                    console.log(`Cause: ${error.cause.message}`);
                    console.log(`Code: ${error.cause.code}`);
                }
            }
        }
        
        // Test without authentication headers
        console.log('\n--- Testing without authentication headers ---');
        try {
            const response = await fetch(jackUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({}),
                signal: AbortSignal.timeout(5000)
            });
            
            console.log(`Status: ${response.status} ${response.statusText}`);
            const responseText = await response.text();
            console.log(`Response: ${responseText}`);
            
        } catch (error) {
            console.log(`Error: ${error.message}`);
        }
        
    } catch (error) {
        console.error('\n❌ Error debugging robot connection:', error);
        console.error('Error stack:', error.stack);
    } finally {
        await db.pool.end();
    }
}

debugRobotConnection(); 