# MU Idle Legends — portal, contas e heróis

Primeira etapa do MMORPG Idle 2D em pixel art: a página inicial completa, com contas reais salvas no PostgreSQL e contagem de jogadores ao vivo.

## O que já funciona

- **Página inicial** com cena animada em pixel art (os seis heróis lutando contra monstros em Lorencia), galeria das 6 classes com atributos e habilidades, 30 mapas desenhados com filtro por nível, inventário de exemplo com 6 raridades, notícias e eventos vindos do banco e ranking (resets, nível, poder, bosses).
- **Contador ao vivo** por WebSocket: jogadores logados online, pessoas no site, contas registradas e heróis criados. Reconecta sozinho se a internet cair.
- **Criar conta** (usuário, e-mail, senha) — já entra logado e mostra um **código de recuperação** uma única vez.
- **Entrar** com usuário *ou* e-mail, opção "manter conectado" (30 dias).
- **Sair** (apaga a sessão no servidor).
- **Esqueci a senha**, de dois jeitos:
  - por e-mail: link de uso único válido por 1 hora;
  - pelo código de recuperação, sem precisar de e-mail (gera um código novo em seguida).
- **Minha conta**: criar até 5 heróis (nome único, classe, cor de cabelo e tom de pele com prévia animada), excluir herói (digitando o nome), trocar senha e gerar novo código de recuperação.
- Tudo é salvo no PostgreSQL e continua lá depois que o servidor reinicia.

## O mundo jogável

No painel **Minha conta**, cada herói tem o botão **Entrar no mundo** (`/game.html?c=ID`).

- **Mapas abertos:** Lorencia (cidade, loja, zona segura), Noria (nível 1), Devias (nível 10) e Dungeon (nível 25) com o boss **Rei Esqueleto**, que volta 10 minutos depois de derrotado. A galeria mostra as 29 regiões do atlas (`public/assets/maps/`).
- **Combate automático (AUTO):** o herói procura o monstro mais próximo, anda até ele, ataca, usa as habilidades ligadas e toma poções sozinho nos limites configurados. Também dá para tocar no chão para andar e tocar num monstro para atacá-lo.
- **Servidor como autoridade:** movimento, dano, EXP, Zen, drops, compra e venda são calculados no servidor; o navegador só envia intenções.
- **Progressão:** EXP cada vez mais difícil, pontos por nível (manual ou automático), morte com renascimento em Lorencia e volta automática ao farm.
- **Itens:** armas por classe, conjuntos de couro/bronze/escamas/dragão com bônus de conjunto, anéis, 6 raridades, melhorias +1 a +3, equipar, desequipar, vender e "Equipar o melhor". Itens abaixo da raridade escolhida viram Zen na hora.
- **Progresso offline:** com o AUTO ligado ao sair, o servidor calcula até 8 horas de farm (EXP, Zen, itens, poções gastas) usando só o relógio do servidor, e mostra um relatório ao voltar.
- **Multiplayer:** todos os jogadores no mesmo mapa se veem em tempo real, com chat global e avisos do boss. Cada conta pode ter só um herói no mundo por vez.

## Poderes, missões e Hard XP

- **4 poderes por classe**, liberados nos níveis 1, 5, 15 e 30: golpes fortes, magias em área, um reforço (mais dano ou defesa por 20 s) ou cura. O AUTO usa reforço primeiro e depois o poder mais forte disponível; cada poder pode ser ligado ou desligado na barra.
- **Prêmio de login:** sequência de 7 dias (zera se faltar um dia).
- **Missões diárias:** 3 por dia por personagem, renovam à meia-noite (fuso `GAME_TZ`, padrão `America/Sao_Paulo`).
- **Conquistas:** nível, monstros, bosses, item lendário, Zen e 7 dias seguidos.
- **Servidor Hard XP:** curva `100 × nível^2,1 + 200` e perda de 3% da EXP do nível ao morrer. `EXP_RATE` multiplica a EXP (padrão 1).

## Sprites em alta resolução

Os personagens, monstros e efeitos são PNG com fundo transparente em `public/assets/sprites/`, descritos em `manifest.json` (tamanho do quadro, pivô nos pés, quadros e FPS de cada ação).

- **Heróis:** as 6 classes em quadros de 96×96, com parado (4), andando (4), atacando (4), levando dano (1) e morrendo (4). Cor do cabelo e tom de pele são trocados no navegador.
- **Monstros:** geleia, goblin, chefe goblin, aranha, esqueleto e Rei Esqueleto, com as mesmas ações.
- **Efeitos:** projéteis (fogo, gelo, energia, flecha, sombra, espírito), impactos, explosões em área, meia-lua de espada e cura.

Os sprites são gerados por código em `tools/sprites/` (Python + Pillow), seguindo a prancha de referência do kit MU. Para mudar algo e gerar de novo:

