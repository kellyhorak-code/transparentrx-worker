const TOKEN = '9934ee1f1f331b1df56308e2dd3c0a6ac12b345ed42b12fc6ad0de578a93c8da';
const WORKER_URL = 'https://transparentrx-pricing.kellybhorak.workers.dev';

async function importNADAC() {
  console.log('💰 Starting NADAC pricing import...');
  console.log('⏱️  This takes about 2-3 minutes...\n');
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${WORKER_URL}/api/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    if (response.ok) {
      console.log(`✅ NADAC IMPORT COMPLETE! 🎉`);
      console.log(`⏱️  Duration: ${duration} seconds`);
      console.log(`📊 Response:`, data);
    } else {
      console.log(`❌ Error:`, data);
    }
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}

importNADAC();
