const db = require('./config/database');

async function checkTemplates() {
    try {
        // First check the table structure
        const schemaResult = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'templates' 
            ORDER BY ordinal_position
        `);
        
        console.log('Templates table structure:');
        schemaResult.rows.forEach(col => {
            console.log(`- ${col.column_name}: ${col.data_type}`);
        });
        
        const result = await db.query('SELECT COUNT(*) as count FROM templates');
        console.log('\nTemplates count:', result.rows[0].count);
        
        if (result.rows[0].count > 0) {
            const templates = await db.query('SELECT * FROM templates');
            console.log('\nExisting templates:');
            templates.rows.forEach(template => {
                console.log(`- ID: ${template.id}, Name: ${template.name}, Color: ${template.color}`);
            });
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await db.pool.end();
    }
}

checkTemplates(); 