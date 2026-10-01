const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const name = process.argv[2];

if (!name) {
    console.error('Error: Please provide a name for the database.');
    process.exit(1);
}

const dbPath = path.join(__dirname, `${name}.db`);
const sqlPath = path.join(__dirname, `${name}.sql`);

if (!fs.existsSync(sqlPath)) {
    console.error(`Error: SQL file not found at ${sqlPath}`);
    process.exit(1);
}

// Delete existing database file if it exists
if (fs.existsSync(dbPath)) {
    try {
        fs.unlinkSync(dbPath);
        console.log(`Deleted existing database: ${dbPath}`);
    } catch (err) {
        console.error(`Error deleting database file: ${err.message}`);
        process.exit(1);
    }
}

const sql = fs.readFileSync(sqlPath, 'utf8');

try {
    const db = new DatabaseSync(dbPath);
    console.log(`Created new database: ${dbPath}`);

    db.exec(sql);
    console.log('Database successfully seeded.');

    db.close();
    console.log('Database connection closed.');
} catch (err) {
    console.error(`Error processing database: ${err.message}`);
    process.exit(1);
}
