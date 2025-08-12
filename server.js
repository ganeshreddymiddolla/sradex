const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const session = require('express-session'); // For managing user sessions
const cookieParser = require('cookie-parser'); // To parse cookies

const app = express();
const PORT = process.env.PORT || 3000;

// --- SECURITY: Load secrets from environment variables ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET; // A new secret for signing session cookies

// --- In-memory "database" for demonstration purposes ---
// In a real app, you would use a proper database like PostgreSQL or MongoDB.
const users = {};

// --- MIDDLEWARE SETUP ---
app.use(cors({
    origin: 'https://sradexlearning.com', // your frontend domain
    credentials: true // ✅ allow cookies
}));
 // Enable CORS for all routes
app.use(express.json()); // Parse JSON bodies
app.use(cookieParser()); // Parse cookies from incoming requests

// Session Middleware: Creates a `req.session` object for each user
app.use(session({
    secret: SESSION_SECRET, // A secret key to sign the session ID cookie
    resave: false,
    saveUninitialized: false,
    cookie: {
    secure: true, // ✅ required for HTTPS
    httpOnly: true,
    sameSite: 'none', // ✅ allow cross-site cookies
    maxAge: 24 * 60 * 60 * 1000
}

}));


// --- AUTHENTICATION ROUTES ---

// 1. /auth/google: The starting point for the login process.
//    Redirects the user to Google's consent screen.
app.get('/auth/google', (req, res) => {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', 'https://sradex.onrender.com/auth/google/callback'); // The URL this server will handle
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    res.redirect(authUrl.toString());
});

// 2. /auth/google/callback: Google redirects here after user gives consent.
//    We exchange the code for user info, create a session, and redirect to the dashboard.
app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;

    try {
        // Exchange code for an access token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: 'https://sradex.onrender.com/auth/google/callback',
                grant_type: 'authorization_code',
            }),
        });
        const tokenData = await tokenResponse.json();

        // Use token to get user's profile info
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
        });
        const profile = await userResponse.json();

        // Find or create user in our "database"
        users[profile.id] = {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            photoUrl: profile.picture
        };

        // *** IMPORTANT: Create the session ***
        req.session.userId = profile.id;

        // *** FIXED: Redirect to your actual profile page ***
        res.redirect('https://sradexlearning.com/sampleprofile.html');

    } catch (error) {
        console.error('Error during Google callback:', error);
        // *** FIXED: Redirect to your actual login page on error ***
        res.redirect('https://sradexlearning.com/sampleloginbuttun.html'); 
    }
});

// 3. /auth/logout: Destroys the session and logs the user out.
app.get('/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send("Could not log out.");
        }
        res.clearCookie('connect.sid'); 
        // *** FIXED: Redirect to your actual login page ***
        res.redirect('https://sradexlearning.com/sampleloginbuttun.html');
    });
});


// --- PROTECTED API ROUTE ---

// This middleware function checks if a user is logged in before allowing access to a route.
const isLoggedIn = (req, res, next) => {
    if (req.session.userId) {
        next(); // User is logged in, proceed to the next function
    } else {
        res.status(401).json({ error: 'Unauthorized: Please log in.' }); // User is not logged in
    }
};

// /api/profile: A protected route that only logged-in users can access.
app.get('/api/profile', isLoggedIn, (req, res) => {
    const user = users[req.session.userId];
    if (user) {
        res.json(user);
    } else {
        res.status(404).json({ error: 'User not found.' });
    }
});


// --- SERVER LISTENER ---
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
