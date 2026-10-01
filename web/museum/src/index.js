const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const mime = require('mime-types');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 1337;

let db;
try {
    db = new DatabaseSync(path.join(__dirname, 'gallery.db'));
    console.log('Connected to the SQLite database.');
} catch (err) {
    console.error(`Error opening database: ${err.message}`);
    process.exit(1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.get('/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const stmt = db.prepare(`SELECT * FROM gallery_pieces WHERE id = ${id}`);
        const row = stmt.get();

        if (!row) {
            return res.status(404).send('Gallery piece not found');
        }

        // We don't want to get hacked, so we send the image back as base64 instead.
        const image = await fs.readFile(path.join(__dirname, 'images', row.filename));
        res.render("exhibit", {
            title: row.title,
            description: row.description,
            artist: row.artist,
            medium: row.medium,
            exhibition_period: row.exhibition_period,
            mimetype: mime.lookup(row.filename) || 'application/octet-stream',
            data: image.toString('base64')
        });
    } catch (err) {
        console.error(`Error querying database: ${err.message}`);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/', (req, res) => {
    res.redirect('/1');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://:${PORT}`);
});

