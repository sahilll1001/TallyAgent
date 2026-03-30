const { Service } = require('node-windows');
const path        = require('path');
const fs          = require('fs');

// Validate dist/index.js exists before installing
const scriptPath = path.join(__dirname, 'dist', 'index.js');
if (!fs.existsSync(scriptPath)) {
    console.error('ERROR: dist/index.js not found. Run "npx tsc" first.');
    process.exit(1);
}

// Load .env values to embed into the service
require('dotenv').config();

function getEnv(key, fallback) {
    const val = process.env[key] || fallback;
    if (!val) {
        console.error(`ERROR: ${key} is required in .env`);
        process.exit(1);
    }
    return val;
}

const svc = new Service({
    name:        'TallyLocalAgent',
    description: 'Optimate ERP to Tally ERP sync agent. Polls Azure for pending invoices and posts to Tally.',
    script:      scriptPath,

    // Restart policy — restarts up to 3 times if it crashes
    maxRestarts: 3,
    wait:        2,
    grow:        0.25,

    // Environment variables baked into the service
    env: [
        { name: 'SPRING_API_URL',   value: getEnv('SPRING_API_URL')  },
        { name: 'AGENT_API_KEY',    value: getEnv('AGENT_API_KEY')   },
        { name: 'TALLY_URL',        value: getEnv('TALLY_URL', 'http://localhost:9000') },
        { name: 'TALLY_COMPANY',    value: getEnv('TALLY_COMPANY')   },
        { name: 'POLL_INTERVAL_MS', value: getEnv('POLL_INTERVAL_MS', '5000') },
        { name: 'BATCH_SIZE',       value: getEnv('BATCH_SIZE', '5') },
        { name: 'LOG_DIR',          value: getEnv('LOG_DIR', 'C:\\TallyAgent\\logs') },
        { name: 'NODE_ENV',         value: 'production' },
    ],
});

svc.on('install', () => {
    console.log('');
    console.log('✓  Service installed successfully');
    console.log('   Starting service...');
    svc.start();
});

svc.on('start', () => {
    console.log('✓  Service started');
    console.log('');
    console.log('   Useful commands:');
    console.log('   Check status  →  sc query TallyLocalAgent');
    console.log('   Stop service  →  sc stop TallyLocalAgent');
    console.log('   Start service →  sc start TallyLocalAgent');
    console.log('   View logs     →  type C:\\TallyAgent\\logs\\agent-YYYY-MM-DD.log');
    console.log('   Uninstall     →  node uninstall-service.js');
});

svc.on('error', (err) => {
    console.error('Service error:', err);
});

console.log('Installing TallyLocalAgent Windows service...');
svc.install();