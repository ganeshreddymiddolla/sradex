require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CONFIG ====================
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;
const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:5500`; 
// Example for production:
// FRONTEND_URL=https://sradexlearning.com
// BACKEND_URL=https://sradex.onrender.com

const REDIRECT_URI = `${BACKEND_URL.replace(/\/$/, '')}/auth/google/callback`;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('❌ Missing Google credentials in .env');
  process.exit(1);
}

const users = {};

// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: BACKEND_URL.startsWith('https'),
    httpOnly: true,
    sameSite: 'none', // allow cross-site
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ==================== AUTH ROUTES ====================

// 1️⃣ Start Google login
app.get('/auth/google', (req, res) => {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid profile email');
  res.redirect(authUrl.toString());
});

// 2️⃣ Google OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token');

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await profileRes.json();

    users[profile.id] = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      photoUrl: profile.picture
    };

    req.session.userId = profile.id;
    // ✅ Redirect to frontend dashboard page
    res.redirect(`${FRONTEND_URL}/sampleproject.html`);
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect(`${FRONTEND_URL}/sampleloginbuttun.html`);
  }
});

// 3️⃣ Logout
app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid', { sameSite: 'none', secure: true });
    res.redirect(`${FRONTEND_URL}/sampleloginbuttun.html`);
  });
});

// ==================== API ROUTES ====================
const isLoggedIn = (req, res, next) => {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

app.get('/api/profile', isLoggedIn, (req, res) => {
  const user = users[req.session.userId];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`✅ Backend running at ${BACKEND_URL}`);
  console.log(`🌐 Frontend expected at ${FRONTEND_URL}`);
});
