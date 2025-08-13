const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const session = require("express-session");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
// Use Render's external URL in production, otherwise default to localhost.
const SITE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const REDIRECT_URI = `${SITE_URL}/auth/google/callback`;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SESSION_SECRET) {
  console.error("❌ Missing required environment variables.");
  process.exit(1);
}

// In-memory user store (for demonstration purposes)
const users = {};

// --- MIDDLEWARES ---
app.use(cors({
  origin: "https://sradexlearning.com", // Your frontend URL
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // Requires HTTPS
    httpOnly: true,
    sameSite: "none", // Essential for cross-site cookies
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// --- ROUTES ---

// 1. Start Google OAuth flow
app.get("/auth/google", (req, res) => {
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("access_type", "offline");
  
  console.log("Redirecting to Google:", authUrl.toString());
  res.redirect(authUrl.toString());
});

// 2. Google OAuth callback handler
app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.redirect("https://sradexlearning.com/sampleloginbuttun.html?error=NoCode");
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code"
      })
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error || !tokenData.access_token) {
      throw new Error(`Token exchange failed: ${tokenData.error_description || 'No access token'}`);
    }

    // Fetch user profile from Google
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await profileRes.json();

    // Store user data and create a session
    users[profile.id] = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      photoUrl: profile.picture
    };

    req.session.userId = profile.id;
    
    // Redirect to the profile page on success
    res.redirect("https://sradexlearning.com/sampleprofile.html");

  } catch (err) {
    console.error("❌ OAuth Callback Error:", err);
    res.redirect("https://sradexlearning.com/sampleloginbuttun.html?error=OAuthFailed");
  }
});

// 3. Logout
app.get("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
        console.error("Logout error:", err);
    }
    res.clearCookie("connect.sid"); // The default session cookie name
    res.redirect("https://sradexlearning.com/sampleloginbuttun.html");
  });
});

// Middleware to protect routes
const isLoggedIn = (req, res, next) => {
  if (req.session.userId) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
};

// 4. API to get the logged-in user's profile
app.get("/api/profile", isLoggedIn, (req, res) => {
  const user = users[req.session.userId];
  if (!user) {
    // This can happen if the server restarts and the in-memory 'users' object is cleared
    return res.status(404).json({ error: "User not found, please log in again." });
  }
  res.json(user);
});

app.listen(PORT, () => {
  console.log(`✅ Server running at ${SITE_URL}`);
  console.log(`🔑 Redirect URI configured as: ${REDIRECT_URI}`);
});
