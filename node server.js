// In server.js
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors'); // Make sure to use CORS
const app = express();

// Use the port the hosting service provides, or 3000 for local testing
const PORT = process.env.PORT || 3000;

app.use(cors()); // Allow requests from other domains
app.use(express.json());

// Your app.post('/api/exchange-code', ...) route goes here
app.post('/api/exchange-code', async (req, res) => {
    // ... all your existing backend logic
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
