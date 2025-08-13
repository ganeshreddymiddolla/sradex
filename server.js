const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const session = require("express-session");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = process.env.PORT || 3000;

// Config
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
const REDIRECT_URI = `${SITE_URL.replace(/\/$/, '')}/auth/google/callback`;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SESSION_SECRET) {
  console.error("❌ Missing required environment variables");
  process.exit(1);
}

const users = {};

// Middlewares
app.use(cors({
  origin: "https://sradexlearning.com",
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // cookies only over HTTPS
    httpOnly: true,
    sameSite: "none", // required for cross-site cookies
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Start Google OAuth
app.get("/auth/google", (req, res) => {
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("access_type", "offline");
  res.redirect(authUrl.toString());
});

// Google OAuth callback
app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect("https://sradexlearning.com/sampleloginbuttun.html");

  try {
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
    if (!tokenData.access_token) throw new Error("No access token");

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
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
    res.redirect("https://sradexlearning.com/sampleprofile.html");
  } catch (err) {
    console.error("OAuth error:", err);
    res.redirect("https://sradexlearning.com/sampleloginbuttun.html");
  }
});

// Logout
app.get("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("https://sradexlearning.com/sampleloginbuttun.html");
  });
});

// Middleware for checking login
const isLoggedIn = (req, res, next) => {
  if (req.session.userId) return next();
  res.status(401).json({ error: "Unauthorized" });
};

// Get logged in profile
app.get("/api/profile", isLoggedIn, (req, res) => {
  const user = users[req.session.userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.listen(PORT, () => {
  console.log(`✅ Server running at ${SITE_URL}`);
});
