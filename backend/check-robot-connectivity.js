const http = require('http');
const https = require('https');

async function checkRobotConnectivity() {
    const robotIPs = [
        { type: 'Public', ip: '47.180.91.99' },
        { type: 'Private', ip: '192.168.1.106' }
    ];
    
    const ports = [80, 8080, 443];
    const timeout = 5000; // 5 seconds timeout
    
    console.log('=== Robot Connectivity Check ===\n');
    console.log('Checking robot: L382502104972ic (Demo-Warehouse)\n');
    
    for (const robotIP of robotIPs) {
        console.log(`--- ${robotIP.type} IP: ${robotIP.ip} ---`);
        
        for (const port of ports) {
            const isHttps = port === 443;
            const protocol = isHttps ? https : http;
            const url = `${isHttps ? 'https' : 'http'}://${robotIP.ip}:${port}/`;
            
            console.log(`  Testing ${url}...`);
            
            try {
                const result = await new Promise((resolve, reject) => {
                    const req = protocol.get(url, {
                        timeout: timeout,
                        headers: {
                            'User-Agent': 'Robot-Connectivity-Check/1.0'
                        }
                    }, (res) => {
                        let data = '';
                        res.on('data', (chunk) => {
                            data += chunk;
                        });
                        res.on('end', () => {
                            resolve({
                                status: res.statusCode,
                                statusText: res.statusMessage,
                                headers: res.headers,
                                data: data.substring(0, 200)
                            });
                        });
                    });
                    
                    req.on('error', (error) => {
                        reject(error);
                    });
                    
                    req.on('timeout', () => {
                        req.destroy();
                        reject(new Error('Timeout'));
                    });
                });
                
                console.log(`    ✅ Connected! Status: ${result.status} ${result.statusText}`);
                
                if (Object.keys(result.headers).length > 0) {
                    console.log(`    Headers:`, result.headers);
                }
                
                if (result.data) {
                    console.log(`    Response preview: ${result.data}${result.data.length >= 200 ? '...' : ''}`);
                }
                
            } catch (error) {
                if (error.message === 'Timeout') {
                    console.log(`    ❌ Timeout after ${timeout}ms`);
                } else if (error.code === 'ECONNREFUSED') {
                    console.log(`    ❌ Connection refused (port ${port} not open)`);
                } else if (error.code === 'ENOTFOUND') {
                    console.log(`    ❌ DNS resolution failed`);
                } else if (error.code === 'ETIMEDOUT') {
                    console.log(`    ❌ Connection timed out`);
                } else if (error.code === 'ECONNRESET') {
                    console.log(`    ❌ Connection reset by peer`);
                } else {
                    console.log(`    ❌ Error: ${error.message}`);
                }
            }
        }
        console.log('');
    }
    
    console.log('=== Connectivity Check Complete ===');
}

checkRobotConnectivity().catch(console.error); 