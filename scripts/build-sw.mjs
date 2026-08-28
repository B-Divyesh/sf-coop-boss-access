import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve('dist');
const html = await readFile(resolve(dist, 'index.html'), 'utf8');
const urls = new Set(['/', '/favicon.svg', '/art/night-market-dragon.webp']);

for (const match of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
  if (match[1].startsWith('/')) urls.add(match[1]);
}

for (const stylesheet of [...urls].filter((url) => url.endsWith('.css'))) {
  const css = await readFile(resolve(dist, `.${stylesheet}`), 'utf8');
  for (const match of css.matchAll(/url\((?:"|')?([^)'"?]+)(?:"|')?\)/g)) {
    const value = match[1];
    if (value.startsWith('/')) urls.add(value);
  }
}

const core = [...urls].sort();
const version = createHash('sha256').update(core.join('\n')).digest('hex').slice(0, 12);
const template = await readFile(resolve('public', 'sw.js'), 'utf8');
const worker = template
  .replace("'coop-boss-shell-dev'", `'coop-boss-shell-${version}'`)
  .replace("['/', '/favicon.svg', '/art/night-market-dragon.webp']", JSON.stringify(core));

await writeFile(resolve(dist, 'sw.js'), worker);
console.log(`Generated sw.js with ${core.length} precached files (${version}).`);
