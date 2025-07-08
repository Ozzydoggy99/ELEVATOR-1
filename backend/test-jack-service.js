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

async function testJackService() {
    try {
        console.log('=== Testing Jack Service ===\n');
        
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
        
        console.log('Robot Config:', {
            serialNumber: robotConfig.serialNumber,
            publicIp: robotConfig.publicIp,
            localIp: robotConfig.localIp,
            secret: robotConfig.secret ? '***HIDDEN***' : 'NOT SET'
        });
        
        const url = `${robotConfig.getBaseUrl()}/services/jack_up`;
        const headers = robotConfig.getHeaders();
        
        console.log('\nMaking request to:', url);
        console.log('Headers:', headers);
        console.log('Method: POST');
        console.log('Body: {}');
        
        // Test connectivity first
        console.log('\n=== Testing Connectivity ===');
        try {
            const pingResponse = await fetch(`${robotConfig.getBaseUrl()}/ping`, {
                method: 'GET',
                headers: robotConfig.getHeaders()
            });
            console.log('Ping response status:', pingResponse.status);
            if (pingResponse.ok) {
                const pingText = await pingResponse.text();
                console.log('Ping response:', pingText);
            }
        } catch (pingError) {
            console.log('Ping failed:', pingError.message);
        }
        
        // Test the jack_up service
        console.log('\n=== Testing Jack Up Service ===');
        const startTime = new Date();
        
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({})
        });
        
        const endTime = new Date();
        const responseTime = endTime.getTime() - startTime.getTime();
        
        console.log('Response Status:', response.status);
        console.log('Response Status Text:', response.statusText);
        console.log('Response Time:', responseTime + 'ms');
        console.log('Response URL:', response.url);
        
        // Get response headers
        const responseHeaders = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });
        console.log('Response Headers:', responseHeaders);
        
        // Get response body
        const responseText = await response.text();
        console.log('Response Text:', responseText);
        
        let responseData;
        try {
            responseData = JSON.parse(responseText);
            console.log('Response JSON:', JSON.stringify(responseData, null, 2));
        } catch (e) {
            console.log('Response is not valid JSON');
        }
        
        if (!response.ok) {
            console.log('\n❌ Jack Up Service Failed');
            console.log('Error Details:', {
                status: response.status,
                statusText: response.statusText,
                responseTime: responseTime,
                data: responseData,
                text: responseText
            });
        } else {
            console.log('\n✅ Jack Up Service Succeeded');
        }
        
    } catch (error) {
        console.error('\n❌ Error testing jack service:', error);
        console.error('Error stack:', error.stack);
    } finally {
        await db.pool.end();
    }
}

testJackService(); 