// Builds zz-test.html: a spectate battle fast-forwarded N seconds, for headless screenshots.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const arg = process.argv[2] || '9';
const secs = parseFloat(arg);
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<script src="js/ui.js"></script>', isNaN(secs) ? `<script src="js/ui.js"></script><script>show('${arg}');</script>` : `<script src="js/ui.js"></script>
<script>
startWatch();
setTimeout(() => {
  for (let i = 0; i < 60 * ${secs}; i++) game.update(1 / 60);
  game.paused = true;
  game.render();
  updateHUD();
}, 1500);
</script>`);
fs.writeFileSync(path.join(root, 'zz-test.html'), html);
