import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const localhostUrl = 'http://127.0.0.1:4173/';

test('npm start serves AIrobo on the documented localhost port', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

  assert.equal(
    packageJson.scripts.start,
    'python3 -m http.server 4173 --bind 127.0.0.1',
  );
});

test('direct file preview redirects to the local HTTP server', async () => {
  const indexHtml = await readFile('index.html', 'utf8');

  assert.match(indexHtml, /window\.location\.protocol === 'file:'/);
  assert.ok(indexHtml.includes(`window.location.replace('${localhostUrl}')`));
});

test('README documents the localhost workflow and file URL warning', async () => {
  const readme = await readFile('README.md', 'utf8');

  assert.match(readme, /npm start/);
  assert.ok(readme.includes(localhostUrl));
  assert.match(readme, /Do not open `index\.html` directly with `file:\/\/`/);
});
