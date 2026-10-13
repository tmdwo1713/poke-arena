const fs = require('fs');
const path = require('path');
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) {
      if (name !== 'assets' && name !== 'node_modules' && name !== '.git') walk(file);
      continue;
    }
    if (!/\.(js|css|html|md)$/.test(name)) continue;
    const buf = fs.readFileSync(file);
    const utf16 = buf.length > 1 && ((buf[0] === 0xff && buf[1] === 0xfe) || buf[1] === 0);
    if (utf16) {
      fs.writeFileSync(file, buf.toString('utf16le').replace(/^\uFEFF/, ''));
      console.log('fixed', path.relative(process.cwd(), file));
    }
  }
}
walk(path.join(__dirname, '..'));