// Script to update admin password via Supabase Admin API
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ADMIN_UUID = '00000000-0000-0000-0000-000000000001';

async function updateAdminPassword() {
  // Update password via Supabase Admin API - this correctly hashes it
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${ADMIN_UUID}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      password: 'admin123',
      email_confirm: true,
    }),
  });

  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Result:', JSON.stringify(data, null, 2));

  if (res.ok) {
    console.log('\n✅ Admin password updated! Login: admin / admin');
    
    // Test login
    const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        email: 'admin@system.local',
        password: 'admin123',
      }),
    });
    const loginData = await loginRes.json();
    console.log('\nTest login result:', res.ok ? '✅ SUCCESS' : '❌ FAILED');
    if (loginData.access_token) {
      console.log('Access token received:', loginData.access_token.substring(0, 30) + '...');
    } else {
      console.log(loginData);
    }
  }
}

updateAdminPassword().catch(console.error);
