const axios = require('axios');

async function diag() {
  const email = 'serkanisik67@gmail.com';
  const password = 'admin123';
  const baseUrl = 'http://localhost:3002';

  console.log(`📡 Connecting to ${baseUrl}...`);
  try {
    const loginRes = await axios.post(`${baseUrl}/api/login`, { email, password });
    const token = loginRes.data.token;
    console.log('✅ Login successful!');

    const productsRes = await axios.get(`${baseUrl}/api/products`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`✅ Products loaded: ${productsRes.data.length} items.`);
    productsRes.data.forEach(p => console.log(`   - ${p.name} (${p.id})`));
  } catch (err) {
    console.error('❌ Error during diagnostics:', err.response?.data || err.message);
  }
}

diag();
