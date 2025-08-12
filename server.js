// This is the complete server.js file
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();

// Use the port Render provides, or 3000 for local testing
const PORT = process.env.PORT || 3000;

// Use secrets from Environment Variables, NOT hardcoded
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

app.use(cors()); // Allow requests from other domains
app.use(express.json()); // Allow the server to read JSON from requests

// This is the main endpoint that does all the work
app.post('/api/exchange-code', async (req, res) => {
    try {
        const { code } = req.body; // Get the code from the frontend request

        if (!code) {
            return res.status(400).json({ error: 'Authorization code is missing.' });
        }

        // Exchange the code for a token using your secret
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: 'https://sradexlearning.com/sampleprofile.html', // Must match exactly
                grant_type: 'authorization_code',
            }),
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            return res.status(400).json({ error: tokenData.error_description });
        }
        
        // Use the token to get the user's details
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
        });

        const userData = await userResponse.json();

        // Send only the necessary, safe details back to the frontend
        res.json({
            name: userData.name,
            email: userData.email,
        });

    } catch (error) {
        console.error('Error during token exchange:', error);
        res.status(500).json({ error: 'Failed to authenticate.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
