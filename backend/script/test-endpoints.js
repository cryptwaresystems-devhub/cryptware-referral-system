import axios from 'axios';

const API_BASE = 'http://localhost:8000/api';

const endpoints = [
  // Health & Info
  { method: 'GET', path: '/', description: 'Root endpoint' },
  { method: 'GET', path: '/health', description: 'Health check' },
  { method: 'GET', path: '/env-check', description: 'Environment check' },
  
  // Auth endpoints
  { method: 'POST', path: '/auth/login', description: 'Partner login' },
  { method: 'POST', path: '/auth/internal-login', description: 'Internal login' },
  { method: 'POST', path: '/auth/register', description: 'Partner registration' },
  { method: 'POST', path: '/auth/send-otp', description: 'Send OTP' },
  { method: 'POST', path: '/auth/verify-otp', description: 'Verify OTP' },
  
  // Referral endpoints
  { method: 'GET', path: '/referrals', description: 'List referrals' },
  { method: 'POST', path: '/referrals/create', description: 'Create referral' },
  
  // Lead endpoints
  { method: 'GET', path: '/leads', description: 'List leads' },
  { method: 'POST', path: '/leads', description: 'Create lead' },
  
  // Partner endpoints
  { method: 'GET', path: '/partner/dashboard', description: 'Partner dashboard' },
  { method: 'GET', path: '/partner/profile', description: 'Partner profile' },
  
  // Bank endpoints
  { method: 'GET', path: '/bank/list', description: 'Bank list' },
  { method: 'POST', path: '/bank/verify', description: 'Bank verification' },
  
  // Other endpoints
  { method: 'GET', path: '/payments', description: 'Payments' },
  { method: 'GET', path: '/commissions/partner', description: 'Commissions' },
  { method: 'GET', path: '/internal/dashboard', description: 'Internal dashboard' },
  { method: 'GET', path: '/admin/system-config', description: 'System config' }
];

async function testEndpoint(endpoint) {
  try {
    const url = `${API_BASE}${endpoint.path}`;
    console.log(`Testing: ${endpoint.method} ${endpoint.path}`);
    
    let response;
    if (endpoint.method === 'GET') {
      response = await axios.get(url);
    } else if (endpoint.method === 'POST') {
      response = await axios.post(url, {}); // Empty body for testing
    }
    
    if (response.status >= 200 && response.status < 300) {
      console.log(`✅ SUCCESS: ${endpoint.description} (${response.status})`);
      return true;
    } else {
      console.log(`⚠️  WARNING: ${endpoint.description} (${response.status})`);
      return false;
    }
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      console.log(`❌ ERROR: ${endpoint.description} (${error.response.status}) - ${error.response.data?.message || 'No message'}`);
    } else if (error.request) {
      // No response received
      console.log(`❌ NETWORK ERROR: ${endpoint.description} - No response from server`);
    } else {
      // Other error
      console.log(`❌ UNEXPECTED ERROR: ${endpoint.description} - ${error.message}`);
    }
    return false;
  }
}

async function testAllEndpoints() {
  console.log('🚀 Starting endpoint tests...\n');
  
  let successCount = 0;
  let totalCount = endpoints.length;
  
  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint);
    if (success) successCount++;
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between requests
  }
  
  console.log(`\n📊 TEST SUMMARY:`);
  console.log(`✅ Successful: ${successCount}/${totalCount}`);
  console.log(`❌ Failed: ${totalCount - successCount}/${totalCount}`);
  console.log(`📈 Success Rate: ${((successCount / totalCount) * 100).toFixed(1)}%`);
}

testAllEndpoints();