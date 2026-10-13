// Downloads PokeAPI sprites into assets/sprites. Usage: node tools/download-sprites.js
const fs = require('fs');
const path = require('path');

const vm = require('vm');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8') + '\nthis.ids = allSpriteIds();', sandbox);
const ids = sandbox.ids;
const base = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const root = path.join(__dirname, '..', 'assets', 'sprites');

const jobs = [];
for (const id of ids) {
  jobs.push([`${base}/other/showdown/${id}.gif`, `front/${id}.gif`]);
  jobs.push([`${base}/other/showdown/back/${id}.gif`, `back/${id}.gif`]);
  jobs.push([`${base}/${id}.png`, `static/${id}.png`]);
}

async function get([url, rel]) {
  const dest = path.join(root, rel);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return 'skip';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) return `HTTP ${res.status} ${rel}`;
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      return 'ok';
    } catch (e) {
      if (attempt === 2) return `ERR ${rel} ${e.message}`;
    }
  }
}

(async () => {
  const results = [];
  for (let i = 0; i < jobs.length; i += 8) {
    results.push(...await Promise.all(jobs.slice(i, i + 8).map(get)));
  }
  const failed = results.filter(r => r !== 'ok' && r !== 'skip');
  console.log(`done: ${results.length - failed.length}/${results.length}`);
  failed.forEach(f => console.log(f));
})();
