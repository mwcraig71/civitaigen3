const fetch = require('node-fetch');

async function checkLoras() {
  try {
    const response = await fetch('http://localhost:5000/api/models');
    const models = await response.json();
    
    console.log('=== AVAILABLE LORA MODELS ===');
    const loras = models.filter(m => m.type === 'lora');
    console.log(`Found ${loras.length} LoRA models:`);
    
    loras.slice(0, 10).forEach((lora, i) => {
      console.log(`${i+1}. ID: ${lora.id}`);
      console.log(`   Name: ${lora.name}`);
      console.log(`   ARN: ${lora.arn || 'Missing ARN'}`);
      console.log('');
    });
    
    console.log('=== LOOKING FOR PROBLEMATIC LORA IDS ===');
    const problemIds = [
      'ca98186a-64b0-4b9b-9bec-82c8c4bc8746',
      'c927cf03-8bf3-4f36-86c2-c97a81d742af',
      '670cc0b7-c020-40dd-86ed-4471bbb740c4'
    ];
    
    problemIds.forEach(id => {
      const found = models.find(m => m.id === id);
      console.log(`ID ${id}: ${found ? 'FOUND' : 'NOT FOUND'}`);
      if (found) {
        console.log(`  Name: ${found.name}, Type: ${found.type}, ARN: ${found.arn}`);
      }
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkLoras();