# Aether Reborn (MU 2D) — servidor da Render

Jogo 2D pixel art em Phaser (código em `game/`, vindo do branch `pixellab` de
`muonline-versao-2.0-nova-versao`) servido por um servidor Node em `server/`.

- **Build na Render**: `npm install --omit=dev` roda o `postinstall`, que instala as dependências
  do jogo em `game/website` e executa `game/build.sh` (saída em `game/website/out`).
- **Start**: `npm start` → `server/index.js` (porta `PORT`). Site em `/`, jogo em `/jogar/`.
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

## Site
O site fica em `/` (pasta `site/`) e o jogo em `/jogar/`. `site/data.js` é gerado no build por
`scripts/build-site-data.js` a partir dos dados do jogo (classes, skills, mapas, monstros, asas).
As imagens dos mapas em `site/img/maps/` são prints tirados dentro do jogo.

## Loja com dinheiro real (asas)
Usa o Stripe Checkout com as mesmas variáveis do jogo antigo, no painel da Render:
`STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`. O webhook do Stripe deve apontar para
`https://muonlineclaude.com/api/stripe-webhook` (evento `checkout.session.completed`).
Sem essas variáveis o botão 💳 aparece como "em breve". Preços em `WING_REAL_PRICE_CENTS`
(`game/website/src/gameplay/WingCatalog.ts`). Compras ficam na tabela `aether_purchases`.

## Reset de contas (24/11/2026)
Na primeira subida desta versão o servidor copia `accounts` e `aether_saves` para
`accounts_backup_20261124` / `aether_saves_backup_20261124` e apaga todas as contas (uma vez só,
marcado em `aether_meta`). O progresso salvo nos aparelhos também recomeça (save `v2`).
