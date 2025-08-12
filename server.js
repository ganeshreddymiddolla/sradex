// server.js
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------- CONFIG ----------------
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;

// Default to localhost in dev, or use production SITE_URL from env
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
const REDIRECT_URI = `${SITE_URL.replace(/\/$/, '')}/auth/google/callback`;

// ---------------- TEMP DATABASE ----------------
const users = {};

// ---------------- MIDDLEWARE ----------------
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173', // Change in production
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: SITE_URL.startsWith('https'), // Only secure in production
        httpOnly: true,
        sameSite: 'none', // Required for cross-site cookies
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// ---------------- AUTH ROUTES ----------------

// Step 1: Redirect user to Google
app.get('/auth/google', (req, res) => {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    res.redirect(authUrl.toString());
});

// Step 2: Handle Google callback
app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.redirect(`${process.env.FRONTEND_URL}/sampleloginbuttun.html`);
    }

    try {
        // Exchange code for token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code',
            }),
        });
        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) throw new Error('Failed to get access token');

        // Get user info
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const profile = await userResponse.json();
        if (!profile.id) throw new Error('Failed to fetch profile');

        // Save in "database"
        users[profile.id] = {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            photoUrl: profile.picture
        };

        // Create session
        req.session.userId = profile.id;

        // Redirect to profile dashboard
        res.redirect(`${process.env.FRONTEND_URL}/sampleprofile.html`);
    } catch (err) {
        console.error('Google login error:', err);
        res.redirect(`${process.env.FRONTEND_URL}/sampleloginbuttun.html`);
    }
});

// Step 3: Logout
app.get('/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).send('Could not log out.');
        res.clearCookie('connect.sid', { sameSite: 'none', secure: SITE_URL.startsWith('https') });
        res.redirect(`${process.env.FRONTEND_URL}/sampleloginbuttun.html`);
    });
});

// ---------------- PROTECTED ROUTE ----------------
const isLoggedIn = (req, res, next) => {
    if (req.session.userId) return next();
    res.status(401).json({ error: 'Unauthorized: Please log in.' });
};

app.get('/api/profile', isLoggedIn, (req, res) => {
    const user = users[req.session.userId];
    if (user) return res.json(user);
    res.status(404).json({ error: 'User not found.' });
});

// ---------------- START SERVER ----------------
app.listen(PORT, () => {
    console.log(`✅ Server running at ${SITE_URL}`);
});
