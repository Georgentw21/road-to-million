// Build-time: fold the built app.js + app.css into a single self-contained HTML
// that runs from file:// with no network. Output: road-to-million-backtest.html
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-standalone');

let html = fs.readFileSync(path.join(dist, 'standalone.html'), 'utf8');

// inline CSS
html = html.replace(/<link[^>]*rel="stylesheet"[^>]*href="[^"]*app\.css"[^>]*>/i, () => {
  const css = fs.readFileSync(path.join(dist, 'app.css'), 'utf8');
  return '<style>' + css + '</style>';
});

// inline JS (escape any literal </script> so it can't close the tag early)
html = html.replace(/<script[^>]*src="[^"]*app\.js"[^>]*><\/script>/i, () => {
  const js = fs.readFileSync(path.join(dist, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  return '<script type="module">' + js + '</script>';
});

const dest = path.join(root, 'road-to-million-backtest.html');
fs.writeFileSync(dest, html);
console.log('✓ wrote ' + path.basename(dest) + ' (' + (fs.statSync(dest).size / 1024 / 1024).toFixed(2) + ' MB, fully self-contained)');
