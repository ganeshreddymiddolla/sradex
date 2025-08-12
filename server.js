// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const fetch = require('node-fetch');
const session = require('express-session'); 
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- CONFIG ----
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret';
const NODE_ENV = process.env.NODE_ENV || 'development';

// SITE_URL determines redirect URI. Set SITE_URL in production to your domain, e.g. https://sradex.onrender.com
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const REDIRECT_URI = `${SITE_URL}/auth/google/callback`;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('⚠️  GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set. Set them in .env before running.');
}
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  SESSION_SECRET not set; using fallback. Use a strong secret in production.');
}

console.log('SITE_URL =', SITE_URL);
console.log('REDIRECT_URI =', REDIRECT_URI);

// ---- Simple in-memory user store (demo only) ----
const users = {};

// ---- Middleware ----
app.use(express.json());
app.use(cookieParser());

// Session configuration
app.use(session({
  name: 'sid', // cookie name
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: NODE_ENV === 'production' && SITE_URL.startsWith('https'), // secure cookies in prod over HTTPS
    sameSite: 'lax', // 'lax' lets the top-level redirect after Google auth send cookie
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

// Serve static frontend from /public (same origin)
app.use(express.static(path.join(__dirname, 'public')));

// ---- Routes ----

// Root -> serves login page (public/index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Google OAuth flow
app.get('/auth/google', (req, res) => {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('prompt', 'select_account'); // helpful for testing multiple accounts
  res.redirect(authUrl.toString());
});

// Google OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    console.error('Missing code in OAuth callback');
    return res.redirect('/?error=missing_code');
  }

  try {
    // Exchange authorization code for tokens
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
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

    const tokenData = await tokenResp.json();
    if (tokenData.error) {
      console.error('Token exchange error:', tokenData);
      return res.redirect('/?error=token_exchange');
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      console.error('No access_token received', tokenData);
      return res.redirect('/?error=no_access_token');
    }

    // Fetch user's profile
    const profileResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo?alt=json', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const profile = await profileResp.json();
    if (profile.error) {
      console.error('Profile fetch error:', profile);
      return res.redirect('/?error=profile_fetch');
    }

    // Save user in memory (for demo). Replace with DB in production.
    users[profile.id] = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      photoUrl: profile.picture
    };

    // Create session and redirect to dashboard
    req.session.userId = profile.id;
    res.redirect('/dashboard.html');

  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('/?error=internal');
  }
});

// Logout
app.get('/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).send('Logout failed');
    }
    res.clearCookie('sid', { path: '/' });
    res.redirect('/');
  });
});

// Protected API: profile
app.get('/api/profile', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const user = users[req.session.userId];
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on ${SITE_URL} (port ${PORT})`);
});
