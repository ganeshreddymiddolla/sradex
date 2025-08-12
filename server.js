const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// --- SECURITY: Load secrets from environment variables ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;

// --- Temporary in-memory "database" ---
const users = {};

// --- MIDDLEWARE ---
app.use(cors({
    origin: 'https://sradexlearning.com', // frontend domain
    credentials: true // allow cookies
}));

app.use(express.json());
app.use(cookieParser());

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,         // requires HTTPS
        httpOnly: true,
        sameSite: 'none',     // allow cross-site
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// --- AUTHENTICATION ROUTES ---

// 1. Start Google OAuth login
app.get('/auth/google', (req, res) => {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', 'https://sradex.onrender.com/auth/google/callback');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    res.redirect(authUrl.toString());
});

// 2. Handle Google callback
app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    try {
        // Exchange code for token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: 'https://sradex.onrender.com/auth/google/callback',
                grant_type: 'authorization_code',
            }),
        });
        const tokenData = await tokenResponse.json();

        // Fetch user profile
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
        });
        const profile = await userResponse.json();

        // Store user
        users[profile.id] = {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            photoUrl: profile.picture
        };

        // Create session
        req.session.userId = profile.id;

        // Redirect to dashboard
        res.redirect('https://sradexlearning.com/sampleprofile.html');

    } catch (error) {
        console.error('Error during Google callback:', error);
        res.redirect('https://sradexlearning.com/sampleloginbuttun.html');
    }
});

// 3. Logout
app.get('/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).send("Could not log out.");
        res.clearCookie('connect.sid', { sameSite: 'none', secure: true });
        res.redirect('https://sradexlearning.com/sampleloginbuttun.html');
    });
});

// --- PROTECTED ROUTE ---
const isLoggedIn = (req, res, next) => {
    if (req.session.userId) next();
    else res.status(401).json({ error: 'Unauthorized: Please log in.' });
};

app.get('/api/profile', isLoggedIn, (req, res) => {
    const user = users[req.session.userId];
    if (user) res.json(user);
    else res.status(404).json({ error: 'User not found.' });
});

// --- SERVER LISTENER ---
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
