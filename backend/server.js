const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const WorkflowManager = require('./core/WorkflowManager');
const RobotManager = require('./core/RobotManager');
const MapManager = require('./core/MapManager');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const robotMaps = require('./robot-maps.js');
const db = require('../db');
const JWT_SECRET = 'your-secret-key';
const cron = require('node-cron');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Ensure JSON and CORS middleware are set before any routes
app.use(express.json());
app.use(cors());

// Initialize managers
const workflowManager = new WorkflowManager();
const robotManager = new RobotManager();
const mapManager = new MapManager();

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    jwt.verify(token, 'your-secret-key', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// === Template and user endpoints (from server.js) ===
app.get('/api/templates', authenticateToken, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM templates ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching templates:', err);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

app.post('/api/templates', authenticateToken, async (req, res) => {
    const { name, color, robotId, bossUser, stationary } = req.body;

    if (!name || !color || !robotId || !bossUser || !bossUser.username || !bossUser.password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        // Convert robotId to integer and find the robot by id
        const robotIdInt = parseInt(robotId, 10);
        if (isNaN(robotIdInt)) {
            return res.status(400).json({ error: 'Invalid robot ID' });
        }
        
        const robotResult = await db.query('SELECT * FROM robots WHERE id = $1', [robotIdInt]);
        if (robotResult.rows.length === 0) {
            return res.status(404).json({ error: 'Robot not found' });
        }
        const robot = robotResult.rows[0];

        // Insert the template
        const insertSql = `
            INSERT INTO templates (name, color, robot, boss_user, stationary)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const result = await db.query(insertSql, [
        name,
        color,
            JSON.stringify(robot),
            JSON.stringify(bossUser),
            stationary || false
        ]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating template:', err);
        console.error('Request body:', req.body);
        res.status(500).json({ error: 'Failed to create template' });
    }
});

app.put('/api/templates/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, color, stationary } = req.body;

    try {
        const result = await db.query(
            'UPDATE templates SET name = $1, color = $2, stationary = $3 WHERE id = $4 RETURNING *',
            [name, color, stationary || false, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating template:', err);
        res.status(500).json({ error: 'Failed to update template' });
    }
});

app.delete('/api/templates/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        // Start a transaction
        await db.query('BEGIN');

        // Hard delete the template
        const result = await db.query('DELETE FROM templates WHERE id = $1', [id]);
        
        if (result.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Template not found' });
        }

        // Commit the transaction
        await db.query('COMMIT');
        res.status(204).send();
    } catch (err) {
        // Rollback in case of error
        await db.query('ROLLBACK');
        console.error('Error deleting template:', err);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

app.get('/api/templates/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query('SELECT * FROM templates WHERE id = $1', [id]);
        if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
    }
        const template = result.rows[0];
        // If robot is stored as JSONB, parse it if needed
        if (template.robot && typeof template.robot === 'string') {
            try {
                template.robot = JSON.parse(template.robot);
            } catch (e) {
                console.error('Error parsing robot JSON:', e);
            }
    }
    res.json(template);
    } catch (err) {
        console.error('Error fetching template:', err);
        res.status(500).json({ error: 'Failed to fetch template' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        console.error('Missing username or password in login request:', req.body);
        return res.status(400).json({ error: 'Missing username or password' });
    }
    if (username === 'Ozzydog' && password === 'Ozzydog') {
        const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
        res.json({
            token,
            user: {
                username,
                role: 'admin'
            }
        });
        return;
    }
    try {
        const result = await db.query('SELECT * FROM templates');
        const templates = result.rows;
    for (const template of templates) {
            let bossUser = template.boss_user;
            if (typeof bossUser === 'string') {
                try { bossUser = JSON.parse(bossUser); } catch (e) { bossUser = null; }
            }
            if (bossUser && bossUser.username === username && bossUser.password === password) {
                const token = jwt.sign({ username, role: 'boss', templateId: template.id, templateName: template.name }, JWT_SECRET, { expiresIn: '1h' });
            res.json({
                token,
                user: {
                    username,
                    role: 'boss',
                    templateId: template.id,
                    templateName: template.name
                }
            });
            return;
        }
        if (template.users) {
                // If users are stored as JSONB, parse if needed
                let users = template.users;
                if (typeof users === 'string') {
                    try { users = JSON.parse(users); } catch (e) { users = []; }
                }
                const user = users.find(u => u.username === username && u.password === password);
            if (user) {
                    const token = jwt.sign({ username, role: 'user', templateId: template.id, templateName: template.name }, JWT_SECRET, { expiresIn: '1h' });
                res.json({
                    token,
                    user: {
                        username,
                        role: 'user',
                        templateId: template.id,
                        templateName: template.name
                    }
                });
                return;
            }
        }
    }
    res.status(401).json({ error: 'Invalid credentials' });
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/templates/:id/users', (req, res) => {
    const { id } = req.params;
    const { username, password } = req.body;
    const templates = readData(TEMPLATES_FILE);
    const template = templates.find(t => t.id === id);
    if (!template) {
        return res.status(404).json({ error: 'Template not found' });
    }
    if (!template.users) {
        template.users = [];
    }
    if (template.users.some(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }
    template.users.push({ username, password });
    writeData(TEMPLATES_FILE, templates);
    res.status(201).json({ message: 'User added successfully' });
});

app.get('/api/templates/:id/users', (req, res) => {
    const { id } = req.params;
    const templates = readData(TEMPLATES_FILE);
    const template = templates.find(t => t.id === id);
    if (!template) {
        return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template.users || []);
});

app.delete('/api/templates/:id/users/:username', authenticateToken, async (req, res) => {
    const { id, username } = req.params;
    try {
        // Start a transaction
        await db.query('BEGIN');

        // Get the current template
        const templateResult = await db.query('SELECT boss_user FROM templates WHERE id = $1', [id]);
        
        if (templateResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Template not found' });
        }

        const currentBossUser = templateResult.rows[0].boss_user;
        
        // If the boss user matches the username to remove, set it to null
        if (currentBossUser && currentBossUser.username === username) {
            await db.query('UPDATE templates SET boss_user = NULL WHERE id = $1', [id]);
        }

        // Commit the transaction
        await db.query('COMMIT');
        res.status(204).send();
    } catch (err) {
        // Rollback in case of error
        await db.query('ROLLBACK');
        console.error('Error removing user from template:', err);
        res.status(500).json({ error: 'Failed to remove user from template' });
    }
});

// Simple user authentication
const users = {
    'Ozzydog': {
        password: 'Ozzydog',
        role: 'admin'
    }
};

// Middleware to check authentication
const checkAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = Buffer.from(token, 'base64').toString();
        const [username, password] = decoded.split(':');
        
        if (users[username] && users[username].password === password) {
            req.user = { username, role: users[username].role };
            next();
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Robot configuration
const robotConfig = {
    serialNumber: 'L382502104987ir',
    publicIP: '47.180.91.99',
    privateIP: '192.168.1.97',
    port: 8090,
    secretKey: '667a51a4d948433081a272c78d10a8a4',
    name: 'Public Robot',
    type: 'standard'
};

// Register the robot
try {
    const robotId = robotManager.addRobot(robotConfig);
    console.log(`Robot registered with ID: ${robotId}`);
    
    // Connect to the robot
    robotManager.connectRobot(robotId).then(() => {
        console.log('Successfully connected to robot');
    }).catch(error => {
        console.error('Failed to connect to robot:', error);
    });
} catch (error) {
    console.error('Failed to register robot:', error);
}

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Robot registration endpoint
app.post('/api/robots/register', async (req, res) => {
    console.log('Robot registration request body:', req.body);
    const { serialNumber, secretKey, name, publicIp, publicIP, privateIp, privateIP, maps } = req.body;
    const finalPublicIp = publicIp || publicIP;
    const finalPrivateIp = privateIp || privateIP;
    if (!serialNumber || !secretKey || !name || !finalPublicIp || !finalPrivateIp) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        await db.query('BEGIN');

        // Insert or update robot
        const robotResult = await db.query(
            `INSERT INTO robots (serial_number, secret_key, name, public_ip, private_ip)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (serial_number) DO UPDATE
             SET secret_key = $2, name = $3, public_ip = $4, private_ip = $5
             RETURNING serial_number`,
            [serialNumber, secretKey, name, finalPublicIp, finalPrivateIp]
        );

        // Confirm robot was inserted/updated
        if (!robotResult.rows.length) {
            await db.query('ROLLBACK');
            return res.status(500).json({ error: 'Failed to insert robot' });
        }

        // Only insert maps if robot insert succeeded
        if (maps && Array.isArray(maps)) {
            await db.query('DELETE FROM maps WHERE robot_serial_number = $1', [serialNumber]);
            for (const map of maps) {
                await db.query(
                    `INSERT INTO maps (
                        robot_serial_number, map_name, features, uid, create_time, map_version, overlays_version, thumbnail_url, image_url, url
                    ) VALUES ($1, $2, $3, $4, to_timestamp($5), $6, $7, $8, $9, $10)`,
                    [
                        serialNumber,
                        map.map_name,
                        map.features,
                        map.uid,
                        map.create_time,
                        map.map_version,
                        map.overlays_version,
                        map.thumbnail_url,
                        map.image_url,
                        map.url
                    ]
                );
            }
        }

        // Connect to the new robot after registration
        try {
            robotManager.addRobot({
                serialNumber: serialNumber,
                secretKey: secretKey,
                publicIP: finalPublicIp,
                privateIP: finalPrivateIp
            });
            await robotManager.connectRobot(serialNumber);
            console.log(`Connected to new robot: ${name} (${serialNumber})`);
        } catch (err) {
            console.error('Failed to connect to new robot:', err);
        }

        await db.query('COMMIT');
        res.json({ message: 'Robot registered successfully' });
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Error registering robot:', error);
        res.status(500).json({ error: 'Failed to register robot' });
    }
});

// Get all robots endpoint
app.get('/api/robots', authenticateToken, async (req, res) => {
    const user = req.user;
    try {
        const robotsResult = await db.query('SELECT * FROM robots ORDER BY id');
        // Normalize fields to camelCase for frontend compatibility
        const robots = robotsResult.rows.map(robot => ({
            ...robot,
            publicIp: robot.public_ip,
            privateIp: robot.private_ip,
            secretKey: robot.secret_key,
            serialNumber: robot.serial_number,
        }));
    if (user.role === 'admin') {
        // Admin sees all robots
        return res.json(robots);
    } else if (user.role === 'boss' || user.role === 'user') {
        // Boss/user sees only robots assigned to their template
            const templatesResult = await db.query('SELECT * FROM templates');
            const templates = templatesResult.rows;
            const template = templates.find(t => t.id == user.templateId);
        if (!template || !template.robot) {
            return res.json([]);
        }
        // Support both single robot and robots array
        let assignedRobots = [];
        if (template.robots && Array.isArray(template.robots)) {
                assignedRobots = robots.filter(r => template.robots.some(tr => (tr.serial_number || tr.serialNumber) === r.serial_number));
        } else if (template.robot) {
                assignedRobots = robots.filter(r => (template.robot.serial_number || template.robot.serialNumber) === r.serial_number);
        }
        return res.json(assignedRobots);
    } else {
        // Unknown role
        return res.status(403).json({ error: 'Forbidden' });
        }
    } catch (error) {
        console.error('Error fetching robots from database:', error);
        res.status(500).json({ error: 'Failed to fetch robots from database' });
    }
});

// Update robot endpoint
app.put('/api/robots/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { name, publicIP, privateIP, secretKey } = req.body;

    if (!name || !publicIP || !privateIP || !secretKey) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const sql = `UPDATE robots 
                SET name = $1, public_ip = $2, private_ip = $3, secret_key = $4
                WHERE id = $5`;

    db.query(sql, [name, publicIP, privateIP, secretKey, id], (err, result) => {
        if (err) {
            console.error('Error updating robot:', err);
            return res.status(500).json({ error: 'Failed to update robot' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Robot not found' });
        }

        res.json({ message: 'Robot updated successfully' });
    });
});

// Delete robot endpoint
app.delete('/api/robots/:serialNumber', authenticateToken, async (req, res) => {
    const { serialNumber } = req.params;

    try {
        // Start a transaction
        await db.query('BEGIN');

        // Delete related task_queue entries
        await db.query('DELETE FROM task_queue WHERE robot_serial_number = $1', [serialNumber]);

        // Delete associated maps
        await db.query('DELETE FROM maps WHERE robot_serial_number = $1', [serialNumber]);

        // Hard delete the robot
        const result = await db.query('DELETE FROM robots WHERE serial_number = $1', [serialNumber]);

        if (result.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Robot not found' });
        }

        // Remove robot from robot manager
        try {
            robotManager.removeRobot(serialNumber);
        } catch (err) {
            console.error('Error removing robot from manager:', err);
        }

        // Commit the transaction
        await db.query('COMMIT');

        res.json({ message: 'Robot deleted successfully' });
    } catch (err) {
        // Rollback in case of error
        await db.query('ROLLBACK');
        console.error('Error deleting robot:', err);
        res.status(500).json({ error: 'Failed to delete robot' });
    }
});

// Protected API routes
app.post('/api/robots', checkAuth, (req, res) => {
    try {
        const robotId = robotManager.addRobot(req.body);
        res.json({ robotId });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/workflows', checkAuth, (req, res) => {
    try {
        const workflow = workflowManager.createWorkflow(
            req.body.template,
            req.body.robotId,
            req.body.mapId,
            req.body.options
        );
        res.json({ workflowId: workflow.id });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/maps', checkAuth, (req, res) => {
    try {
        const maps = mapManager.getAllMaps();
        res.json({ maps });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get robot maps
app.get('/api/robot-maps', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT r.serial_number, r.secret_key, 
                   json_agg(json_build_object(
                       'id', m.id,
                       'map_name', m.map_name,
                       'features', m.features
                   )) as maps
            FROM robots r
            LEFT JOIN maps m ON r.serial_number = m.robot_serial_number
            GROUP BY r.serial_number, r.secret_key
        `);

        const robotMaps = result.rows.map(row => ({
            robot: {
                serialNumber: row.serial_number,
                secretKey: row.secret_key
            },
            maps: row.maps[0] === null ? [] : row.maps
        }));

        console.log('Sending robotMaps to frontend:', JSON.stringify(robotMaps, null, 2));
        res.json(robotMaps);
    } catch (error) {
        console.error('Error fetching robot maps:', error);
        res.status(500).json({ error: 'Failed to fetch robot maps' });
    }
});

// Update robot maps
app.post('/api/robot-maps', async (req, res) => {
    const { serialNumber, maps } = req.body;
    if (!serialNumber || !maps) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Start a transaction
        await db.query('BEGIN');

        // Delete existing maps for this robot
        await db.query('DELETE FROM maps WHERE robot_serial_number = $1', [serialNumber]);

        // Insert new maps
        for (const map of maps) {
            await db.query(
                `INSERT INTO maps (
                    robot_serial_number, map_name, features, uid, create_time, map_version, overlays_version, thumbnail_url, image_url, url
                ) VALUES ($1, $2, $3, $4, to_timestamp($5), $6, $7, $8, $9, $10)`,
                [
                    serialNumber,
                    map.map_name,
                    map.features,
                    map.uid,
                    map.create_time,
                    map.map_version,
                    map.overlays_version,
                    map.thumbnail_url,
                    map.image_url,
                    map.url
                ]
            );
        }

        // Commit the transaction
        await db.query('COMMIT');

        res.json({ message: 'Maps updated successfully' });
    } catch (error) {
        // Rollback in case of error
        await db.query('ROLLBACK');
        console.error('Error updating robot maps:', error);
        res.status(500).json({ error: 'Failed to update robot maps' });
    }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New client connected');

    // Handle messages from clients
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            handleWebSocketMessage(ws, data);
        } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Handle WebSocket messages
async function handleWebSocketMessage(ws, data) {
    switch (data.type) {
        case 'register_robot':
            const robotId = robotManager.addRobot(data.robot);
            ws.send(JSON.stringify({ type: 'robot_registered', robotId }));
            break;

        case 'start_workflow':
            const workflow = workflowManager.createWorkflow(
                data.template,
                data.robotId,
                data.mapId,
                data.options
            );
            await workflowManager.startWorkflow(workflow.id);
            ws.send(JSON.stringify({ type: 'workflow_started', workflowId: workflow.id }));
            break;

        case 'get_robot_status':
            const status = robotManager.getRobotStatus(data.robotId);
            ws.send(JSON.stringify({ type: 'robot_status', status }));
            break;

        case 'get_map_points':
            const points = mapManager.getMapPoints(data.mapId);
            ws.send(JSON.stringify({ type: 'map_points', points }));
            break;

        default:
            ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
}

// Event handling
workflowManager.on('workflowStarted', (workflow) => {
    broadcastToClients({ type: 'workflow_started', workflow });
});

workflowManager.on('workflowCompleted', (workflow) => {
    broadcastToClients({ type: 'workflow_completed', workflow });
});

workflowManager.on('workflowFailed', ({ workflow, error }) => {
    broadcastToClients({ type: 'workflow_failed', workflow, error: error.message });
});

robotManager.on('robotStatusUpdated', ({ id, status }) => {
    broadcastToClients({ type: 'robot_status_updated', robotId: id, status });
});

// Broadcast to all connected clients
function broadcastToClients(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Every 2 minutes, delete all but the latest map for each robot/map_name
cron.schedule('*/2 * * * *', async () => {
    try {
        await db.query(`
            DELETE FROM maps
            WHERE id NOT IN (
                SELECT DISTINCT ON (robot_serial_number, map_name) id
                FROM maps
                ORDER BY robot_serial_number, map_name, created_at DESC
            )
        `);
        console.log('Old map data cleaned up');
    } catch (err) {
        console.error('Error cleaning up map data:', err);
    }
});

// Add RobotConfig class at the top level
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

// Update helper functions to use RobotConfig
async function sendMoveTask(robot, params) {
    const robotConfig = new RobotConfig(robot);
    const moveParams = {
        ...params,
        properties: {
            max_trans_vel: 0.3,
            max_rot_vel: 0.3,
            acc_lim_x: 0.3,
            acc_lim_theta: 0.3,
            planning_mode: 'directional'
        }
    };
    console.log('=== Move Task Fetch Details ===');
    console.log('Robot Config:', {
        serialNumber: robotConfig.serialNumber,
        publicIp: robotConfig.publicIp,
        localIp: robotConfig.localIp,
        secret: robotConfig.secret
    });
    console.log('URL:', `${robotConfig.getBaseUrl()}/chassis/moves`);
    console.log('Headers:', robotConfig.getHeaders());
    console.log('Body:', JSON.stringify(moveParams, null, 2));

    const response = await fetch(`${robotConfig.getBaseUrl()}/chassis/moves`, {
        method: 'POST',
        headers: robotConfig.getHeaders(),
        body: JSON.stringify(moveParams)
    });

    // Get response text for detailed error analysis
    const responseText = await response.text();
    let responseData;
    
    try {
        responseData = JSON.parse(responseText);
    } catch (e) {
        console.log('Response is not JSON:', responseText);
        responseData = { raw_response: responseText };
    }

    if (!response.ok) {
        console.error('Move Task Failed:', {
            status: response.status,
            statusText: response.statusText,
            url: response.url,
            response: responseData
        });
        throw new Error(`Failed to send move command: ${response.status} ${response.statusText} - ${JSON.stringify(responseData)}`);
    }

    console.log('Move Task Response:', responseData);
    return responseData.id || responseData.action_id || responseData.task_id;
}

async function sendJack(robot, service, taskId = null) {
    const robotConfig = new RobotConfig(robot);
    const startTime = new Date();
    
    console.log('=== Jack Operation Fetch Details ===');
    console.log('Robot Config:', {
        serialNumber: robotConfig.serialNumber,
        publicIp: robotConfig.publicIp,
        localIp: robotConfig.localIp,
        secret: robotConfig.secret
    });
    console.log('URL:', `${robotConfig.getBaseUrl()}/services/${service}`);
    console.log('Headers:', robotConfig.getHeaders());

    const errorDetails = {
        operation: 'jack',
        service: service,
        robot_serial: robotConfig.serialNumber,
        robot_ip: robotConfig.publicIp,
        start_time: startTime.toISOString(),
        request: {
            url: `${robotConfig.getBaseUrl()}/services/${service}`,
            method: 'POST',
            headers: robotConfig.getHeaders(),
            body: {}
        }
    };

    try {
        const response = await fetch(`${robotConfig.getBaseUrl()}/services/${service}`, {
            method: 'POST',
            headers: robotConfig.getHeaders(),
            body: JSON.stringify({})
        });

        const endTime = new Date();
        const responseTime = endTime.getTime() - startTime.getTime();

        // Get response text for detailed error analysis
        const responseText = await response.text();
        let responseData;
        
        try {
            responseData = JSON.parse(responseText);
        } catch (e) {
            console.log('Response is not JSON:', responseText);
            responseData = { raw_response: responseText };
        }

        // Add response details to error tracking
        errorDetails.response = {
            status: response.status,
            statusText: response.statusText,
            responseTime: responseTime,
            headers: Object.fromEntries(response.headers.entries()),
            data: responseData,
            text: responseText
        };

        if (!response.ok) {
            console.error('Jack Operation Failed:', {
                status: response.status,
                statusText: response.statusText,
                url: response.url,
                response: responseData,
                responseTime: responseTime
            });
            
            // Store detailed error information if we have a task ID
            if (taskId) {
                try {
                    await db.query(
                        `UPDATE task_queue SET detailed_error = $2 WHERE id = $1`,
                        [taskId, JSON.stringify(errorDetails)]
                    );
                } catch (dbError) {
                    console.error('Failed to store detailed error:', dbError);
                }
            }
            
            throw new Error(`Failed to send jack command: ${response.status} ${response.statusText} - ${JSON.stringify(responseData)}`);
        }

        console.log('Jack Operation Response:', responseData);
        
        // Store successful operation details if we have a task ID
        if (taskId) {
            try {
                await db.query(
                    `UPDATE task_queue SET detailed_error = $2 WHERE id = $1`,
                    [taskId, JSON.stringify({
                        ...errorDetails,
                        success: true,
                        end_time: endTime.toISOString()
                    })]
                );
            } catch (dbError) {
                console.error('Failed to store successful operation details:', dbError);
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (error) {
        const endTime = new Date();
        errorDetails.error = {
            message: error.message,
            stack: error.stack,
            end_time: endTime.toISOString()
        };
        
        console.error('Error in sendJack:', error);
        
        // Store detailed error information if we have a task ID
        if (taskId) {
            try {
                await db.query(
                    `UPDATE task_queue SET detailed_error = $2 WHERE id = $1`,
                    [taskId, JSON.stringify(errorDetails)]
                );
            } catch (dbError) {
                console.error('Failed to store detailed error:', dbError);
            }
        }
        
        throw error;
    }
}

// Function to clear robot errors (for stationary workflows)
async function clearRobotErrors(robot) {
    const robotConfig = new RobotConfig(robot);
    console.log('=== Clearing Robot Errors ===');
    console.log('Robot Config:', {
        serialNumber: robotConfig.serialNumber,
        publicIp: robotConfig.publicIp,
        localIp: robotConfig.localIp,
        secret: robotConfig.secret
    });
    
    try {
        // Try to clear errors via the robot's error clearing endpoint
        const response = await fetch(`${robotConfig.getBaseUrl()}/chassis/clear_errors`, {
            method: 'POST',
            headers: robotConfig.getHeaders(),
            body: JSON.stringify({})
        });
        
        if (response.ok) {
            console.log('✅ Robot errors cleared successfully');
        } else {
            console.log('⚠️ Error clearing endpoint not available, continuing...');
        }
    } catch (error) {
        console.log('⚠️ Could not clear robot errors, continuing...', error.message);
    }
    
    // Also try to clear via services endpoint if available
    try {
        const response2 = await fetch(`${robotConfig.getBaseUrl()}/services/clear_errors`, {
            method: 'POST',
            headers: robotConfig.getHeaders(),
            body: JSON.stringify({})
        });
        
        if (response2.ok) {
            console.log('✅ Robot errors cleared via services endpoint');
        }
    } catch (error) {
        console.log('⚠️ Services error clearing not available');
    }
}

// Function to try to force move or ignore errors (for stationary workflows)
async function tryForceMoveOrIgnoreError(robot, moveParams = null) {
    const robotConfig = new RobotConfig(robot);
    console.log('=== Attempting to Force Move or Ignore Error ===');
    console.log('Robot Config:', {
        serialNumber: robotConfig.serialNumber,
        publicIp: robotConfig.publicIp,
        localIp: robotConfig.localIp,
        secret: robotConfig.secret
    });
    
    // Try to send a modified move command with force flags
    if (moveParams) {
        try {
            console.log('Trying modified move command with force flags');
            const forceMoveParams = {
                ...moveParams,
                force: true,
                ignore_errors: true,
                ignore_safety: true,
                stationary_rack: true
            };
            
            const response = await fetch(`${robotConfig.getBaseUrl()}/chassis/moves`, {
                method: 'POST',
                headers: robotConfig.getHeaders(),
                body: JSON.stringify(forceMoveParams)
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Force move command succeeded:', data);
                return data.id || data.action_id || data.task_id;
            } else {
                console.log('❌ Force move command failed:', response.status, response.statusText);
            }
        } catch (error) {
            console.log('❌ Error with force move command:', error.message);
        }
    }
    
    // Try to clear errors via the robot's error clearing endpoint
    try {
        console.log('Trying to clear robot errors');
        const response = await fetch(`${robotConfig.getBaseUrl()}/chassis/clear_errors`, {
            method: 'POST',
            headers: robotConfig.getHeaders(),
            body: JSON.stringify({})
        });
        
        if (response.ok) {
            console.log('✅ Robot errors cleared successfully');
            return true;
        } else {
            console.log('⚠️ Error clearing endpoint not available');
        }
    } catch (error) {
        console.log('⚠️ Could not clear robot errors:', error.message);
    }
    
    console.log('⚠️ No force/ignore endpoints worked');
    return false;
}

async function checkMoveStatus(robot, moveId) {
    const robotConfig = new RobotConfig(robot);
    console.log('=== Move Status Check Fetch Details ===');
    console.log('Robot Config:', {
        serialNumber: robotConfig.serialNumber,
        publicIp: robotConfig.publicIp,
        localIp: robotConfig.localIp,
        secret: robotConfig.secret
    });
    console.log('URL:', `${robotConfig.getBaseUrl()}/chassis/moves/${moveId}`);
    console.log('Headers:', robotConfig.getHeaders());

    try {
        const response = await fetch(`${robotConfig.getBaseUrl()}/chassis/moves/${moveId}`, {
            headers: robotConfig.getHeaders()
        });
        
        // Get response text for detailed error analysis
        const responseText = await response.text();
        let responseData;
        
        try {
            responseData = JSON.parse(responseText);
        } catch (e) {
            console.log('Response is not JSON:', responseText);
            responseData = { raw_response: responseText };
        }
        
        if (!response.ok) {
            console.error('Move Status Check Failed:', {
                status: response.status,
                statusText: response.statusText,
                url: response.url,
                response: responseData
            });
            throw new Error(`Failed to check move status: ${response.status} ${response.statusText} - ${JSON.stringify(responseData)}`);
        }
        
        console.log('Move Status Response:', responseData);
        
        // Check for detailed error information in the response
        if (responseData.state === 'failed' && responseData.error) {
            console.error('Move failed with detailed error:', responseData.error);
        }
        
        if (responseData.state === 'failed' && responseData.message) {
            console.error('Move failed with message:', responseData.message);
        }
        
        return responseData.state || 'unknown';
    } catch (error) {
        console.error('Error checking move status:', error);
        return 'failed';
    }
}

// Update waitForMoveComplete with better status checking
async function waitForMoveComplete(robot, moveId, timeout = 600000, isStationary = false) {
    const startTime = Date.now();
    let isMoving = true;

    while (isMoving && (Date.now() - startTime) < timeout) {
        const status = await checkMoveStatus(robot, moveId);
        console.log('Current move status:', status);

        if (status === 'succeeded') {
            isMoving = false;
            console.log('✅ Move completed successfully');
        } else if (status === 'failed' || status === 'cancelled') {
            // Get detailed error information
            let detailedError = `Move failed with status: ${status}`;
            
            try {
                const robotConfig = new RobotConfig(robot);
                const response = await fetch(`${robotConfig.getBaseUrl()}/chassis/moves/${moveId}`, {
                    headers: robotConfig.getHeaders()
                });
                const responseText = await response.text();
                let responseData;
                
                try {
                    responseData = JSON.parse(responseText);
                    if (responseData.error) {
                        detailedError += ` - Error: ${JSON.stringify(responseData.error)}`;
                    }
                    if (responseData.message) {
                        detailedError += ` - Message: ${responseData.message}`;
                    }
                    if (responseData.details) {
                        detailedError += ` - Details: ${JSON.stringify(responseData.details)}`;
                    }
                } catch (e) {
                    detailedError += ` - Raw response: ${responseText}`;
                }
            } catch (e) {
                console.log('Could not get detailed error info:', e.message);
            }
            
            console.error('Move failed with detailed error:', detailedError);
            
            // For stationary workflows, try to force the move before giving up
            if (isStationary) {
                console.log('⚠️ Move failed, attempting to force/ignore error for stationary workflow...');
                const forceResult = await tryForceMoveOrIgnoreError(robot);
                if (forceResult) {
                    console.log('✅ Force move successful, continuing...');
                    isMoving = false;
                    return; // Continue as if move succeeded
                }
            }
            throw new Error(detailedError);
        } else {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    if (isMoving) {
        throw new Error(`Move timed out after ${timeout}ms`);
    }
}

// Add retry mechanism for bin operations
async function executeWithRetry(operation, maxRetries = 3, operationName = 'Operation') {
    let retryCount = 0;
    let success = false;
    let lastError;
    let result;

    while (!success && retryCount < maxRetries) {
        try {
            result = await operation();
            success = true;
        } catch (error) {
            lastError = error;
            console.error(`${operationName} failed (Attempt ${retryCount + 1}/${maxRetries}):`, error);
            
            if (retryCount < maxRetries - 1) {
                console.log(`Retrying in 5 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        retryCount++;
    }

    if (!success) {
        throw new Error(`${operationName} failed after ${maxRetries} attempts: ${lastError.message}`);
    }
    
    return result;
}

// Helper to get required map features for a robot/floor
async function getRequiredFeaturesForTask(robot, floor, shelfPoint, type, carryingBin) {
    const mapName = `Floor${floor}`;
    console.log(`[FEATURES] Looking for map ${mapName} for robot ${robot.serialNumber}`);
    
    const mapResult = await db.query(
        'SELECT * FROM maps WHERE robot_serial_number = $1 AND map_name = $2',
        [robot.serialNumber, mapName]
    );
    
    if (mapResult.rows.length === 0) {
        throw new Error(`Map for Floor${floor} not found for this robot`);
    }
    
    let features = mapResult.rows[0].features;
    console.log(`[FEATURES] Raw features from DB:`, features);
    
    if (typeof features === 'string') {
        try { 
            features = JSON.parse(features);
            console.log(`[FEATURES] Parsed features:`, features);
        } catch (e) { 
            console.error(`[FEATURES] Failed to parse features:`, e);
            features = []; 
        }
    }
    
    function getFeatureInfo(name) {
        const feature = features.find(f => f.name === name);
        console.log(`[FEATURES] Looking for feature "${name}":`, feature);
        return feature;
    }
    
    // Accept only 'Charging Station_docking' and 'Charging Station' as valid charger points
    const charger = getFeatureInfo('Charging Station_docking') || getFeatureInfo('Charging Station');
    console.log(`[FEATURES] Found charger:`, charger);
    
    let shelfLoad = null, shelfLoadDocking = null;
    if (carryingBin && shelfPoint) {
        const loadName = `${shelfPoint}_load`;
        const dockingName = `${shelfPoint}_load_docking`;
        console.log(`[FEATURES] Looking for shelf features:`, { loadName, dockingName });
        
        shelfLoad = getFeatureInfo(loadName);
        shelfLoadDocking = getFeatureInfo(dockingName);
        
        console.log(`[FEATURES] Found shelf features:`, { shelfLoad, shelfLoadDocking });
    }
    
    const result = { mapName, charger, shelfLoad, shelfLoadDocking };
    console.log(`[FEATURES] Final feature set:`, result);
    return result;
}

// Helper function to find central load/docking points for any floor
function findCentralPoints(features, type) {
    console.log(`[CENTRAL-POINTS] Looking for central points for type: ${type}`);
    console.log(`[CENTRAL-POINTS] Total features available: ${features.length}`);
    
    // Log all feature names for debugging
    const featureNames = features.map(f => f.name).filter(name => name);
    console.log(`[CENTRAL-POINTS] All feature names:`, featureNames);
    
    // For floor 1, we need to be more flexible about finding central points
    // Look for any load/docking points that could serve as central points
    const loadPoints = features.filter(f => f.name && f.name.includes('_load') && !f.name.includes('_load_docking'));
    const dockingPoints = features.filter(f => f.name && f.name.includes('_load_docking'));
    
    console.log(`[CENTRAL-POINTS] Found ${loadPoints.length} load points and ${dockingPoints.length} docking points`);
    console.log(`[CENTRAL-POINTS] Load points:`, loadPoints.map(f => f.name));
    console.log(`[CENTRAL-POINTS] Docking points:`, dockingPoints.map(f => f.name));
    
    // For pickup, prefer points starting with '050' or any point that seems central
    // For dropoff, prefer points starting with '001' or any point that seems central
    let centralLoad = null;
    let centralLoadDocking = null;
    
    if (type === 'pickup') {
        // Try to find 050 points first
        centralLoad = loadPoints.find(f => f.name === '050_load') || 
                     loadPoints.find(f => f.name.startsWith('050_')) ||
                     loadPoints[0]; // Fallback to first available
        
        centralLoadDocking = dockingPoints.find(f => f.name === '050_load_docking') ||
                            dockingPoints.find(f => f.name.startsWith('050_')) ||
                            dockingPoints[0]; // Fallback to first available
    } else {
        // Try to find 001 points first
        centralLoad = loadPoints.find(f => f.name === '001_load') || 
                     loadPoints.find(f => f.name.startsWith('001_')) ||
                     loadPoints[0]; // Fallback to first available
        
        centralLoadDocking = dockingPoints.find(f => f.name === '001_load_docking') ||
                            dockingPoints.find(f => f.name.startsWith('001_')) ||
                            dockingPoints[0]; // Fallback to first available
    }
    
    console.log(`[CENTRAL-POINTS] Selected central load: ${centralLoad?.name}`);
    console.log(`[CENTRAL-POINTS] Selected central docking: ${centralLoadDocking?.name}`);
    
    return { centralLoad, centralLoadDocking };
}

// Extract workflow execution into a separate function that can be called by the queue manager
async function executeWorkflow(robot, type, centralLoad, centralLoadDocking, shelfLoad, shelfLoadDocking, charger, options = {}, taskId = null) {
    if (type === 'dropoff') {
        // 1. Move to central_load_docking
        const move1 = {
            type: 'standard',
            target_x: centralLoadDocking.coordinates[0],
            target_y: centralLoadDocking.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(centralLoadDocking.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: centralLoadDocking.id
        };
        const move1Id = await sendMoveTask(robot, move1);
        await waitForMoveComplete(robot, move1Id);

        // 2. Align at central_load
        const align1 = {
            type: 'align_with_rack',
            target_x: centralLoad.coordinates[0],
            target_y: centralLoad.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(centralLoad.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: centralLoad.id
        };
        const align1Id = await sendMoveTask(robot, align1);
        await waitForMoveComplete(robot, align1Id);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Jack up
        await sendJack(robot, 'jack_up', taskId);
        await new Promise(resolve => setTimeout(resolve, 10000));
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 4. Move to shelf_load_docking (with bin lifted)
        const move2 = {
            type: 'standard',
            target_x: shelfLoadDocking.coordinates[0],
            target_y: shelfLoadDocking.coordinates[1],
            target_z: 0.2,
            target_ori: parseFloat(shelfLoadDocking.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: shelfLoadDocking.id
        };
        const move2Id = await sendMoveTask(robot, move2);
        await waitForMoveComplete(robot, move2Id);

        // 5. Move to shelf_load (to unload point)
        const move3 = {
            type: 'to_unload_point',
            target_x: shelfLoad.coordinates[0],
            target_y: shelfLoad.coordinates[1],
            target_z: 0.2,
            target_ori: parseFloat(shelfLoad.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: shelfLoad.id
        };
        const move3Id = await sendMoveTask(robot, move3);
        await waitForMoveComplete(robot, move3Id);

        // 6. Jack down
        await sendJack(robot, 'jack_down', taskId);
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 7. Return to charger
        const moveCharger = {
            type: 'charge',
            target_x: charger.coordinates[0],
            target_y: charger.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(charger.raw_properties.yaw) || 0,
            target_accuracy: 0.05,
            charge_retry_count: 5,
            creator: 'backend',
            point_id: charger.id
        };
        const moveChargerId = await sendMoveTask(robot, moveCharger);
        await waitForMoveComplete(robot, moveChargerId);
    } else if (type === 'pickup') {
        // 1. Move to shelf_load_docking
        const move1 = {
            type: 'standard',
            target_x: shelfLoadDocking.coordinates[0],
            target_y: shelfLoadDocking.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(shelfLoadDocking.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: shelfLoadDocking.id
        };
        const move1Id = await sendMoveTask(robot, move1);
        await waitForMoveComplete(robot, move1Id);

        // 2. Align at shelf_load
        const align1 = {
            type: 'align_with_rack',
            target_x: shelfLoad.coordinates[0],
            target_y: shelfLoad.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(shelfLoad.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: shelfLoad.id
        };
        const align1Id = await sendMoveTask(robot, align1);
        await waitForMoveComplete(robot, align1Id);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Jack up
        await sendJack(robot, 'jack_up', taskId);
        await new Promise(resolve => setTimeout(resolve, 10000));
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 4. Move to central_load_docking (with bin lifted)
        const move2 = {
            type: 'standard',
            target_x: centralLoadDocking.coordinates[0],
            target_y: centralLoadDocking.coordinates[1],
            target_z: 0.2,
            target_ori: parseFloat(centralLoadDocking.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: centralLoadDocking.id
        };
        const move2Id = await sendMoveTask(robot, move2);
        await waitForMoveComplete(robot, move2Id);

        // 5. Move to central_load (to unload point)
        const move3 = {
            type: 'to_unload_point',
            target_x: centralLoad.coordinates[0],
            target_y: centralLoad.coordinates[1],
            target_z: 0.2,
            target_ori: parseFloat(centralLoad.raw_properties.yaw) || 0,
            creator: 'backend',
            point_id: centralLoad.id
        };
        const move3Id = await sendMoveTask(robot, move3);
        await waitForMoveComplete(robot, move3Id);

        // 6. Jack down
        await sendJack(robot, 'jack_down', taskId);
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 7. Return to charger
        const moveCharger = {
            type: 'charge',
            target_x: charger.coordinates[0],
            target_y: charger.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(charger.raw_properties.yaw) || 0,
            target_accuracy: 0.05,
            charge_retry_count: 5,
            creator: 'backend',
            point_id: charger.id
        };
        const moveChargerId = await sendMoveTask(robot, moveCharger);
        await waitForMoveComplete(robot, moveChargerId);
    } else if (type === 'go_home') {
        // Just go to the charger
        const moveCharger = {
            type: 'charge',
            target_x: charger.coordinates[0],
            target_y: charger.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(charger.raw_properties.yaw) || 0,
            target_accuracy: 0.05,
            charge_retry_count: 5,
            creator: 'backend',
            point_id: charger.id
        };
        const moveChargerId = await sendMoveTask(robot, moveCharger);
        await waitForMoveComplete(robot, moveChargerId);
    } else if (type === 'return_to_charger') {
        // If carrying a bin, drop it at a pickup point first
        if (options.carryingBin && shelfLoad && shelfLoadDocking) {
            // Move to shelf_load_docking
            const move1 = {
                type: 'standard',
                target_x: shelfLoadDocking.coordinates[0],
                target_y: shelfLoadDocking.coordinates[1],
                target_z: 0,
                target_ori: parseFloat(shelfLoadDocking.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: shelfLoadDocking.id
            };
            const move1Id = await sendMoveTask(robot, move1);
            await waitForMoveComplete(robot, move1Id);

            // Move to shelf_load
            const move2 = {
                type: 'to_unload_point',
                target_x: shelfLoad.coordinates[0],
                target_y: shelfLoad.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(shelfLoad.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: shelfLoad.id
            };
            const move2Id = await sendMoveTask(robot, move2);
            await waitForMoveComplete(robot, move2Id);

            // Jack down to drop the bin
            await sendJack(robot, 'jack_down');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        // Then go to the charger
        const moveCharger = {
            type: 'charge',
            target_x: charger.coordinates[0],
            target_y: charger.coordinates[1],
            target_z: 0,
            target_ori: parseFloat(charger.raw_properties.yaw) || 0,
            target_accuracy: 0.05,
            charge_retry_count: 5,
            creator: 'backend',
            point_id: charger.id
        };
        const moveChargerId = await sendMoveTask(robot, moveCharger);
        await waitForMoveComplete(robot, moveChargerId);
    } else {
        throw new Error('Invalid task type');
    }
}

// Stationary workflow execution functions
async function executeStationaryWorkflow(robot, type, centralLoad, centralLoadDocking, shelfLoad, shelfLoadDocking, charger, options = {}) {
    if (type === 'stationary_dropoff') {
        console.log(`[STATIONARY] Starting stationary dropoff workflow for robot ${robot.serialNumber}`);
        
        try {
            // 1. Move to central_load_docking
            const move1 = {
                type: 'standard',
                target_x: centralLoadDocking.coordinates[0],
                target_y: centralLoadDocking.coordinates[1],
                target_z: 0,
                target_ori: parseFloat(centralLoadDocking.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: centralLoadDocking.id
            };
            const move1Id = await sendMoveTask(robot, move1);
            await waitForMoveComplete(robot, move1Id, 600000, true); // isStationary = true
            await clearRobotErrors(robot); // Clear any errors after move

            // 2. Align at central_load (stationary rack) with extra precision
            const align1 = {
                type: 'align_with_rack',
                target_x: centralLoad.coordinates[0],
                target_y: centralLoad.coordinates[1],
                target_z: 0,
                target_ori: parseFloat(centralLoad.raw_properties.yaw) || 0,
                target_accuracy: 0.02, // Higher precision for stationary rack
                creator: 'backend',
                point_id: centralLoad.id
            };
            const align1Id = await sendMoveTask(robot, align1);
            await waitForMoveComplete(robot, align1Id, 600000, true); // isStationary = true
            await clearRobotErrors(robot); // Clear any errors after alignment
            
            // Extra wait time for stationary rack alignment
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 3. Jack up
            await sendJack(robot, 'jack_up');
            await clearRobotErrors(robot); // Clear any errors after jack up
            await new Promise(resolve => setTimeout(resolve, 12000)); // Extra time for stationary rack

            // 4. Move to shelf_load_docking (with bin lifted)
            const move2 = {
                type: 'standard',
                target_x: shelfLoadDocking.coordinates[0],
                target_y: shelfLoadDocking.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(shelfLoadDocking.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: shelfLoadDocking.id
            };
            const move2Id = await sendMoveTask(robot, move2);
            await waitForMoveComplete(robot, move2Id, 600000, true); // isStationary = true
            await clearRobotErrors(robot); // Clear any errors after move

            // 5. Move to shelf_load (align with stationary rack)
            const move3 = {
                type: 'align_with_rack',
                target_x: shelfLoad.coordinates[0],
                target_y: shelfLoad.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(shelfLoad.raw_properties.yaw) || 0,
                target_accuracy: 0.02, // Higher precision for stationary rack
                creator: 'backend',
                point_id: shelfLoad.id
            };
            const move3Id = await sendMoveTask(robot, move3);
            await waitForMoveComplete(robot, move3Id, 600000, true); // isStationary = true
            await clearRobotErrors(robot); // Clear any errors after alignment

            // 6. Jack down
            await sendJack(robot, 'jack_down');
            await clearRobotErrors(robot); // Clear any errors after jack down
            await new Promise(resolve => setTimeout(resolve, 12000));

            // 7. Return to charger
            const moveCharger = {
                type: 'charge',
                target_x: charger.coordinates[0],
                target_y: charger.coordinates[1],
                target_z: 0,
                target_ori: parseFloat(charger.raw_properties.yaw) || 0,
                target_accuracy: 0.05,
                charge_retry_count: 5,
                creator: 'backend',
                point_id: charger.id
            };
            const moveChargerId = await sendMoveTask(robot, moveCharger);
            await waitForMoveComplete(robot, moveChargerId, 600000, true); // isStationary = true
            await clearRobotErrors(robot); // Clear any errors after final move
            
            console.log(`[STATIONARY] Stationary dropoff workflow completed successfully for robot ${robot.serialNumber}`);
            
        } catch (error) {
            console.error(`[STATIONARY] Error in stationary dropoff workflow for robot ${robot.serialNumber}:`, error);
            throw error;
        }
        
    } else if (type === 'stationary_pickup') {
        console.log(`[STATIONARY] Starting stationary pickup workflow for robot ${robot.serialNumber}`);
        
        try {
            // 1. Move to shelf_load_docking
            const move1 = {
                type: 'standard',
                target_x: shelfLoadDocking.coordinates[0],
                target_y: shelfLoadDocking.coordinates[1],
                target_z: 0,
                target_ori: parseFloat(shelfLoadDocking.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: shelfLoadDocking.id
            };
            const move1Id = await sendMoveTask(robot, move1);
            await waitForMoveComplete(robot, move1Id, 600000, true); // isStationary = true
            await clearRobotErrors(robot); // Clear any errors after move

            // 2. Align at shelf_load (stationary rack) with extra precision
            const align1 = {
                type: 'align_with_rack',
                target_x: shelfLoad.coordinates[0],
                target_y: shelfLoad.coordinates[1],
                target_z: 0,
                target_ori: parseFloat(shelfLoad.raw_properties.yaw) || 0,
                target_accuracy: 0.02, // Higher precision for stationary rack
                creator: 'backend',
                point_id: shelfLoad.id
            };
            const align1Id = await sendMoveTask(robot, align1);
            await waitForMoveComplete(robot, align1Id, 600000, true); // isStationary = true
            await clearRobotErrors(robot); // Clear any errors after alignment
            
            // Extra wait time for stationary rack alignment
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 3. Jack up
            await sendJack(robot, 'jack_up');
            await clearRobotErrors(robot); // Clear any errors after jack up
            await new Promise(resolve => setTimeout(resolve, 12000)); // Extra time for stationary rack

            // 4. Move to central_load_docking (with bin lifted)
            const move2 = {
                type: 'standard',
                target_x: centralLoadDocking.coordinates[0],
                target_y: centralLoadDocking.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(centralLoadDocking.raw_properties.yaw) || 0,
                creator: 'backend',
                point_id: centralLoadDocking.id
            };
            const move2Id = await sendMoveTask(robot, move2);
            await waitForMoveComplete(robot, move2Id, 600000, true); // isStationary = true
            await clearRobotErrors(robot); // Clear any errors after move

            // 5. Move to central_load (align with stationary rack)
            const move3 = {
                type: 'align_with_rack',
                target_x: centralLoad.coordinates[0],
                target_y: centralLoad.coordinates[1],
                target_z: 0.2,
                target_ori: parseFloat(centralLoad.raw_properties.yaw) || 0,
                target_accuracy: 0.02, // Higher precision for stationary rack
                creator: 'backend',
                point_id: centralLoad.id
            };
            const move3Id = await sendMoveTask(robot, move3);
            await waitForMoveComplete(robot, move3Id, 600000, true); // isStationary = true
            await clearRobotErrors(robot); // Clear any errors after alignment

            // 6. Jack down
            await sendJack(robot, 'jack_down');
            await clearRobotErrors(robot); // Clear any errors after jack down
            await new Promise(resolve => setTimeout(resolve, 12000));

            // 7. Return to charger
            const moveCharger = {
                type: 'charge',
                target_x: charger.coordinates[0],
                target_y: charger.coordinates[1],
                target_z: 0,
                target_ori: parseFloat(charger.raw_properties.yaw) || 0,
                target_accuracy: 0.05,
                charge_retry_count: 5,
                creator: 'backend',
                point_id: charger.id
            };
            const moveChargerId = await sendMoveTask(robot, moveCharger);
            await waitForMoveComplete(robot, moveChargerId, 600000, true); // isStationary = true
            await clearRobotErrors(robot); // Clear any errors after final move
            
            console.log(`[STATIONARY] Stationary pickup workflow completed successfully for robot ${robot.serialNumber}`);
            
        } catch (error) {
            console.error(`[STATIONARY] Error in stationary pickup workflow for robot ${robot.serialNumber}:`, error);
            throw error;
        }
        
    } else {
        throw new Error(`Invalid stationary task type: ${type}`);
    }
}

app.post('/api/templates/:id/tasks', authenticateToken, async (req, res) => {
    console.log('POST /api/templates/:id/tasks called with:', req.body);
    const { id } = req.params;
    const { type, floor, shelfPoint } = req.body;

    if (!type || !floor || !shelfPoint) {
        console.error('Missing required fields:', req.body);
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get the template and assigned robot
    const templateResult = await db.query('SELECT * FROM templates WHERE id = $1', [id]);
    if (templateResult.rows.length === 0) {
        console.error('Template not found for id:', id);
        return res.status(404).json({ error: 'Template not found' });
    }

    // Parse and normalize robot data
    let robot = templateResult.rows[0].robot;
    if (typeof robot === 'string') {
        try { 
            robot = JSON.parse(robot); 
        } catch (e) { 
            console.error('Error parsing robot JSON:', e);
            robot = null; 
        }
    }

    // Log raw robot data
    console.log('Raw robot data from database:', robot);

    if (!robot) {
        console.error('No robot data found in template');
        return res.status(400).json({ error: 'No robot assigned to this template' });
    }

    // Normalize robot properties to match RobotConfig expectations
    const normalizedRobot = {
        serialNumber: robot.serial_number,
        publicIP: robot.public_ip,
        privateIP: robot.private_ip,
        secretKey: robot.secret_key
    };

    // Log normalized robot data
    console.log('Normalized robot data:', normalizedRobot);

    if (!normalizedRobot.serialNumber || !normalizedRobot.publicIP || !normalizedRobot.privateIP || !normalizedRobot.secretKey) {
        console.error('Missing required robot properties:', normalizedRobot);
        return res.status(400).json({ error: 'Robot configuration is incomplete' });
    }

    // Get the correct map for the floor
    const mapName = `Floor${floor}`;
    const mapResult = await db.query(
        'SELECT * FROM maps WHERE robot_serial_number = $1 AND map_name = $2',
        [normalizedRobot.serialNumber, mapName]
    );
    if (mapResult.rows.length === 0) {
        console.error(`Map for Floor${floor} not found for robot ${normalizedRobot.serialNumber}`);
        return res.status(404).json({ error: `Map for Floor${floor} not found for this robot` });
    }
    
    let features = mapResult.rows[0].features;
    if (typeof features === 'string') {
        try { 
            features = JSON.parse(features);
            console.log(`[FEATURES] Parsed features for ${mapName}:`, features);
        } catch (e) { 
            console.error(`[FEATURES] Failed to parse features:`, e);
            features = []; 
        }
    }

    // Helper to extract info from a feature name
    function getFeatureInfo(name) {
        const feature = features.find(f => f.name === name);
        console.log(`[FEATURES] Looking for feature "${name}":`, feature);
        return feature;
    }

    // Get all required points using the flexible helper
    const { centralLoad, centralLoadDocking } = findCentralPoints(features, type);
    const shelfLoad = getFeatureInfo(`${shelfPoint}_load`);
    const shelfLoadDocking = getFeatureInfo(`${shelfPoint}_load_docking`);
    const charger = getFeatureInfo('Charging Station_docking') || getFeatureInfo('Charging Station');

    // Debug: Log which required features are missing
    if (!centralLoad) console.error('Missing central load point');
    if (!centralLoadDocking) console.error('Missing central load docking point');
    if (!shelfLoad) console.error('Missing feature:', `${shelfPoint}_load`);
    if (!shelfLoadDocking) console.error('Missing feature:', `${shelfPoint}_load_docking`);
    if (!charger) console.error('Missing feature: charger');

    const isReturnOrHome = type === 'go_home' || type === 'return_to_charger';
    if (
        (!isReturnOrHome && (!centralLoad || !centralLoadDocking || !shelfLoad || !shelfLoadDocking || !charger)) ||
        (isReturnOrHome && !charger)
    ) {
        return res.status(404).json({ 
            error: 'One or more required point sets not found in map features',
            missing: {
                centralLoad: !centralLoad,
                centralLoadDocking: !centralLoadDocking,
                shelfLoad: !shelfLoad,
                shelfLoadDocking: !shelfLoadDocking,
                charger: !charger
            },
            availableFeatures: features.map(f => f.name).filter(name => name && (name.includes('_load') || name.includes('Charging')))
        });
    }

    // Build enriched data object
    const enrichedData = {
        type,
        floor,
        shelfPoint,
        robot: normalizedRobot,
        mapName,
        centralLoad,
        centralLoadDocking,
        shelfLoad,
        shelfLoadDocking,
        charger
    };

    // Insert the enriched task into the queue
    try {
        await db.query(
            `INSERT INTO task_queue (template_id, robot_serial_number, type, floor, shelf_point, status, enriched_data)
             VALUES ($1, $2, $3, $4, $5, 'queued', $6)`,
            [
                id,
                normalizedRobot.serialNumber,
                type,
                floor,
                shelfPoint,
                JSON.stringify(enrichedData)
            ]
        );
        return res.status(201).json({ message: 'Task queued successfully' });
    } catch (err) {
        console.error('Error inserting task into queue:', err);
        return res.status(500).json({ error: 'Failed to queue task', details: err.message });
    }
});

// Add queue-task endpoint that mirrors the tasks endpoint but makes it clear it's for queuing only
app.post('/api/templates/:id/queue-task', authenticateToken, async (req, res) => {
    console.log('POST /api/templates/:id/queue-task called with:', req.body);
    const { id } = req.params;
    const { type, floor, shelfPoint } = req.body;

    if (!type || !floor || !shelfPoint) {
        console.error('Missing required fields:', req.body);
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get the template and assigned robot
    const templateResult = await db.query('SELECT * FROM templates WHERE id = $1', [id]);
    if (templateResult.rows.length === 0) {
        console.error('Template not found for id:', id);
        return res.status(404).json({ error: 'Template not found' });
    }

    // Parse and normalize robot data
    let robot = templateResult.rows[0].robot;
    if (typeof robot === 'string') {
        try { 
            robot = JSON.parse(robot); 
        } catch (e) { 
            console.error('Error parsing robot JSON:', e);
            robot = null; 
        }
    }

    // Log raw robot data
    console.log('Raw robot data from database:', robot);

    if (!robot) {
        console.error('No robot data found in template');
        return res.status(400).json({ error: 'No robot assigned to this template' });
    }

    // Normalize robot properties to match RobotConfig expectations
    const normalizedRobot = {
        serialNumber: robot.serial_number,
        publicIP: robot.public_ip,
        privateIP: robot.private_ip,
        secretKey: robot.secret_key
    };

    // Log normalized robot data
    console.log('Normalized robot data:', normalizedRobot);

    if (!normalizedRobot.serialNumber || !normalizedRobot.publicIP || !normalizedRobot.privateIP || !normalizedRobot.secretKey) {
        console.error('Missing required robot properties:', normalizedRobot);
        return res.status(400).json({ error: 'Robot configuration is incomplete' });
    }

    // Get the correct map for the floor
    const mapName = `Floor${floor}`;
    const mapResult = await db.query(
        'SELECT * FROM maps WHERE robot_serial_number = $1 AND map_name = $2',
        [normalizedRobot.serialNumber, mapName]
    );
    if (mapResult.rows.length === 0) {
        console.error(`Map for Floor${floor} not found for robot ${normalizedRobot.serialNumber}`);
        return res.status(404).json({ error: `Map for Floor${floor} not found for this robot` });
    }
    
    let features = mapResult.rows[0].features;
    if (typeof features === 'string') {
        try { 
            features = JSON.parse(features);
            console.log(`[FEATURES] Parsed features for ${mapName}:`, features);
        } catch (e) { 
            console.error(`[FEATURES] Failed to parse features:`, e);
            features = []; 
        }
    }

    // Helper to extract info from a feature name
    function getFeatureInfo(name) {
        const feature = features.find(f => f.name === name);
        console.log(`[FEATURES] Looking for feature "${name}":`, feature);
        return feature;
    }

    // Get all required points using the flexible helper
    const { centralLoad, centralLoadDocking } = findCentralPoints(features, type);
    const shelfLoad = getFeatureInfo(`${shelfPoint}_load`);
    const shelfLoadDocking = getFeatureInfo(`${shelfPoint}_load_docking`);
    const charger = getFeatureInfo('Charging Station_docking') || getFeatureInfo('Charging Station');

    // Debug: Log which required features are missing
    if (!centralLoad) console.error('Missing central load point');
    if (!centralLoadDocking) console.error('Missing central load docking point');
    if (!shelfLoad) console.error('Missing feature:', `${shelfPoint}_load`);
    if (!shelfLoadDocking) console.error('Missing feature:', `${shelfPoint}_load_docking`);
    if (!charger) console.error('Missing feature: charger');

    const isReturnOrHome = type === 'go_home' || type === 'return_to_charger';
    if (
        (!isReturnOrHome && (!centralLoad || !centralLoadDocking || !shelfLoad || !shelfLoadDocking || !charger)) ||
        (isReturnOrHome && !charger)
    ) {
        return res.status(404).json({ 
            error: 'One or more required point sets not found in map features',
            missing: {
                centralLoad: !centralLoad,
                centralLoadDocking: !centralLoadDocking,
                shelfLoad: !shelfLoad,
                shelfLoadDocking: !shelfLoadDocking,
                charger: !charger
            },
            availableFeatures: features.map(f => f.name).filter(name => name && (name.includes('_load') || name.includes('Charging')))
        });
    }

    // Build enriched data object
    const enrichedData = {
        type,
        floor,
        shelfPoint,
        robot: normalizedRobot,
        mapName,
        centralLoad,
        centralLoadDocking,
        shelfLoad,
        shelfLoadDocking,
        charger
    };

    // Insert the enriched task into the queue
    try {
        await db.query(
            `INSERT INTO task_queue (template_id, robot_serial_number, type, floor, shelf_point, status, enriched_data)
             VALUES ($1, $2, $3, $4, $5, 'queued', $6)`,
            [
                id,
                normalizedRobot.serialNumber,
                type,
                floor,
                shelfPoint,
                JSON.stringify(enrichedData)
            ]
        );
        return res.status(201).json({ message: 'Task queued successfully' });
    } catch (err) {
        console.error('Error inserting task into queue:', err);
        return res.status(500).json({ error: 'Failed to queue task', details: err.message });
    }
});

// Queue manager to process tasks
setInterval(async () => {
    try {
        const robotsWithQueued = await db.query(`
            SELECT DISTINCT robot_serial_number FROM task_queue WHERE status = 'queued'
        `);
        for (const row of robotsWithQueued.rows) {
            const robotSerial = row.robot_serial_number;
            const inProgress = await db.query(
                `SELECT * FROM task_queue WHERE robot_serial_number = $1 AND status = 'in_progress'`,
                [robotSerial]
            );
            if (inProgress.rows.length > 0) continue;
            const queued = await db.query(
                `SELECT * FROM task_queue WHERE robot_serial_number = $1 AND status = 'queued' ORDER BY created_at ASC LIMIT 1`,
                [robotSerial]
            );
            if (queued.rows.length === 0) continue;
            const task = queued.rows[0];
            await db.query(
                `UPDATE task_queue SET status = 'in_progress', started_at = NOW() WHERE id = $1`,
                [task.id]
            );
            console.log(`[QUEUE-MANAGER] Picked up task ${task.id} for robot ${robotSerial}. Executing workflow...`);
            try {
                let enrichedData = task.enriched_data;
                if (typeof enrichedData === 'string') {
                    try {
                        enrichedData = JSON.parse(enrichedData);
                    } catch (e) {
                        console.error('Failed to parse enriched_data:', e);
                        enrichedData = {};
                    }
                }
                
                // Check if template has stationary enabled
                const templateResult = await db.query('SELECT stationary FROM templates WHERE id = $1', [task.template_id]);
                const isStationary = templateResult.rows.length > 0 ? templateResult.rows[0].stationary : false;
                
                // Determine workflow type based on template setting
                let workflowType = enrichedData.type;
                if (isStationary && (enrichedData.type === 'pickup' || enrichedData.type === 'dropoff')) {
                    workflowType = `stationary_${enrichedData.type}`;
                    console.log(`[QUEUE-MANAGER] Using stationary workflow: ${workflowType}`);
                }
                
                // Execute appropriate workflow
                if (workflowType.startsWith('stationary_')) {
                    await executeStationaryWorkflow(
                        enrichedData.robot,
                        workflowType,
                        enrichedData.centralLoad,
                        enrichedData.centralLoadDocking,
                        enrichedData.shelfLoad,
                        enrichedData.shelfLoadDocking,
                        enrichedData.charger,
                        enrichedData.options
                    );
                } else {
                await executeWorkflow(
                    enrichedData.robot,
                    enrichedData.type,
                    enrichedData.centralLoad,
                    enrichedData.centralLoadDocking,
                    enrichedData.shelfLoad,
                    enrichedData.shelfLoadDocking,
                    enrichedData.charger,
                    enrichedData.options,
                    task.id
                );
                }
                await db.query(
                    `UPDATE task_queue SET status = 'completed', completed_at = NOW() WHERE id = $1`,
                    [task.id]
                );
                console.log(`[QUEUE-MANAGER] Completed task ${task.id} for robot ${robotSerial}.`);
            } catch (err) {
                await db.query(
                    `UPDATE task_queue SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
                    [task.id, err.message || String(err)]
                );
                console.error(`[QUEUE-MANAGER] Task ${task.id} failed:`, err);
            }
        }
    } catch (err) {
        console.error('[QUEUE-MANAGER] Error:', err);
    }
}, 5000);

// Get the task queue for a template (optionally filter by robot)
app.get('/api/templates/:id/queue', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { robotSerial } = req.query; // optional
    try {
        let query = `SELECT * FROM task_queue WHERE template_id = $1 ORDER BY created_at ASC`;
        let params = [id];
        if (robotSerial) {
            query = `SELECT * FROM task_queue WHERE template_id = $1 AND robot_serial_number = $2 ORDER BY created_at ASC`;
            params.push(robotSerial);
        }
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching task queue:', err);
        res.status(500).json({ error: 'Failed to fetch task queue' });
    }
});

// Cancel a task in the queue (queued: delete, in_progress: cancel and queue return_to_charger)
app.post('/api/templates/:templateId/queue/:taskId/cancel', authenticateToken, async (req, res) => {
    const { templateId, taskId } = req.params;
    try {
        // Get the task
        const taskResult = await db.query('SELECT * FROM task_queue WHERE id = $1', [taskId]);
        if (taskResult.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        const task = taskResult.rows[0];
        if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
            return res.status(400).json({ error: `Task already ${task.status}` });
        }
        if (task.status === 'queued') {
            // Delete the queued task
            await db.query('DELETE FROM task_queue WHERE id = $1', [taskId]);
            return res.json({ message: 'Queued task cancelled and deleted' });
        }
        if (task.status === 'in_progress') {
            // Mark as cancelled
            await db.query("UPDATE task_queue SET status = 'cancelled', completed_at = NOW() WHERE id = $1", [taskId]);
            // Try to send cancel/stop to robot (best effort)
            try {
                const serialNumber = task.robot_serial_number;
                if (robotManager.robots && robotManager.robots.has(serialNumber)) {
                    const robot = robotManager.robots.get(serialNumber).connection;
                    if (robot && typeof robot.send === 'function') {
                        robot.send({ type: 'cancel' });
                    }
                }
            } catch (err) {
                console.warn('Failed to send cancel to robot:', err);
            }
            // Insert a return_to_charger task for this robot, using enriched map features
            let enrichedData = task.enriched_data;
            if (typeof enrichedData === 'string') {
                try { enrichedData = JSON.parse(enrichedData); } catch (e) { enrichedData = {}; }
            }
            // Only proceed if we have robot info
            if (!enrichedData.robot) {
                return res.status(500).json({ error: 'Missing robot info for return_to_charger' });
            }
            // Determine if carryingBin (e.g., if task was after jackup)
            // For now, assume carryingBin if task type was 'pickup' or 'dropoff' and status was in_progress
            const carryingBin = enrichedData.type === 'pickup' || enrichedData.type === 'dropoff';
            // Use the same shelfPoint as the original task if carryingBin
            const shelfPoint = carryingBin ? enrichedData.shelfPoint : null;
            let features;
            try {
                features = await getRequiredFeaturesForTask(enrichedData.robot, enrichedData.floor, shelfPoint, 'return_to_charger', carryingBin);
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!features.charger) {
                return res.status(500).json({ error: 'Missing charger info for return_to_charger' });
            }
            // Fetch the full robot object from the database
            const robotResult = await db.query('SELECT * FROM robots WHERE serial_number = $1', [enrichedData.robot.serialNumber]);
            if (robotResult.rows.length === 0) {
                return res.status(500).json({ error: 'Robot not found in database for return_to_charger' });
            }
            const dbRobot = robotResult.rows[0];
            const normalizedRobot = {
                serialNumber: dbRobot.serial_number,
                publicIP: dbRobot.public_ip,
                privateIP: dbRobot.private_ip,
                secretKey: dbRobot.secret_key,
                name: dbRobot.name
            };

            const returnTask = {
                template_id: templateId,
                robot_serial_number: normalizedRobot.serialNumber,
                type: 'return_to_charger',
                floor: enrichedData.floor,
                shelf_point: shelfPoint,
                status: 'queued',
                enriched_data: JSON.stringify({
                    type: 'return_to_charger',
                    floor: enrichedData.floor,
                    robot: normalizedRobot,
                    mapName: features.mapName,
                    charger: features.charger,
                    shelfLoad: features.shelfLoad,
                    shelfLoadDocking: features.shelfLoadDocking,
                    options: { carryingBin }
                })
            };
            await db.query(
                `INSERT INTO task_queue (template_id, robot_serial_number, type, floor, shelf_point, status, enriched_data)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    returnTask.template_id,
                    returnTask.robot_serial_number,
                    returnTask.type,
                    returnTask.floor,
                    returnTask.shelf_point,
                    returnTask.status,
                    returnTask.enriched_data
                ]
            );
            return res.json({ message: 'In-progress task cancelled, return_to_charger task queued' });
        }
        return res.status(400).json({ error: 'Unknown task status' });
    } catch (err) {
        console.error('Error cancelling task:', err);
        return res.status(500).json({ error: 'Failed to cancel task', details: err.message });
    }
});

// --- Connect to all robots on startup ---
async function connectAllRobots() {
    try {
        const robotsResult = await db.query('SELECT * FROM robots WHERE status != \'deleted\'');
        for (const robot of robotsResult.rows) {
            try {
                robotManager.addRobot({
                    serialNumber: robot.serial_number,
                    secretKey: robot.secret_key,
                    publicIP: robot.public_ip,
                    privateIP: robot.private_ip
                });
                await robotManager.connectRobot(robot.serial_number);
                console.log(`Connected to robot: ${robot.name || robot.serial_number}`);
            } catch (err) {
                console.error(`Failed to connect to robot ${robot.name || robot.serial_number}:`, err);
            }
        }
    } catch (err) {
        console.error('Error connecting to robots on startup:', err);
    }
}
connectAllRobots();

// --- Periodically pull map data from all robots every 30 seconds ---
const { getRobotMaps } = require('./robot-maps.js');
setInterval(async () => {
    try {
        const robotsResult = await db.query('SELECT * FROM robots');
        console.log(`[MAP-PULL] Found ${robotsResult.rows.length} robots in database.`);
        if (robotsResult.rows.length === 0) {
            console.warn('[MAP-PULL] No robots found in database.');
        }
        for (const robot of robotsResult.rows) {
            try {
                const robotObj = {
                    name: robot.name,
                    publicIP: robot.public_ip,
                    privateIP: robot.private_ip,
                    serialNumber: robot.serial_number,
                    secretKey: robot.secret_key
                };
                console.log(`[MAP-PULL] Pulling maps for robot: ${robotObj.serialNumber} (${robotObj.publicIP})`);
                const maps = await getRobotMaps(robotObj);
                console.log(`[MAP-PULL] Pulled ${maps.length} maps for robot: ${robotObj.serialNumber}`);
                // Delete existing maps for this robot
                await db.query('DELETE FROM maps WHERE robot_serial_number = $1', [robotObj.serialNumber]);
                for (const map of maps) {
                    await db.query(
                        `INSERT INTO maps (
                            robot_serial_number, map_name, features, uid, create_time, map_version, overlays_version, thumbnail_url, image_url, url
                        ) VALUES ($1, $2, $3, $4, to_timestamp($5), $6, $7, $8, $9, $10)`,
                        [
                            robotObj.serialNumber,
                            map.map_name,
                            JSON.stringify(map.features),
                            map.uid,
                            map.create_time,
                            map.map_version,
                            map.overlays_version,
                            map.thumbnail_url,
                            map.image_url,
                            map.url
                        ]
                    );
                }
                console.log(`[MAP-PULL] Updated maps for robot: ${robotObj.serialNumber}`);
            } catch (err) {
                console.error(`[MAP-PULL] Failed to update maps for robot ${robot.serial_number}:`, err);
            }
        }
    } catch (err) {
        console.error('[MAP-PULL] Error during periodic map pulling:', err);
    }
}, 30000);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
}); 