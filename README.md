# Aether Reborn (MU 2D) — servidor da Render

Jogo 2D pixel art em Phaser (código em `game/`, vindo do branch `pixellab` de
`muonline-versao-2.0-nova-versao`) servido por um servidor Node em `server/`.

- **Build na Render**: `npm install --omit=dev` roda o `postinstall`, que instala as dependências
  do jogo em `game/website` e executa `game/build.sh` (saída em `game/website/out`).
- **Start**: `npm start` → `server/index.js` (porta `PORT`).
- **Banco**: usa o mesmo PostgreSQL (`DATABASE_URL`, `PG_SCHEMA`). Reaproveita a tabela `accounts`
  (mesmo login do jogo antigo) e cria `aether_tokens` e `aether_saves` para o salvamento na nuvem.
- **Multiplayer**: WebSocket em `/room/<mapa>` — jogadores do mesmo mapa se veem em tempo real.
- **API**: `/api/health`, `/api/register`, `/api/login`, `/api/logout`, `/api/save` (GET/PUT), `/api/ranking`.
- `/app` (app Android) redireciona para o jogo; o APK continua em `/download/`.

## Controles
Joystick analógico (celular), ATACAR (segure para repetir), skills 1–4, Magia, Poção,
AUTO (caça sozinho: anda até o monstro, usa skills e poção), e menu rápido: Loja, Mapas,
Mochila, Herói, Asas, Armas, Sets, Glacial, Kundun, Refúgio e Conta.
Teclado: WASD/Shift, J ataque, L magia, 1–4 skills, Q poção, R refúgio, I/C/B janelas.

## Rodar localmente
```
npm install            # compila o jogo
DATABASE_URL=postgres://... npm start   # sem DATABASE_URL o jogo roda, mas sem conta/nuvem
```
