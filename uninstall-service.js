const { Service } = require('node-windows');
const path        = require('path');

const svc = new Service({
    name:   'TallyLocalAgent',
    script: path.join(__dirname, 'dist', 'index.js'),
});

svc.on('uninstall', () => {
    console.log('✓  TallyLocalAgent service uninstalled successfully');
});

svc.uninstall();