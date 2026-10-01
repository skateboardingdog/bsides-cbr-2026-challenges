# Writeup

## Overview
The challenge presents a digital gallery displaying paintings of skateboarding dogs. Users browse the exhibits via numeric URL paths (e.g., `/1`, `/2`). Under the hood, the application queries a SQLite database for the artwork metadata and dynamically loads the image file from disk. The developer included the image directly into the response under the guise that it will block users from browsing files on disk directly.

## TLDR: Solution
```
http://localhost:1337/0 OR 1=0 UNION SELECT 1,'lol','1','1','1','1','..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2Fproc%2Fself%2Fenviron' --
```

## Analysis
First, let's take a look at how the application retrieves gallery pieces. In `index.js`, we can see that the `:id` route parameter is interpolated directly into the database query without parameterized placeholders or sanitization:
```javascript
const stmt = db.prepare(`SELECT * FROM gallery_pieces WHERE id = ${id}`);
const row = stmt.get();
```

Because there is no sanitization, we can try using a basic SQL injection to see if it's vulnerable:
```
http://localhost:1337/0 OR 1=1
```
As expected, it still returns the first row of the database, meaning that the `OR` clause was executed.

Now, how can we leverage this? In most SQL dialects, there exists a notion of `UNION SELECT`, which allows you to select rows from different tables—or in this case, fabricate completely fake rows to return to the application. 

If we look at `gallery.sql`, we can count the columns of the `gallery_pieces` table. It has exactly 7 columns: `id`, `title`, `artist`, `medium`, `exhibition_period`, `description`, and `filename`. This means that we must return exactly 7 columns. 

When the application gets a row back from the database, it trusts the `filename` column to read a file from the disk:
```javascript
const image = await fs.readFile(path.join(__dirname, 'images', row.filename));
```
By fabricating our own row using `UNION SELECT`, we can control the `filename` that is returned. Since `filename` is the 7th column, we just need to put our target file path at the end of our `UNION SELECT` query.

To read files outside of this folder, we can use a standard path traversal technique. By prepending a bunch of `../` segments, we can escape the `images` folder and navigate to the root of the filesystem.

You may have also noticed that the Dockerfile only sets the flag as an environment variable, and this isn't written to disk anywhere. How can we read environment variables if they aren't in a file? 

On Linux, every running process has its environment variables stored in a special virtual file: `/proc/self/environ`. If we can read that file, we can read the environment variables!

So, if we put all of this together, we can fabricate a database row that points the file reader to `/proc/self/environ`:
```
http://localhost:1337/0 OR 1=0 UNION SELECT 1,'lol','1','1','1','1','..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2Fproc%2Fself%2Fenviron' --
```
Once we send this request, the server will read `/proc/self/environ`, convert it to base64, and embed it into the page as if it were an image. All we have to do is copy that base64 string from the page source and decode it to find our flag.
