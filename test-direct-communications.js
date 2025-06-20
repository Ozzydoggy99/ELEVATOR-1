// ESP-NOW Relay Communication Test
// For ESP32-S3 6ch relays with ESP-NOW wireless communication
// Primary: Robot relay that sends commands
// Secondary: Elevator relay that receives and responds to commands

const EventEmitter = require('events');
const SerialPort = require('serialport');

class ESPNowCommunicationTester extends EventEmitter {
    constructor() {
        super();
        this.testResults = {
            primaryRelay: {
                connected: false,
                commandsSent: 0,
                responsesReceived: 0,
                responseTimes: [],
                macAddress: null
            },
            secondaryRelay: {
                connected: false,
                commandsReceived: 0,
                responsesSent: 0,
                macAddress: null
            },
            espNowCommunication: false,
            testResults: []
        };
        
        // Serial ports for communicating with relays
        this.primaryPort = null;
        this.secondaryPort = null;
        
        // Message tracking
        this.lastCommandTime = 0;
        this.expectedResponses = [];
    }

    // Configure primary relay (robot)
    configurePrimaryRelay(config) {
        this.primaryConfig = {
            id: config.id || 'robot-primary-001',
            name: config.name || 'Robot Primary Relay',
            robotId: config.robotId || 'robot-alpha-001',
            capabilities: ['elevator_control', 'floor_selection', 'door_control', 'status_monitoring'],
            serialPort: config.serialPort || 'COM3' // Update with actual port
        };
        console.log('Primary relay configured:', this.primaryConfig.name);
    }

    // Configure secondary relay (elevator)
    configureSecondaryRelay(config) {
        this.secondaryConfig = {
            id: config.id || 'elevator-secondary-001',
            name: config.name || 'Elevator Secondary Relay',
            elevatorId: config.elevatorId || 'elevator-main-001',
            capabilities: ['floor_control', 'door_control', 'status_reporting'],
            serialPort: config.serialPort || 'COM4' // Update with actual port
        };
        console.log('Secondary relay configured:', this.secondaryConfig.name);
    }

