const axios = require('axios');

async function testLogin() {
  try {
    const res = await axios.post('http://localhost:3001/api/login', {
      email: 'test@example.com',
      password: 'wrongpassword'
    });
    console.log('Login Response:', res.data);
  } catch (err) {
    console.log('Login Error (Expected):', err.response?.data || err.message);
  }
}

testLogin();
