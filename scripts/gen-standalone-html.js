// Build-time: derive standalone.html from index.html so styles/fonts never drift.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const style = (idx.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
const fonts = (idx.match(/<link rel="preconnect"[\s\S]*?rel="stylesheet">/) || [''])[0];

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Road to Million — Backtest (Local)</title>
${fonts}
${style}
</head>
<body>
<div id="root"></div>
<script type="module" src="/src/standalone.jsx"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'standalone.html'), html);
console.log('✓ standalone.html generated from index.html');