    // Connect to relay serial ports
    async connectToRelays() {
        console.log('Connecting to relay serial ports...');
        
        try {
            // Connect to primary relay
            this.primaryPort = new SerialPort.SerialPort({
                path: this.primaryConfig.serialPort,
                baudRate: 115200,
                autoOpen: false
            });

            this.primaryPort.on('data', (data) => {
                this.handlePrimaryData(data.toString());
            });

            this.primaryPort.on('error', (err) => {
                console.error('Primary relay serial error:', err.message);
            });

            await new Promise((resolve, reject) => {
                this.primaryPort.open((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Connect to secondary relay
            this.secondaryPort = new SerialPort.SerialPort({
                path: this.secondaryConfig.serialPort,
                baudRate: 115200,
                autoOpen: false
            });

            this.secondaryPort.on('data', (data) => {
                this.handleSecondaryData(data.toString());
            });

            this.secondaryPort.on('error', (err) => {
                console.error('Secondary relay serial error:', err.message);
            });

            await new Promise((resolve, reject) => {
                this.secondaryPort.open((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            this.testResults.primaryRelay.connected = true;
            this.testResults.secondaryRelay.connected = true;
            
            console.log('✅ Connected to both relay serial ports');
            
            // Wait for relay identification
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.error('❌ Failed to connect to relays:', error.message);
            throw error;
        }
    }

    // Handle data from primary relay
    handlePrimaryData(data) {
        const lines = data.split('\n');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            // Extract MAC address
            if (trimmedLine.includes('MAC Address:')) {
                const macMatch = trimmedLine.match(/MAC Address: (.+)/);
                if (macMatch) {
                    this.testResults.primaryRelay.macAddress = macMatch[1];
                    console.log(`📡 Primary relay MAC: ${macMatch[1]}`);
                }
            }

            // Track sent commands
            if (trimmedLine.includes('Sent:')) {
                this.testResults.primaryRelay.commandsSent++;
                console.log(`   📤 Primary: ${trimmedLine}`);
                this.lastCommandTime = Date.now();
            }

            // Track received responses
            if (trimmedLine.includes('Received from:') || trimmedLine.includes('Message:')) {
                this.testResults.primaryRelay.responsesReceived++;
                const responseTime = Date.now() - this.lastCommandTime;
                this.testResults.primaryRelay.responseTimes.push(responseTime);
                console.log(`   ✅ Primary received response (${responseTime}ms)`);
            }

            // Check for delivery status
            if (trimmedLine.includes('Delivery Success')) {
                console.log(`   ✅ ESP-NOW delivery successful`);
            } else if (trimmedLine.includes('Delivery Fail')) {
                console.log(`   ❌ ESP-NOW delivery failed`);
            }
        }
    }

    // Handle data from secondary relay
    handleSecondaryData(data) {
        const lines = data.split('\n');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            // Extract MAC address
            if (trimmedLine.includes('MAC Address:')) {
                const macMatch = trimmedLine.match(/MAC Address: (.+)/);
                if (macMatch) {
                    this.testResults.secondaryRelay.macAddress = macMatch[1];
                    console.log(`📡 Secondary relay MAC: ${macMatch[1]}`);
                }
            }

            // Track received commands
            if (trimmedLine.includes('Command:') || trimmedLine.includes('Received from:')) {
                this.testResults.secondaryRelay.commandsReceived++;
                console.log(`   📥 Secondary: ${trimmedLine}`);
            }

            // Track sent responses
            if (trimmedLine.includes('Sent:')) {
                this.testResults.secondaryRelay.responsesSent++;
                console.log(`   📤 Secondary: ${trimmedLine}`);
            }
        }
    }

    // Test ESP-NOW communication
    async testESPNowCommunication() {
        console.log('\n=== Test 1: ESP-NOW Communication ===');
        
        // Wait for initial communication to establish
        console.log('   🔄 Waiting for ESP-NOW communication to establish...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Monitor communication for 30 seconds
        const testDuration = 30000; // 30 seconds
        const startTime = Date.now();
        
        console.log(`   🔄 Monitoring ESP-NOW communication for ${testDuration/1000} seconds...`);
        
        while (Date.now() - startTime < testDuration) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check if communication is working
            if (this.testResults.primaryRelay.commandsSent > 0 && 
                this.testResults.primaryRelay.responsesReceived > 0) {
                this.testResults.espNowCommunication = true;
            }
        }
        
        console.log('✅ ESP-NOW communication test completed');
    }

    // Test elevator commands
    async testElevatorCommands() {
        console.log('\n=== Test 2: Elevator Commands ===');
        
        // The ESP-NOW firmware automatically sends commands
        // We just monitor the responses
        console.log('   🔄 Monitoring elevator command responses...');
        
        const initialCommands = this.testResults.primaryRelay.commandsSent;
        const initialResponses = this.testResults.primaryRelay.responsesReceived;
        
        // Wait for more commands to be sent
        await new Promise(resolve => setTimeout(resolve, 15000)); // 15 seconds
        
        const finalCommands = this.testResults.primaryRelay.commandsSent;
        const finalResponses = this.testResults.primaryRelay.responsesReceived;
        
        const newCommands = finalCommands - initialCommands;
        const newResponses = finalResponses - initialResponses;
        
        console.log(`   📊 Commands sent: ${newCommands}`);
        console.log(`   📊 Responses received: ${newResponses}`);
        console.log(`   📊 Success rate: ${newCommands > 0 ? ((newResponses / newCommands) * 100).toFixed(1) : 0}%`);
        
        console.log('✅ Elevator commands test completed');
    }

    // Test communication reliability
    async testCommunicationReliability() {
        console.log('\n=== Test 3: Communication Reliability ===');
        
        const testDuration = 60000; // 60 seconds
        const startTime = Date.now();
        const initialCommands = this.testResults.primaryRelay.commandsSent;
        const initialResponses = this.testResults.primaryRelay.responsesReceived;
        
        console.log(`   🔄 Running reliability test for ${testDuration/1000} seconds...`);
        
        while (Date.now() - startTime < testDuration) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const finalCommands = this.testResults.primaryRelay.commandsSent;
        const finalResponses = this.testResults.primaryRelay.responsesReceived;
        
        const totalCommands = finalCommands - initialCommands;
        const totalResponses = finalResponses - initialResponses;
        const successRate = totalCommands > 0 ? (totalResponses / totalCommands) * 100 : 0;
        
        // Calculate average response time
        const responseTimes = this.testResults.primaryRelay.responseTimes.slice(-totalResponses);
        const avgResponseTime = responseTimes.length > 0 ? 
            responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
        
        console.log(`   📊 Total Commands: ${totalCommands}`);
        console.log(`   📊 Total Responses: ${totalResponses}`);
        console.log(`   📊 Success Rate: ${successRate.toFixed(1)}%`);
        console.log(`   ⏱️  Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
        
        this.testResults.reliability = {
            successRate,
            avgResponseTime,
            totalTests: totalCommands,
            successfulTests: totalResponses
        };
        
        console.log('✅ Communication reliability test completed');
    }

    // Generate comprehensive test report
    generateReport() {
        console.log('\n📊 === ESP-NOW Relay Communication Test Report ===');
        
        // Connection status
        console.log('\n🔗 Communication Status:');
        console.log(`   Primary Relay (Robot): ${this.testResults.primaryRelay.connected ? '✅ Connected' : '❌ Not Connected'}`);
        console.log(`   Secondary Relay (Elevator): ${this.testResults.secondaryRelay.connected ? '✅ Connected' : '❌ Not Connected'}`);
        console.log(`   ESP-NOW Communication: ${this.testResults.espNowCommunication ? '✅ Established' : '❌ Failed'}`);
        
        // MAC Addresses
        if (this.testResults.primaryRelay.macAddress) {
            console.log(`   Primary MAC: ${this.testResults.primaryRelay.macAddress}`);
        }
        if (this.testResults.secondaryRelay.macAddress) {
            console.log(`   Secondary MAC: ${this.testResults.secondaryRelay.macAddress}`);
        }
        
        // Communication statistics
        console.log('\n📈 Communication Statistics:');
        console.log(`   Commands Sent: ${this.testResults.primaryRelay.commandsSent}`);
        console.log(`   Responses Received: ${this.testResults.primaryRelay.responsesReceived}`);
        console.log(`   Commands Received by Secondary: ${this.testResults.secondaryRelay.commandsReceived}`);
        console.log(`   Responses Sent by Secondary: ${this.testResults.secondaryRelay.responsesSent}`);
        
        if (this.testResults.primaryRelay.responseTimes.length > 0) {
            const avgResponseTime = this.testResults.primaryRelay.responseTimes.reduce((a, b) => a + b, 0) / this.testResults.primaryRelay.responseTimes.length;
            const minResponseTime = Math.min(...this.testResults.primaryRelay.responseTimes);
            const maxResponseTime = Math.max(...this.testResults.primaryRelay.responseTimes);
            
            console.log('\n⏱️  Response Times:');
            console.log(`   Average: ${avgResponseTime.toFixed(2)}ms`);
            console.log(`   Minimum: ${minResponseTime}ms`);
            console.log(`   Maximum: ${maxResponseTime}ms`);
        }
        
        // Reliability results
        if (this.testResults.reliability) {
            console.log('\n🎯 Reliability Results:');
            console.log(`   Success Rate: ${this.testResults.reliability.successRate.toFixed(1)}%`);
            console.log(`   Average Response Time: ${this.testResults.reliability.avgResponseTime.toFixed(2)}ms`);
        }
        
        // Overall assessment
        console.log('\n🎯 Overall Assessment:');
        const overallSuccess = this.testResults.espNowCommunication && 
                              this.testResults.primaryRelay.responsesReceived > 0;
        
        console.log(`   ESP-NOW Communication: ${overallSuccess ? '✅ WORKING' : '❌ FAILED'}`);
        console.log(`   Robot-Elevator Integration: ${overallSuccess ? '✅ READY' : '❌ NEEDS FIXING'}`);
        
        if (overallSuccess) {
            console.log('\n🚀 Your ESP-NOW relay communication is working correctly!');
            console.log('   The robot can now communicate wirelessly with the elevator relay.');
        } else {
            console.log('\n🔧 Issues detected. Please check:');
            console.log('   1. ESP-NOW firmware is uploaded to both relays');
            console.log('   2. MAC addresses are correctly configured');
            console.log('   3. Relays are within range of each other');
            console.log('   4. Serial ports are correctly connected');
        }
    }

    // Disconnect from relays
    async disconnect() {
        if (this.primaryPort) {
            this.primaryPort.close();
        }
        if (this.secondaryPort) {
            this.secondaryPort.close();
        }
        console.log('Disconnected from relay serial ports');
    }

    // Run all tests
    async runAllTests() {
        console.log('🚀 Starting ESP-NOW Relay Communication Tests');
        console.log('============================================');
        console.log('🤖 Primary Relay: Robot ESP32-S3 6ch Relay (ESP-NOW)');
        console.log('🏢 Secondary Relay: Elevator ESP32-S3 6ch Relay (ESP-NOW)');
        console.log('📡 Communication: ESP-NOW Wireless');
        console.log('');
        
        try {
            // Connect to relays
            await this.connectToRelays();
            
            // Test 1: ESP-NOW communication
            await this.testESPNowCommunication();
            
            // Test 2: Elevator commands
            await this.testElevatorCommands();
            
            // Test 3: Communication reliability
            await this.testCommunicationReliability();
            
            // Generate comprehensive report
            this.generateReport();
            
            console.log('\n🎉 All tests completed!');
            
        } catch (error) {
            console.error('❌ Test suite failed:', error.message);
        } finally {
            await this.disconnect();
        }
    }
}

// Example usage and test configuration
async function main() {
    const tester = new ESPNowCommunicationTester();
    
    // Configure primary relay (on robot)
    tester.configurePrimaryRelay({
        id: 'robot-primary-001',
        name: 'Robot Alpha Primary Relay',
        robotId: 'robot-alpha-001',
        capabilities: ['elevator_control', 'floor_selection', 'door_control', 'status_monitoring'],
        serialPort: 'COM3' // Update with your actual port
    });
    
    // Configure secondary relay (on elevator)
    tester.configureSecondaryRelay({
        id: 'elevator-secondary-001',
        name: 'Main Building Elevator Relay',
        elevatorId: 'elevator-main-001',
        capabilities: ['floor_control', 'door_control', 'status_reporting'],
        serialPort: 'COM4' // Update with your actual port
    });
    
    // Run the tests
    await tester.runAllTests();
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\n🛑 Stopping tests...');
    process.exit(0);
});

// Export for use in other modules
module.exports = ESPNowCommunicationTester;

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
} 