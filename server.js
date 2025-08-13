const express = require('express');
const session = require('express-session');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
// These are now set by environment variables on your hosting platform (e.g., Render)
const FRONTEND_URL = process.env.FRONTEND_URL;
const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;

// The exact URL Google will redirect to after authentication
const REDIRECT_URI = `${BACKEND_URL}/auth/google/callback`;

// Check for essential environment variables on startup
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SESSION_SECRET || !FRONTEND_URL) {
    console.error('FATAL ERROR: Missing essential environment variables. Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, and FRONTEND_URL.');
    process.exit(1);
}

// --- MIDDLEWARE SETUP ---
// Enable CORS for your specific frontend URL
app.use(cors({
    origin: FRONTEND_URL,
    credentials: true, // Allow cookies to be sent from the frontend
}));

// Session middleware configuration for production
app.set('trust proxy', 1); // Trust first proxy, required for secure cookies on Render
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // Don't create session until something is stored
    cookie: {
        secure: true, // Use secure cookies in production (requires HTTPS)
        httpOnly: true, // Prevents client-side JS from accessing the cookie
        sameSite: 'none', // Necessary for cross-site cookie (frontend/backend on different domains)
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
}));

// A simple middleware to check if the user is authenticated
const isLoggedIn = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized: You must be logged in.' });
};


// --- AUTHENTICATION ROUTES ---

// 1. Redirect to Google's OAuth consent screen
app.get('/auth/google', (req, res) => {
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=profile email`;
    res.redirect(url);
});

// 2. Callback URL for Google to redirect to
app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Error: No code received from Google.');
    }

    try {
        // Exchange authorization code for an access token
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
        
        if (tokenData.error) {
            throw new Error(`Google token error: ${tokenData.error_description}`);
        }

        // Use the access token to get user's profile info
        const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
        });

        const profileData = await profileResponse.json();

        // Store user information in the session
        req.session.user = {
            id: profileData.id,
            name: profileData.name,
            email: profileData.email,
            picture: profileData.picture,
        };

        // Redirect user to their profile page on the frontend
        res.redirect(`${FRONTEND_URL}/profile.html`);

    } catch (error) {
        console.error('Error during Google OAuth callback:', error);
        res.status(500).redirect(`${FRONTEND_URL}/login.html?error=auth_failed`);
    }
});

// 3. Logout route
app.get('/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send('Could not log out.');
        }
        res.clearCookie('connect.sid'); // Clears the session cookie
        res.redirect(`${FRONTEND_URL}/login.html`);
    });
});


// --- API ROUTES ---

// An API endpoint to get the current logged-in user's data
// The 'isLoggedIn' middleware protects this route
app.get('/api/me', isLoggedIn, (req, res) => {
    res.json(req.session.user);
});

// --- SERVER START ---
app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
    console.log(`🔑 Backend URL: ${BACKEND_URL}`);
    console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
    console.log(`🔗 Redirect URI configured for Google: ${REDIRECT_URI}`);
});
