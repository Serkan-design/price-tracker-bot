const axios = require('axios');

async function testManualTrade() {
  try {
    const loginRes = await axios.post('http://localhost:3002/api/login', {
      email: 'serkanisik67@gmail.com',
      password: 'admin123'
    });
    const jwt = loginRes.data.token;
    
    const res = await axios.post('http://localhost:3002/api/xauusd/manual-trade', { type: 'BUY' }, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    console.log('Trade Response:', res.data);
    
    const stats = await axios.get('http://localhost:3002/api/xauusd/trade-stats', {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    console.log('Current Position:', stats.data.currentPosition);
    console.log('Balance:', stats.data.virtualBalance);
    
  } catch (err) {
    console.log('Error:', err.response?.data || err.message);
  }
}

testManualTrade();
