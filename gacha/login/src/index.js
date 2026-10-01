const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'memesmemesmememes123456';
const FLAG = process.env.FLAG || 'changeme';

const users = new Map();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, { algorithms: ["none", "HS256", "HS384", "HS512"] }, (err, user) => {
    if (err) {
      return next(err);
    }
    req.user = user;
    next();
  });
};

app.use(authenticateToken);


// Home Route
app.get('/', (req, res) => {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

// GET Login
app.get('/login', (req, res) => {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', { title: 'Login' });
});

// POST Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('login', {
      title: 'Login',
      error: 'Please fill in all fields.'
    });
  }

  const user = users.get(username);
  if (!user || user.password !== password) {
    return res.render('login', {
      title: 'Login',
      error: 'Invalid username or password.'
    });
  }

  // Create JWT token
  const token = jwt.sign({ sub: user.username, type: "user" }, JWT_SECRET, { expiresIn: '1h' });

  // Set HTTP-only cookie
  res.cookie('token', token, { httpOnly: true, maxAge: 3600000 });
  res.redirect('/dashboard');
});

// GET Register
app.get('/register', (req, res) => {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  res.render('register', { title: 'Register' });
});

// POST Register
app.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('register', {
      title: 'Register',
      error: 'Please fill in all fields.'
    });
  }

  if (users.has(username)) {
    return res.render('register', {
      title: 'Register',
      error: 'Username is already taken.'
    });
  }

  // Register user
  users.set(username, { username, password });

  // Sign JWT and log user in immediately
  const token = jwt.sign({ sub: username, type: "user" }, JWT_SECRET, { expiresIn: '1h' });
  res.cookie('token', token, { httpOnly: true, maxAge: 3600000 });

  res.redirect('/dashboard');
});

// GET Dashboard (Protected)
app.get('/dashboard', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }

  res.render('dashboard', {
    title: 'Dashboard',
    user: req.user,
    flag: FLAG,
  });
});

// Logout
app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://:${PORT}`);
});
