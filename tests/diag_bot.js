const axios = require('axios');

async function checkAnalysis() {
  const token = 'YOUR_TOKEN_HERE'; // I need a token. I'll use the admin password to get one.
  try {
    // 1. Login to get token
    const loginRes = await axios.post('http://localhost:3002/api/login', {
      email: 'serkanisik67@gmail.com',
      password: 'admin123'
    });
    const jwt = loginRes.data.token;
    
    // 2. Get Analysis
    const res = await axios.get('http://localhost:3002/api/xauusd/analysis', {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    console.log('Analysis:', JSON.stringify(res.data, null, 2));
    
    // 3. Get Stats
    const stats = await axios.get('http://localhost:3002/api/xauusd/trade-stats', {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    console.log('Stats:', JSON.stringify(stats.data, null, 2));
    
  } catch (err) {
    console.log('Error:', err.response?.data || err.message);
  }
}

checkAnalysis();
