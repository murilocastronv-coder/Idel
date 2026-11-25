/*
 * MU Online Claude — Português / English.
 * Um só tradutor para o site e para o jogo: troca os textos da tela (inclusive os que aparecem
 * depois, como janelas e mensagens) usando o dicionário abaixo. Nada muda nos dados salvos.
 *  - Idioma: escolhido pelo jogador (botão 🌐) ou pelo idioma do aparelho.
 *  - Para adicionar um texto novo: coloque [ "português", "english" ] na lista.
 */
(function () {
  'use strict';
  var KEY = 'mu-lang';
  function detect() {
    try { var s = localStorage.getItem(KEY); if (s === 'pt' || s === 'en') return s; } catch (e) {}
    var n = (navigator.language || 'pt').toLowerCase();
    return n.indexOf('pt') === 0 ? 'pt' : 'en';
  }
  var lang = detect();

  /* [português, english] — frases inteiras primeiro, depois pedaços e palavras. */
  var D = [
    // ===== Site =====
    ['AETHER REBORN · RPG ONLINE 2D', 'AETHER REBORN · 2D ONLINE RPG'],
    ['Escolha seu herói, coloque as asas nas costas e cace monstros com seus amigos em tempo real, no navegador ou no celular. Sem instalar nada.', 'Pick your hero, put on your wings and hunt monsters with your friends in real time, in the browser or on your phone. Nothing to install.'],
    ['⚔ Jogar agora', '⚔ Play now'], ['📱 Baixar app Android', '📱 Get the Android app'], ['💬 Entrar no Discord', '💬 Join our Discord'], ['💬 Comunidade no Discord', '💬 Discord community'],
    ['Verificando servidor…', 'Checking server…'], ['Servidor online ·', 'Server online ·'], ['Servidor indisponível no momento', 'Server unavailable right now'],
    ['jogando agora', 'playing now'], ['heróis no mundo novo', 'heroes in the new world'], ['⚠ Servidor HARD · EXP baixo', '⚠ HARD server · low EXP'],
    ['monstros e bosses', 'monsters & bosses'], ['Tudo que tem no jogo', 'Everything in the game'],
    ['Multiplayer em tempo real', 'Real-time multiplayer'], ['Cada mapa é uma sala: você vê os outros jogadores andando ao seu lado na hora.', 'Each map is a room: you see other players walking next to you live.'],
    ['AUTO caça', 'AUTO hunt'], ['Liga o AUTO e o herói vai sozinho até o monstro, usa as skills, ataca e toma poção.', 'Turn on AUTO and your hero walks to monsters, uses skills, attacks and drinks potions by itself.'],
    ['Feito para celular', 'Made for phones'], ['Joystick analógico, botão de ataque (segure para repetir), 4 skills, magia e poção na mão.', 'Analog joystick, attack button (hold to repeat), 4 skills, magic and potion at your thumb.'],
    ['Asas nas costas', 'Wings on your back'], ['30 modelos em 6 famílias: a Angelical Nv.1 é grátis e as outras se compram na loja. Ficam presas nas costas e batem abrindo e fechando.', '30 models in 6 families: Angelic Lv.1 is free and the others are sold in the shop. They stay on your back and flap open and closed.'],
    ['Sete caixas, do +1 ao +7, que caem dos monstros e dos bosses. Abra e veja o prêmio.', 'Seven boxes, +1 to +7, dropped by monsters and bosses. Open them to see your prize.'],
    ['Armas, pendente e anéis especiais para as cinco classes.', 'Special weapons, pendant and rings for all five classes.'],
    ['Armas animadas com efeitos de fogo, gelo, raio e sombra para cada classe.', 'Animated weapons with fire, ice, lightning and shadow effects for every class.'],
    ['20 peças em 4 raridades: Raro, Lendário, Excelente e Mítico.', '20 pieces in 4 rarities: Rare, Legendary, Excellent and Mythic.'],
    ['A Montaria Taurina Áurea já pode ser vista em todas as poses.', 'The Golden Bull Mount can already be seen in every pose.'],
    ['Entre com sua conta e continue o mesmo herói em qualquer aparelho. As contas antigas funcionam.', 'Log in and keep playing the same hero on any device.'],
    ['Ferreiro e loja', 'Blacksmith & shop'], ['Aprimore a arma e a armadura, compre poções e venda os fragmentos que caírem.', 'Upgrade weapon and armor, buy potions and sell the fragments you loot.'],
    ['Subir de nível é difícil para todos, VIP ou não. Cada nível conquistado vale mais.', 'Leveling up is hard for everyone, VIP or not. Every level you earn means more.'],
    ['Cinco heróis, cada um com quatro poderes exclusivos.', 'Five heroes, each with four unique powers.'],
    ['Viagem livre por 20 destinos, das cidades às masmorras.', 'Free travel to 20 destinations, from towns to dungeons.'],
    ['Os bosses voltam depois de alguns minutos e sempre deixam um prêmio.', 'Bosses come back after a few minutes and always drop a prize.'],
    ['Coleção de asas', 'Wing collection'], ['Seis famílias, cinco níveis cada. Todo herói pode usar a', 'Six families, five levels each. Every hero can use the'],
    ['de graça; as outras 29 são compradas na Loja do jogo com ouro ou com dinheiro real (cartão, pela sua conta).', 'for free; the other 29 are bought in the in-game Shop with gold or real money (card, through your account).'],
    ['O EXP é baixo para todos. O VIP ajuda um pouco, mas também é difícil.', 'EXP is low for everyone. VIP helps a little, but it is still hard.'],
    ['EXP por monstro', 'EXP per monster'], ['EXP para subir', 'EXP to level up'], ['Monstros (Normal)*', 'Monsters (Normal)*'], ['Monstros (VIP Diamante)*', 'Monsters (Diamond VIP)*'],
    ['* Conta aproximada, caçando monstros do próprio nível. A barra de EXP cresce a cada nível: 100 × nível × (1 + 0,12 × nível).', '* Rough estimate, hunting monsters of your own level. The EXP bar grows every level: 100 × level × (1 + 0.12 × level).'],
    ['Compre com dinheiro real dentro do jogo (botão 💎 Premium). Tudo fica guardado na sua conta.', 'Buy with real money inside the game (💎 Premium button). Everything stays on your account.'],
    ['Os 20 heróis de maior nível do servidor.', 'The 20 highest-level heroes on the server.'], ['Carregando…', 'Loading…'], ['Ninguém no ranking ainda. Seja o primeiro!', 'Nobody on the ranking yet. Be the first!'], ['Ranking indisponível no momento.', 'Ranking unavailable right now.'],
    ['⌨️ Computador', '⌨️ Computer'], ['📱 Celular', '📱 Phone'],
    ['(esquerda): mover. Empurre até a borda para correr.', '(left): move. Push to the edge to run.'],
    [': ataque normal. Segure para repetir.', ': normal attack. Hold to repeat.'], [': skills da classe.', ': class skills.'], [': acima das skills.', ': above the skills.'],
    ['Menu do topo: Loja, Mapas, Mochila, Herói, Asas, Armas, Sets, Glacial, Kundun, Refúgio e Conta.', 'Top menu: Shop, Maps, Bag, Hero, Wings, Weapons, Sets, Glacial, Kundun, Refuge and Account.'],
    [': correr · clique no chão para andar.', ': run · tap the ground to walk.'], [': falar com o Mestre.', ': talk to the Master.'],
    [': golpe ·', ': strike ·'], [': magia ·', ': magic ·'], [': skills.', ': skills.'], [': poção ·', ': potion ·'], [': voltar ao refúgio ·', ': back to refuge ·'], [': mochila ·', ': bag ·'], [': herói ·', ': hero ·'], [': loja.', ': shop.'], [': mover ·', ': move ·'],
    ['O mundo está esperando', 'The world is waiting'], ['Crie sua conta dentro do jogo, no botão', 'Create your account inside the game, with the'], [', e comece agora.', ' button, and start now.'],
    ['⚔ Entrar no mundo', '⚔ Enter the world'], ['MU Online Claude · Aether Reborn — jogo de fã, sem ligação com a Webzen.', 'MU Online Claude · Aether Reborn — fan game, not affiliated with Webzen.'],
    ['App Android', 'Android app'], ['Abrir menu', 'Open menu'], ['Números do jogo', 'Game numbers'],
    ['Loja Premium', 'Premium Shop'], ['ou R$', 'or R$'], ['Ver asas', 'See wings'],
    ['29 asas pagas: com ouro do jogo ou de R$ 4,90 a R$ 49,90. A Angelical Nv.1 é grátis.', '29 paid wings: with in-game gold or R$ 4.90 to R$ 49.90. Angelic Lv.1 is free.'],
    ['Jogador', 'Player'], ['Classe', 'Class'], ['Classes', 'Classes'], ['Mapas', 'Maps'], ['Monstros', 'Monsters'], ['Controles', 'Controls'], ['Modo Hard', 'Hard Mode'], ['Modo HARD', 'HARD Mode'], ['Jogar', 'Play'],
    ['tipos de monstro', 'monster types'], ['à distância', 'ranged'], [' vida', ' HP'],

    // ===== Jogo: telas e janelas =====
    ['PERSONAGENS', 'CHARACTERS'], ['Personagem selecionado', 'Selected character'], ['Criar personagem →', 'Create character →'], ['Criar personagem', 'Create character'],
    ['escolha a classe e o nome do novo personagem.', 'choose the class and name of the new character.'], ['vazio', 'empty'], ['Vazio', 'Empty'], ['Espaço', 'Slot'],
    ['🗑 Excluir personagem', '🗑 Delete character'], ['Toque de novo para EXCLUIR para sempre', 'Tap again to DELETE forever'],
    ['⚔ Jogar com', '⚔ Play as'], ['👤 Entrar / criar conta', '👤 Log in / sign up'],
    ['Até 5 personagens por conta.', 'Up to 5 characters per account.'], ['Até 5 personagens por conta', 'Up to 5 characters per account'], ['Todos salvos na nuvem.', 'All saved in the cloud.'],
    ['Salvos neste aparelho — entre na conta para guardar na nuvem.', 'Saved on this device — log in to keep them in the cloud.'],
    ['WASD mover · J atacar · L magia · 1–4 poderes · Q poção', 'WASD move · J attack · L magic · 1–4 powers · Q potion'],
    ['Nome do herói', 'Hero name'],
    ['CONTA · SALVAMENTO NA NUVEM', 'ACCOUNT · CLOUD SAVE'], ['Conectado como', 'Logged in as'],
    ['Entre com a mesma conta do jogo antigo (usuário ou e-mail) ou crie uma nova. Sem conta, o progresso fica salvo só neste aparelho.', 'Log in with your account (username or e-mail) or create a new one. Without an account, progress is saved only on this device.'],
    ['Usuário ou e-mail', 'Username or e-mail'], ['Usuário (2-20, qualquer letra)', 'Username (2-20, any letters)'], ['Senha (8+, letras e números)', 'Password (8+, letters and numbers)'], ['Senha', 'Password'],
    ['Criar conta', 'Sign up'], ['Entrar', 'Log in'], ['☁ Salvar agora', '☁ Save now'], ['Sair da conta', 'Log out'], ['Conectando…', 'Connecting…'], ['Bem-vindo de volta!', 'Welcome back!'], ['Conta criada!', 'Account created!'],
    ['Você saiu da conta. O progresso continua salvo neste aparelho.', 'You logged out. Progress is still saved on this device.'], ['Salvo na nuvem', 'Saved in the cloud'],
    ['Usuário ou senha incorretos.', 'Wrong username or password.'], ['Este nome de usuário já existe.', 'This username already exists.'], ['Este e-mail já está em uso.', 'This e-mail is already in use.'], ['Informe um e-mail válido.', 'Enter a valid e-mail.'],
    ['A senha precisa ter pelo menos 8 caracteres.', 'Password must have at least 8 characters.'], ['Use letras e números na senha.', 'Use letters and numbers in the password.'],
    ['Usuário: 2 a 20 caracteres (letras, números, espaço, _ . -).', 'Username: 2 to 20 characters (letters, numbers, space, _ . -).'], ['Sem conexão com o servidor.', 'No connection to the server.'],
    ['seu herói', 'your hero'], ['é salvo automaticamente na nuvem e pode ser continuado em qualquer aparelho.', 'is saved automatically in the cloud and can be continued on any device.'],
    ['Fechar ×', 'Close ×'], ['Fechar', 'Close'], ['Voltar', 'Back'], ['Confirmar', 'Confirm'],
    ['O combate fica pausado enquanto este painel estiver aberto.', 'Combat is paused while this panel is open.'],
    ['Inventário', 'Inventory'], ['Personagem', 'Character'], ['Mestre das Asas', 'Wing Master'], ['MESTRE DAS ASAS', 'WING MASTER'], ['Conjuntos equipáveis', 'Equipable sets'],
    ['Boxes de Kundun', 'Kundun Boxes'], ['Box de Kundun', 'Kundun Box'], ['Dragão Glacial Completo', 'Complete Glacial Dragon'], ['Dragão Glacial', 'Glacial Dragon'], ['Arsenal Elemental', 'Elemental Arsenal'],
    ['Trocar classe', 'Change class'], ['Alterar nick', 'Change nickname'], ['Redistribuir pontos', 'Reset stat points'], ['Trocar personagem', 'Switch character'], ['Personagens', 'Characters'],
    ['VIAGEM LIVRE · 20 DESTINOS', 'FREE TRAVEL · 20 DESTINATIONS'], ['Escolha seu destino. Blood Castle e Devil Square: visita livre, sem regras de evento.', 'Choose your destination. Blood Castle and Devil Square: free visit, no event rules.'],
    ['Você está aqui', 'You are here'], ['Viajando…', 'Traveling…'], ['Não foi possível viajar. Tente novamente.', 'Could not travel. Try again.'],
    ['A FENDA COBROU SEU PREÇO', 'THE RIFT TOOK ITS TOLL'], ['Você caiu em batalha', 'You fell in battle'],
    ['Você perdeu 5% do ouro. Seu nível e seus equipamentos foram preservados.', 'You lost 5% of your gold. Your level and gear were kept.'], ['Renascer no refúgio', 'Respawn at the refuge'],
    ['Ferreiro do refúgio', 'Refuge blacksmith'], ['Loja do refúgio · você tem', 'Refuge shop · you have'], ['Ferreiro, poções e asas.', 'Blacksmith, potions and wings.'],
    ['💎 Loja Premium · VIP, melhores sets e asas com dinheiro real', '💎 Premium Shop · VIP, best sets and wings with real money'],
    ['Recupere a vida durante a caçada.', 'Restore HP while hunting.'], ['Sucesso garantido.', 'Guaranteed success.'], ['dano recebido.', 'damage taken.'],
    ['Loja de asas · você tem', 'Wing shop · you have'],
    ['A <b>Angelical Nv.1</b> é grátis', 'Angelic Lv.1 is free'], ['é grátis; as outras 29 se compram com ouro do jogo ou com dinheiro real (💳, precisa estar na conta). Cosméticas, para as cinco classes.', 'is free; the other 29 can be bought with in-game gold or real money (💳, account required). Cosmetic, for all five classes.'],
    ['Compre esta asa na loja primeiro.', 'Buy this wing in the shop first.'], ['Você já tem esta asa.', 'You already own this wing.'], ['Asa comprada', 'Wing bought'], ['Comprada', 'Bought'], ['Comprado ✓', 'Bought ✓'],
    ['Pagamento com dinheiro real em breve.', 'Real-money payment coming soon.'], ['Abrindo pagamento…', 'Opening payment…'], ['Não foi possível abrir o pagamento.', 'Could not open the payment.'],
    ['Para comprar com dinheiro real, entre ou crie sua conta (a compra fica guardada nela).', 'To buy with real money, log in or create an account (the purchase is kept on it).'],
    ['Para comprar com dinheiro real, entre ou crie sua conta (a asa fica guardada nela).', 'To buy with real money, log in or create an account (the wing is kept on it).'],
    ['Pagamento recebido! Entregando sua compra…', 'Payment received! Delivering your purchase…'], ['Pagamento cancelado.', 'Payment canceled.'], ['Compra entregue! Veja em Sets / Glacial.', 'Purchase delivered! Check Sets / Glacial.'], ['Asa comprada entregue!', 'Purchased wing delivered!'],
    ['Compras com dinheiro real (cartão, pelo Stripe). Tudo fica na sua conta para sempre — o VIP vale pelos dias comprados e soma se você comprar de novo.', 'Real-money purchases (card, via Stripe). Everything stays on your account forever — VIP lasts the days you buy and stacks if you buy again.'],
    ['Entre na sua conta para comprar: a compra fica guardada nela, em qualquer aparelho.', 'Log in to buy: the purchase is kept on your account, on any device.'],
    ['Você ainda não é VIP.', 'You are not VIP yet.'], ['Seu VIP', 'Your VIP'], ['No servidor HARD o EXP continua baixo para todos; o VIP ajuda um pouco.', 'On the HARD server EXP stays low for everyone; VIP helps a little.'],
    ['Os 7 conjuntos mais fortes + Dragão Glacial', 'The 7 strongest sets + Glacial Dragon'], ['Serviços do personagem', 'Character services'],
    ['A 1ª vez de cada personagem é grátis (na janela Herói). Cada compra vale 1 uso.', 'The 1st time for each character is free (in the Hero window). Each purchase = 1 use.'],
    ['As 29 asas pagas também saem por dinheiro real.', 'The 29 paid wings can also be bought with real money.'], ['Ver asas e preços', 'See wings and prices'],
    ['Selo ★ VIP Ouro no nome', '★ Gold VIP badge on your name'], ['Selo ★ VIP Diamante no nome', '★ Diamond VIP badge on your name'], ['Ouro dos monstros', 'Gold from monsters'],
    ['Melhores conjuntos', 'Best sets'], ['dias', 'days'], ['Você tem', 'You have'], ['uso(s)', 'use(s)'], ['1ª vez GRÁTIS', '1st time FREE'], ['cada (Loja Premium)', 'each (Premium Shop)'], ['você tem', 'you have'], ['comprado(s)', 'bought'],
    ['Escolha a nova classe de', 'Choose the new class for'], ['Nível, EXP, ouro, itens e pontos continuam. Depois você pode redistribuir os pontos.', 'Level, EXP, gold, items and points are kept. Afterwards you can reset your stat points.'],
    ['Novo nick (até 18 letras).', 'New nickname (up to 18 letters).'], ['Hoje:', 'Now:'], ['Nível, itens e pontos continuam', 'Level, items and points are kept'],
    ['Devolve os', 'Returns the'], ['pontos de Força/Vitalidade', 'Strength/Vitality points'], ['Nick atual:', 'Current nickname:'],
    ['Pontos devolvidos! Distribua de novo.', 'Points returned! Distribute them again.'], ['pontos livres para distribuir.', 'free points to distribute.'], ['Nenhum ponto para redistribuir.', 'No points to reset.'],
    ['Nick muito curto.', 'Nickname too short.'], ['Este já é o seu nick.', 'This is already your nickname.'], ['Agora você é', 'You are now'],
    ['Sem créditos. Compre na Loja Premium.', 'No credits. Buy in the Premium Shop.'], ['Compre o serviço na Loja Premium (R$ 6,00).', 'Buy the service in the Premium Shop (R$ 6.00).'],
    ['Entre na conta para comprar este serviço (R$ 6,00).', 'Log in to buy this service (R$ 6.00).'],
    ['Classe trocada para', 'Class changed to'], ['Quer redistribuir os pontos? Veja em Herói.', 'Want to reset your points? See Hero.'],
    ['Força', 'Strength'], ['Vitalidade', 'Vitality'], ['dano por ponto', 'damage per point'], ['vida por ponto', 'HP per point'], ['Adicionar +1', 'Add +1'], ['pontos disponíveis', 'points available'],
    ['Vida máxima', 'Max HP'], ['Dano', 'Damage'], ['Defesa', 'Defense'], ['dano efetivo', 'effective damage'],
    ['Equipamentos ativos abaixo', 'Active equipment below'], ['Raro · Lendário · Excelente · Mítico', 'Rare · Legendary · Excellent · Mythic'], ['Abrir arsenal', 'Open arsenal'],
    ['Mãos vazias · sem arma', 'Bare hands · no weapon'], ['Obter arma', 'Get a weapon'], ['Aprimorar', 'Upgrade'], ['Reduz', 'Reduces'], ['Recuperam 85 vida', 'Restore 85 HP'], ['Voltar · Q para usar', 'Back · Q to use'],
    ['Fragmentos', 'Fragments'], ['12 ouro por fragmento', '12 gold per fragment'], ['Vender todos', 'Sell all'],
    ['Angelical Nv.1 grátis · as outras na loja', 'Angelic Lv.1 free · the others in the shop'], ['Loja de asas', 'Wing shop'], ['Abrir coleção glacial', 'Open glacial collection'], ['Abrir caixas de Kundun', 'Open Kundun boxes'],
    ['Sete visuais · abrir, comprar e resgatar presente', 'Seven looks · open, buy and claim gift'], ['5 classes · 5 armas · pendente e 2 anéis', '5 classes · 5 weapons · pendant and 2 rings'],
    ['⚔ Abrir coleção de armas animadas', '⚔ Open animated weapon collection'], ['Arma equipada', 'Equipped weapon'], ['Ver arsenal', 'See arsenal'],
    ['Arsenal · 18 conjuntos', 'Arsenal · 18 sets'], ['🛒 Loja (ouro)', '🛒 Shop (gold)'], ['⚔ Conjuntos de queda · caem dos monstros', '⚔ Drop sets · dropped by monsters'], ['💎 Conjuntos Premium · os mais fortes', '💎 Premium sets · the strongest'],
    ['Todos os heróis · requisitos de nível · a armadura aparece no herói na cor do conjunto', 'All heroes · level requirements · the armor shows on your hero in the set color'],
    ['O Guardião de Aço é grátis; 3 se compram com ouro;', 'The Steel Guardian is free; 3 are bought with gold;'], ['7 caem de monstros e bosses', '7 drop from monsters and bosses'], ['7 Premium (os mais fortes) só na 💎 Loja Premium', '7 Premium (the strongest) only in the 💎 Premium Shop'],
    ['Cai dos monstros', 'Drops from monsters'], ['Na mochila', 'In the bag'], ['Equipado', 'Equipped'], ['Equipada', 'Equipped'], ['Desequipar', 'Unequip'], ['Equipar', 'Equip'], ['Resgatar', 'Claim'], ['Comprar', 'Buy'], ['ATIVO', 'ACTIVE'],
    ['5 peças:', '5 pieces:'], ['5 peças', '5 pieces'], ['requer nível', 'requires level'], ['completo:', 'complete:'], ['O MAIS FORTE:', 'THE STRONGEST:'], ['defesa', 'defense'],
    ['Elmo', 'Helm'], ['Armadura', 'Armor'], ['Calça', 'Pants'], ['Luvas', 'Gloves'], ['Botas', 'Boots'], ['Arma', 'Weapon'], ['Pendente', 'Pendant'], ['Anel', 'Ring'],
    ['Comum', 'Common'], ['Incomum', 'Uncommon'], ['Raro', 'Rare'], ['Lendário', 'Legendary'], ['Excelente', 'Excellent'], ['Mítico', 'Mythic'], ['Especial', 'Special'],
    ['Todas', 'All'], ['Angelical', 'Angelic'], ['Demoníaca', 'Demonic'], ['Dragônica', 'Draconic'], ['Cristalina', 'Crystal'], ['Sombria', 'Shadow'], ['Grátis', 'Free'], ['GRÁTIS', 'FREE'],

    // ===== Jogo: HUD e mensagens =====
    ['🛡 Zona segura', '🛡 Safe zone'], ['⚔ Área de combate', '⚔ Combat area'], ['Mochila', 'Bag'], ['Herói', 'Hero'], ['Loja', 'Shop'], ['Asas', 'Wings'], ['Armas', 'Weapons'], ['Refúgio', 'Refuge'], ['REFÚGIO', 'REFUGE'], ['Conta', 'Account'],
    ['Mestre', 'Master'], ['Soco forte', 'Strong punch'], ['Magia', 'Magic'], ['ATACAR', 'ATTACK'], ['SOCO', 'PUNCH'], ['Ataque normal (segure para repetir)', 'Normal attack (hold to repeat)'],
    ['Joystick: mover personagem', 'Joystick: move character'], ['⚙ Painel ADM', '⚙ Admin panel'],
    ['VIDA', 'HP'], ['MANA', 'MANA'], ['OURO', 'GOLD'], ['Golpe', 'Strike'], ['Poção', 'Potion'],
    ['WASD · mover / Shift · correr', 'WASD · move / Shift · run'], ['J · golpe / L · magia', 'J · strike / L · magic'], ['J · socos / L · soco forte', 'J · punches / L · strong punch'],
    ['1–4 · poderes exclusivos / E · mestre próximo / poder 2', '1–4 · unique powers / E · nearby master / power 2'], ['R · retornar ao refúgio', 'R · return to refuge'],
    ['Bem-vindo! Clique no chão para andar ou abra Mapas para viajar.', 'Welcome! Tap the ground to walk or open Maps to travel.'],
    ['Você entrou em uma zona segura.', 'You entered a safe zone.'], ['Você saiu da zona segura.', 'You left the safe zone.'], ['Combate desativado na zona segura.', 'Combat is disabled in the safe zone.'], ['Zona segura: saia da cidade para lutar.', 'Safe zone: leave town to fight.'],
    ['Auto caça ligada', 'Auto hunt on'], ['Auto caça desligada', 'Auto hunt off'], ['AUTO: atacando monstros próximos automaticamente.', 'AUTO: attacking nearby monsters automatically.'], ['AUTO desligado.', 'AUTO off.'], ['AUTO ON', 'AUTO ON'],
    ['⚔ PvP LIGADO', '⚔ PvP ON'], ['PvP desligado', 'PvP off'], ['PvP ligado: fora da cidade você pode atacar e ser atacado por quem também está com PvP.', 'PvP on: outside town you can attack and be attacked by anyone who also has PvP on.'], ['PvP desligado: ninguém pode te atacar.', 'PvP off: nobody can attack you.'],
    ['derrotou', 'defeated'], ['no PvP', 'in PvP'], ['Você derrotou', 'You defeated'], ['Você foi derrotado por', 'You were defeated by'],
    ['Mana insuficiente. Ela se regenera com o tempo.', 'Not enough mana. It regenerates over time.'], ['aguarde a recarga.', 'wait for cooldown.'], ['precisa de', 'needs'], ['mana.', 'mana.'],
    ['Poção utilizada · +85 vida', 'Potion used · +85 HP'], ['Afaste-se dos monstros para retornar ao refúgio.', 'Move away from monsters to return to the refuge.'], ['Refúgio: vida e mana recuperadas.', 'Refuge: HP and mana restored.'],
    ['Contrato concluído', 'Contract completed'], ['Compradas 3 poções.', 'Bought 3 potions.'], ['Você precisa de', 'You need'], ['Fragmentos vendidos por 12 ouro cada.', 'Fragments sold for 12 gold each.'], ['aprimorada para', 'upgraded to'],
    ['Fera derrotada', 'Beast defeated'], ['Guardião derrotado', 'Guardian defeated'], ['fragmento', 'fragment'], ['Encontrou', 'Found'], ['Caiu', 'Dropped'], ['Chegou em', 'Arrived at'],
    ['pontos de atributos', 'stat points'], ['NÍVEL', 'LEVEL'], ['Nível', 'Level'], ['nível', 'level'],
    ['Aproxime-se do Mestre das Asas no refúgio.', 'Get close to the Wing Master at the refuge.'], ['E · Conversar com Mestre das Asas', 'E · Talk to the Wing Master'],
    ['Faltam', 'Missing'], ['Asa', 'Wing'],
    ['Montaria · Áurea', 'Mount · Golden'], ['Montaria Taurina Áurea', 'Golden Bull Mount'], ['Prévia sem cavaleiro. Poses sentadas dos heróis: próxima etapa.', 'Preview without rider. Hero riding poses: next step.'],
    ['Movimento', 'Motion'], ['Direção', 'Direction'], ['Clique em Montaria para fechar.', 'Tap Mount to close.'], ['Respirar', 'Breathe'], ['Caminhar', 'Walk'], ['Correr', 'Run'], ['Saltar', 'Jump'], ['Atacar', 'Attack'], ['Receber golpe', 'Get hit'],
    ['Continuar', 'Continue'], ['Abrindo…', 'Opening…'], ['Caixa aberta', 'Box opened'], ['Caixa abrindo', 'Box opening'], ['Preparando abertura…', 'Preparing to open…'], ['Recebeu uma Box de Kundun de cada nível!', 'You got one Kundun Box of each level!'],
    ['Resgate a coleção', 'Claim the collection'], ['Resgatar as 16 armas (grátis)', 'Claim the 16 weapons (free)'], ['Resgatar coleção da minha classe (grátis)', 'Claim my class collection (free)'],
    ['ouro extra (conjunto já completo)', 'extra gold (set already complete)'], ['Outra classe', 'Other class'], ['requisito Nv', 'requirement Lv'],
    ['Compre com ouro ou encontre em monstros (elites sempre deixam uma caixa). Níveis maiores de herói liberam drops maiores. Cada abertura consome 1 caixa e concede ouro, poções e 1 peça ainda não possuída do conjunto indicado. Conjunto completo: ouro extra. Requisitos para equipar continuam valendo.', 'Buy with gold or find on monsters (elites always drop a box). Higher hero levels unlock bigger drops. Each opening uses 1 box and gives gold, potions and 1 piece of the set you don\'t own yet. Complete set: extra gold. Equip requirements still apply.'],
    ['33 itens originais: 5 peças + arma para cada classe, 1 pendente e 2 anéis universais. Sem novas aparências ou animações do herói.', '33 original items: 5 pieces + weapon for each class, 1 pendant and 2 universal rings.'],
    ['5 armaduras: +20 defesa, +15 dano e +100 vida', '5 armor pieces: +20 defense, +15 damage and +100 HP'], ['9 itens: +15 dano extra', '9 items: +15 extra damage'],
    ['Viajante', 'Traveler'], ['ouro', 'gold'], ['vida', 'HP'], ['dano', 'damage'], ['poções', 'potions'], ['Poções', 'Potions'],

    // ===== Classes, descrições e skills =====
    ['Cavaleiro', 'Knight'], ['Feiticeiro', 'Sorcerer'], ['Arqueiro', 'Archer'], ['Gladiador', 'Gladiator'], ['Lorde Sombrio', 'Dark Lord'],
    ['Armadura carmesim · resistência e combate próximo', 'Crimson armor · toughness and close combat'], ['Mago arcano · vestes azuis e poder mágico', 'Arcane mage · blue robes and magic power'],
    ['Elfa esmeralda · arco e armadura verde', 'Emerald elf · bow and green armor'], ['Guerreiro violeta · espada e armadura pesada', 'Violet warrior · sword and heavy armor'], ['Armadura negra e dourada · presença imponente', 'Black and gold armor · imposing presence'],
    ['Corte Carmesim', 'Crimson Slash'], ['Turbilhão de Aço', 'Steel Whirlwind'], ['Ruptura da Terra', 'Earth Rupture'], ['Espadas do Julgamento', 'Swords of Judgment'],
    ['Orbe Arcano', 'Arcane Orb'], ['Nova Glacial', 'Glacial Nova'], ['Corrente de Raios', 'Chain Lightning'], ['Chuva de Meteoros', 'Meteor Shower'],
    ['Disparo Esmeralda', 'Emerald Shot'], ['Leque de Flechas', 'Arrow Fan'], ['Raízes Selvagens', 'Wild Roots'], ['Fênix da Floresta', 'Forest Phoenix'],
    ['Lâmina Violeta', 'Violet Blade'], ['Cruz do Caos', 'Chaos Cross'], ['Lanças Cristalinas', 'Crystal Spears'], ['Vórtice Dimensional', 'Dimensional Vortex'],
    ['Garra das Sombras', 'Shadow Claw'], ['Corvos da Ruína', 'Ravens of Ruin'], ['Correntes Malditas', 'Cursed Chains'], ['Eclipse do Abismo', 'Abyss Eclipse'],

    // ===== Conjuntos, armas e itens =====
    ['Conjunto Arauto Astral', 'Astral Herald Set'], ['Conjunto Sentinela Esmeralda', 'Emerald Sentinel Set'], ['Conjunto Dragão Carmesim', 'Crimson Dragon Set'], ['Conjunto Fênix Dourada', 'Golden Phoenix Set'],
    ['Conjunto Titã do Gelo Eterno', 'Eternal Frost Titan Set'], ['Conjunto Guardião Celestial', 'Celestial Guardian Set'], ['Conjunto Senhor do Abismo', 'Abyss Lord Set'], ['Conjunto Imperador do Trovão', 'Thunder Emperor Set'], ['Conjunto Lenda de Kundun', 'Kundun Legend Set'],
    ['Guardião de Aço', 'Steel Guardian'], ['Soberano Solar', 'Solar Sovereign'], ['Sentinela Esmeralda', 'Emerald Sentinel'], ['Arauto Astral', 'Astral Herald'],
    ['Couro Selvagem', 'Wild Leather'], ['Bronze Antigo', 'Ancient Bronze'], ['Escamas de Hound', 'Hound Scales'], ['Ossos do Lich', 'Lich Bones'], ['Pele de Yeti', 'Yeti Fur'], ['Brasas de Agon', 'Agon Embers'], ['Sombra do Assassino', 'Assassin Shadow'],
    ['Dragão Carmesim', 'Crimson Dragon'], ['Fênix Dourada', 'Golden Phoenix'], ['Titã do Gelo Eterno', 'Eternal Frost Titan'], ['Guardião Celestial', 'Celestial Guardian'], ['Senhor do Abismo', 'Abyss Lord'], ['Imperador do Trovão', 'Thunder Emperor'], ['Lenda de Kundun', 'Kundun Legend'],
    ['As 33 peças: 5 peças + arma de todas as classes, pendente e 2 anéis', 'All 33 pieces: 5 pieces + weapon for every class, pendant and 2 rings'],
    ['5 peças Míticas (elmo, armadura, calça, luvas e botas)', '5 Mythic pieces (helm, armor, pants, gloves and boots)'], ['5 peças Excelentes', '5 Excellent pieces'],
    ['Anel da Escama Glacial', 'Glacial Scale Ring'], ['Anel do Gelo Eterno', 'Eternal Ice Ring'], ['Pendente do Dragão', 'Dragon Pendant'],
    ['Lâmina Glacial', 'Glacial Blade'], ['Cajado Coração de Inverno', 'Winterheart Staff'], ['Arco Aurora Boreal', 'Aurora Bow'], ['Rúnica Gêmea', 'Twin Runeblade'], ['Cetro Trono Congelado', 'Frozen Throne Scepter'],
    ['Arco de Madeira', 'Wooden Bow'], ['Arco Élfico Verde', 'Green Elven Bow'], ['Arco da Natureza', 'Nature Bow'], ['Arco de Batalha Rubro', 'Ruby Battle Bow'], ['Arco Tigre de Bronze', 'Bronze Tiger Bow'], ['Arco Prata e Ouro', 'Silver & Gold Bow'],
    ['Arco Madeira Dourada', 'Golden Wood Bow'], ['Arco Astral Violeta', 'Violet Astral Bow'], ['Arco dos Ventos', 'Wind Bow'], ['Espada Serrilhada de Fogo', 'Serrated Fire Sword'], ['Espada de Cristal de Gelo', 'Ice Crystal Sword'],
    ['Montante Solar', 'Solar Greatsword'], ['Machado Dourado', 'Golden Axe'], ['Lança Dourada', 'Golden Spear'], ['Cajado Orbe Ciano', 'Cyan Orb Staff'], ['Cetro Cristal Violeta', 'Violet Crystal Scepter'],
    ['Reflexo suave', 'Soft gleam'], ['Faíscas douradas', 'Golden sparks'], ['Folhas e energia verde', 'Leaves and green energy'], ['Brasas rubras', 'Ruby embers'], ['Faíscas de bronze', 'Bronze sparks'], ['Cintilação prateada e dourada', 'Silver and gold shimmer'],
    ['Energia da natureza', 'Nature energy'], ['Estrelas violetas', 'Violet stars'], ['Espirais de vento', 'Wind spirals'], ['Chamas', 'Flames'], ['Cristais de gelo', 'Ice crystals'], ['Raios solares', 'Sun rays'], ['Energia dourada', 'Golden energy'], ['Orbe ciano pulsante', 'Pulsing cyan orb'], ['Cristal violeta pulsante', 'Pulsing violet crystal'],
    ['Conjunto', 'Set'], ['Asa comprada', 'Wing bought'],

    // ===== Mapas e monstros =====
    ['Praça de pedra e campos', 'Stone square and fields'], ['Clareiras das elfas', 'Elven glades'], ['Cidade de neve', 'Snow town'], ['Cripta · andar', 'Crypt · floor'], ['Torre · andar', 'Tower · floor'],
    ['Leito submarino', 'Seabed'], ['Deserto e ruínas', 'Desert and ruins'], ['Terras devastadas', 'Wastelands'], ['Plataformas celestes', 'Sky platforms'], ['Ponte da fortaleza · visita livre', 'Fortress bridge · free visit'], ['Praça demoníaca · visita livre', 'Demonic square · free visit'], ['Treinamento', 'Training'],
    ['Rei Esqueleto', 'Skeleton King'], ['Senhor Minotauro', 'Minotaur Lord'], ['Titã de Gelo', 'Ice Titan'], ['Guerreiro Esqueleto', 'Skeleton Warrior'], ['Goblin Saqueador', 'Goblin Raider'], ['Demônio das Brasas', 'Ember Demon'],
    ['Nv', 'Lv'],

    // ===== Complementos =====
    ['Resgate único por item; a coleção fica salva. Também disponíveis por ouro. Trocar de classe desativa peças incompatíveis. Cada peça ocupa seu próprio espaço, substituindo armaduras antigas somente ao equipar.', 'One free claim per item; the collection stays saved. Also available for gold. Changing class disables incompatible pieces. Each piece uses its own slot and only replaces old armor when equipped.'],
    ['9 arcos e 7 armas especiais. Resgate gratuito, sem duplicar itens. Uma arma por vez; os efeitos são apresentados aqui e no painel da arma equipada, sem trocar as animações corporais.', '9 bows and 7 special weapons. Free claim, no duplicates. One weapon at a time; effects are shown here and on the equipped weapon panel, without changing body animations.'],
    ['Resgatar presente: 1 caixa de cada nível', 'Claim gift: 1 box of each level'], ['Quantidade', 'Quantity'], ['Abrir', 'Open'],
    ['Safira Glacial', 'Glacial Sapphire'], ['Rubi Infernal', 'Infernal Ruby'], ['Sol Dourado', 'Golden Sun'], ['Runas Sombrias', 'Shadow Runes'], ['Astral Celestial', 'Celestial Astral'], ['Esmeralda', 'Emerald'], ['Aço', 'Steel'],
    ['Asas equipáveis', 'Equipable wings'], ['Equipadas · cosméticas, sem voo', 'Equipped · cosmetic, no flight'], ['Cosméticas · todas as cinco classes', 'Cosmetic · all five classes'], ['Retirar asas', 'Remove wings'], ['Equipar asas', 'Equip wings'],
    ['Conjuntos equipáveis · 20 peças', 'Equipable sets · 20 pieces'], ['peças', 'pieces'], ['asas', 'wings'], ['Montaria Áurea', 'Golden Mount'],
    ['Todos os heróis · requisitos de nível · a armadura aparece no herói na cor do conjunto do herói.', 'All heroes · level requirements · the armor shows on your hero in the set color.'],
    ['Segura', 'Safe'], ['Combate', 'Combat'], ['Vida', 'HP'], ['presente', 'gift'], ['caixa', 'box'], ['cada', 'each'],

    // ===== Planos =====
    ['VIP Diamante', 'Diamond VIP'], ['VIP Ouro', 'Gold VIP'], ['HARD · VIP', 'HARD · VIP'], ['Normal', 'Normal'],
    ['Redistribuir', 'Reset'], ['Alterar', 'Change'],
  ];

  /* Dicionário rápido + uma expressão com todas as chaves (as maiores primeiro), sem cortar palavras. */
  var MAP = Object.create(null);
  D.forEach(function (p) { if (!(p[0] in MAP)) MAP[p[0]] = p[1]; });
  var keys = Object.keys(MAP).sort(function (a, b) { return b.length - a.length; });
  var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var RE = new RegExp('(?<![\\p{L}\\p{N}])(?:' + keys.map(esc).join('|') + ')(?![\\p{L}\\p{N}])', 'gu');

  function t(text) {
    if (lang === 'pt' || !text || typeof text !== 'string') return text;
    var trimmed = text.trim();
    if (MAP[trimmed] !== undefined) return text.replace(trimmed, MAP[trimmed]);
    return text.replace(RE, function (m) { return MAP[m]; })
      .replace(/(\d),(\d{2})(?!\d)/g, '$1.$2'); // R$ 9,90 → R$ 9.90 / ×0,30 → ×0.30
  }

  /* Traduz a página e tudo que aparecer depois (janelas, mensagens). */
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1 };
  function translateNode(root) {
    if (lang === 'pt' || !root) return;
    if (root.nodeType === 3) { var v = t(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; return; }
    if (root.nodeType !== 1 || SKIP[root.nodeName] || (root.closest && root.closest('[data-no-i18n]'))) return;
    for (var i = 0; i < ATTRS.length; i++) { var a = root.getAttribute && root.getAttribute(ATTRS[i]); if (a) { var b = t(a); if (b !== a) root.setAttribute(ATTRS[i], b); } }
    if (root.nodeName === 'INPUT' && (root.type === 'button' || root.type === 'submit') && root.value) root.value = t(root.value);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null), n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { if (n.parentNode && SKIP[n.parentNode.nodeName]) continue; var x = t(n.nodeValue); if (x !== n.nodeValue) n.nodeValue = x; }
      else if (n.nodeType === 1) { if (SKIP[n.nodeName] || n.hasAttribute('data-no-i18n')) continue; for (var j = 0; j < ATTRS.length; j++) { var c = n.getAttribute(ATTRS[j]); if (c) { var d = t(c); if (d !== c) n.setAttribute(ATTRS[j], d); } } }
    }
  }
  function start() {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    if (lang === 'pt') return;
    document.title = t(document.title);
    translateNode(document.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') translateNode(m.target);
        else if (m.type === 'attributes') translateNode(m.target);
        else for (var k = 0; k < m.addedNodes.length; k++) translateNode(m.addedNodes[k]);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  window.MUI18N = {
    get lang() { return lang; },
    t: t,
    set: function (l) { try { localStorage.setItem(KEY, l); } catch (e) {} location.reload(); },
    toggle: function () { this.set(lang === 'pt' ? 'en' : 'pt'); },
    label: function () { return lang === 'pt' ? '🇺🇸 EN' : '🇧🇷 PT'; },
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
