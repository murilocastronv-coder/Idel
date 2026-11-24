'use strict';
// Compila o jogo (Phaser + Vite) durante o "npm install" da Render.
// A Render roda "npm install --omit=dev"; o jogo tem as próprias dependências em game/website.
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const game = path.join(__dirname, '..', 'game');
const site = path.join(game, 'website');
if (!fs.existsSync(site)) { console.log('[build] pasta game/website ausente, nada a compilar'); process.exit(0); }
if (process.env.SKIP_GAME_BUILD === '1') { console.log('[build] SKIP_GAME_BUILD=1'); process.exit(0); }

const run = (cmd, cwd) => {
  console.log(`[build] ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', npm_config_production: 'false', npm_config_omit: '', npm_config_include: 'dev' } });
};
run('npm ci --include=dev --no-audit --no-fund', site);
// build.sh pula o próprio "npm ci" quando este hash bate com o package-lock.json.
const crypto = require('crypto');
fs.writeFileSync(path.join(site, 'node_modules', '.lock-hash'),
  crypto.createHash('md5').update(fs.readFileSync(path.join(site, 'package-lock.json'))).digest('hex') + '\n');
run('bash build.sh', game);
console.log('[build] jogo pronto em game/website/out');
require('./build-site-data.js');
