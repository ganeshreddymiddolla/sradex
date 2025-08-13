const express = require('express');
const session = require('express-session');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
const FRONTEND_URL = process.env.FRONTEND_URL;
const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
const REDIRECT_URI = `${BACKEND_URL}/auth/google/callback`;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SESSION_SECRET || !FRONTEND_URL) {
    console.error('FATAL ERROR: Missing essential environment variables.');
    process.exit(1);
}

// --- MIDDLEWARE SETUP ---
app.use(cors({
    origin: FRONTEND_URL,
    credentials: true,
}));

app.set('trust proxy', 1);
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,
        httpOnly: true,
        sameSite: 'none',
        maxAge: 24 * 60 * 60 * 1000,
    },
}));

const isLoggedIn = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized: You must be logged in.' });
};


// --- AUTHENTICATION ROUTES ---

// 1. Redirect to Google's OAuth consent screen
app.get('/auth/google', (req, res) => {
    // --- THIS IS THE MODIFIED LINE ---
    // We've added "&prompt=select_account" to the end of the URL.
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=profile email&prompt=select_account`;
    
    res.redirect(url);
});

// 2. Callback URL for Google to redirect to
// In server.js, find the /auth/google/callback route and replace its content

app.get('/auth/google/callback', async (req, res) => {
    // ... (keep the code that gets code, tokenData, and profileData)

    try {
        // ... (your existing code to get profileData from Google)

        const profileData = await profileResponse.json();

        // **NEW CODE STARTS HERE**
        // Instead of creating a Node.js session, we redirect to a PHP handler
        // to create a PHP session and save the user to the database.
        const phpHandlerUrl = new URL(`${FRONTEND_URL}/google_auth_handler.php`);
        
        // Pass user data as query parameters
        phpHandlerUrl.searchParams.append('google_id', profileData.id);
        phpHandlerUrl.searchParams.append('name', profileData.name);
        phpHandlerUrl.searchParams.append('email', profileData.email);
        phpHandlerUrl.searchParams.append('picture', profileData.picture);

        // Redirect the user's browser to the PHP script
        res.redirect(phpHandlerUrl.toString());

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
        res.clearCookie('connect.sid');
        res.redirect(`${FRONTEND_URL}/login.html`);
    });
});


// --- API ROUTES ---
app.get('/api/me', isLoggedIn, (req, res) => {
    res.json(req.session.user);
});


// --- SERVER START ---
app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
});