```bash
pip install pillow numpy
python3 tools/sprites/build.py
```

A vitrine ampliada 3× fica em `tools/sprites/preview/herois_3x.png`.

## Segurança

- Senhas e códigos de recuperação com **scrypt** + sal aleatório (nunca em texto puro).
- Sessão por cookie `HttpOnly`, `SameSite=Lax`, `Secure` em HTTPS; no banco fica só o hash do token.
- Trocar ou redefinir a senha encerra todas as sessões abertas.
- Tokens de redefinição de uso único, com validade de 1 hora, guardados como hash.
- Proteção contra CSRF (mesma origem + cabeçalho obrigatório), limites de tentativas (login, cadastro, recuperação), tempo de resposta igual para conta existente ou não, e a mesma mensagem genérica no "esqueci a senha".
- Cabeçalhos de segurança (CSP, HSTS, X-Frame-Options), validação de todas as entradas no servidor e registro de auditoria (`audit_log`) de cadastro, login, falhas e trocas de senha.

## Rodar no seu computador

Requisitos: Node.js 20+ e PostgreSQL.

```bash
npm install
cp .env.example .env        # edite DATABASE_URL
npm start                   # cria as tabelas sozinho e abre em http://localhost:3000
```

Com `PG_SCHEMA=muidle`, todas as tabelas do jogo ficam no schema `muidle`, então o mesmo banco pode ser dividido com outros projetos sem conflito.

As migrações em `server/migrations/` são aplicadas automaticamente ao iniciar (ou com `npm run migrate`).
Sem serviço de e-mail configurado, o link de "esqueci a senha" aparece no terminal do servidor.

## Publicar na Render

1. Crie um repositório no GitHub e envie esta pasta (`git init`, `git add .`, `git commit`, `git push`).
2. Na Render: **New → Blueprint**, escolha o repositório. O arquivo `render.yaml` cria o servidor web **e** o banco PostgreSQL e já liga o `DATABASE_URL` entre eles.
3. Confirme. Quando o deploy terminar, abra o endereço `https://….onrender.com`.
4. (Opcional) Para o e-mail de recuperação, crie uma conta grátis na [Resend](https://resend.com), verifique seu domínio e preencha `RESEND_API_KEY` e `MAIL_FROM` em **Environment** do serviço.

Sem Blueprint, faça manualmente: crie um **PostgreSQL**, depois um **Web Service** com build `npm install --omit=dev`, start `npm start`, health check `/api/health` e a variável `DATABASE_URL` com a *Internal Database URL* do banco.

### Limites do plano gratuito da Render

- O servidor gratuito "dorme" após 15 minutos sem acessos; a primeira visita depois disso demora alguns segundos.
- O PostgreSQL gratuito **expira 30 dias** após ser criado (há 14 dias para fazer upgrade antes de ser apagado), e só pode haver um banco gratuito por workspace. Para manter as contas, passe o banco para um plano pago antes disso.
- Backups automáticos só existem nos planos pagos do banco. Para um backup manual: `pg_dump "$DATABASE_URL" > backup.sql`.

## Estrutura

```
server/
  index.js        servidor HTTP, rotas da API, sessões, arquivos estáticos
  ws.js           WebSocket (presença ao vivo) sem dependências
  security.js     hash de senha, tokens, limites de tentativas, validação
  mail.js         envio de e-mail (Resend)
  db.js           conexão PostgreSQL e migrações
  gamedata.js     classes, mapas, raridades e itens
  migrations/     SQL do banco
public/
  index.html      página inicial
  css/style.css   visual
  js/pixel.js     toda a arte pixel (personagens, monstros, mapas, ícones) gerada em código
  js/app.js       contas, painel, contador ao vivo, galerias
render.yaml       deploy na Render
```

## API

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/health` | Verifica servidor e banco |
| GET | `/api/stats` | Online, visitantes, contas, heróis |
| GET | `/api/gamedata` | Classes, mapas, raridades, itens |
| GET | `/api/news` | Notícias e eventos |
| GET | `/api/ranking?by=resets\|level\|power\|bosses` | Top 50 |
| GET | `/api/me` | Conta logada e heróis |
| POST | `/api/register` | Criar conta |
| POST | `/api/login` / `/api/logout` | Entrar / sair |
| POST | `/api/forgot` / `/api/reset` | Link por e-mail / nova senha |
| POST | `/api/recover-code` | Nova senha com código de recuperação |
| POST | `/api/change-password` / `/api/recovery-code` | Trocar senha / novo código |
| POST | `/api/characters` | Criar herói |
| DELETE | `/api/characters/:id` | Excluir herói |

Chamadas que alteram dados exigem o cabeçalho `X-Requested-With: mui` e a mesma origem.

## Próximas etapas

Grupos e guildas, PvP na arena, mercado entre jogadores, asas e montarias, mais mapas e habilidades (meta de 15 por classe), resets e missões diárias.
