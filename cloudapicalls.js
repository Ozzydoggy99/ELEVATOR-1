const crypto = require('crypto');
const fetch = require('node-fetch'); // If using Node 18+, you can use global fetch

// === CONFIGURATION ===
const API_URL = 'https://YOUR_CLOUD_API_DOMAIN/auth/v1.1/token'; // Replace with actual domain
const APP_ID = 'yourAppId';
const APP_SECRET = 'yourAppSecret';
const APP_CODE = 'yourAppCode'; // For Authorization header

// === GENERATE TIMESTAMP AND SIGNATURE ===
const timestamp = Date.now();
const signString = APP_ID + timestamp + APP_SECRET;
const sign = crypto.createHash('md5').update(signString).digest('hex');

// === PREPARE REQUEST ===
const headers = {
  'Content-Type': 'application/json',
  'Authorization': APP_CODE
};

const body = {
  appId: APP_ID,
  timestamp,
  sign
};

// === SEND REQUEST ===
async function getAccessToken() {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const data = await res.json();
    console.log('Response:', data);
  } catch (err) {
    console.error('Error:', err);
  }
}

getAccessToken(); 