const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.');
  console.error('Set them in your Vercel project: Settings → Environment Variables.');
  process.exit(1);
}

const output = `const SUPABASE_URL = '${url}';\nconst SUPABASE_ANON_KEY = '${key}';\nexport { SUPABASE_URL, SUPABASE_ANON_KEY };\n`;

fs.writeFileSync(path.join(__dirname, '..', 'js', 'config.js'), output);
console.log('✓ js/config.js generated from environment variables.');
