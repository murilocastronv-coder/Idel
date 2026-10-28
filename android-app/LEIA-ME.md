# MU Idle Legends — app Android

App Android que abre o jogo no **mesmo servidor do navegador** (`https://muonlineclaude.com/app`):
mesma conta, mesmos heróis e o mesmo mundo multiplayer. Quem joga no app encontra quem joga no navegador.

A primeira tela do app é a página `/app` do servidor, com o vídeo do jogo, criar conta, entrar,
recuperar senha e jogar. Como ela vem do servidor, **dá para mudar a página sem gerar outro APK**.

## O que o app faz

- Tela de abertura com o ícone do jogo; tela "sem internet" com botão para tentar de novo.
- Login salvo no aparelho (cookies), vídeo tocando sozinho, tela não apaga enquanto o app está aberto.
- Botão voltar do Android volta páginas; links de fora (Discord) abrem no navegador/app do Discord.
- Links `https://muonlineclaude.com/...` podem abrir direto no app.

## Gerar o APK

### Opção 1 — automático pelo GitHub (já configurado)
O repositório tem a rotina `.github/workflows/android-apk.yml`. A cada mudança nesta pasta,
o GitHub compila o APK, salva em `public/download/mu-idle-legends.apk` e o site passa a oferecer em
**https://muonlineclaude.com/download**. Também dá para rodar na mão: GitHub → Actions →
"App Android (APK)" → Run workflow. O APK fica em "Artifacts".

### Opção 2 — Android Studio
1. Abra o Android Studio → **Open** → escolha a pasta `android-app`.
2. Espere o Gradle sincronizar (ele baixa o que falta sozinho).
3. Menu **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
4. O arquivo sai em `app/build/outputs/apk/release/app-release.apk` (ou `debug/`).

Para a **Play Store**, use **Build → Generate Signed App Bundle** e gere um `.aab`.

## Coisas que você pode mudar

| O quê | Onde |
|---|---|
| Endereço do jogo | `app/build.gradle` → `START_URL` e `GAME_HOST` |
| Nome do app | `app/src/main/res/values/strings.xml` |
| Ícone | `app/src/main/res/mipmap-*/ic_launcher.png` |
| Versão (aumente a cada atualização) | `app/build.gradle` → `versionCode` e `versionName` |

## Chave de assinatura

O APK é assinado com `keystore/mu-idle-legends.jks` (senha `muidle2026`, alias `muidle`).
**Guarde esse arquivo**: o Android só aceita atualizar o app se a nova versão for assinada com a mesma chave.
Como a chave está no repositório, quem tiver acesso ao código pode assinar um app como se fosse o seu.
Antes de publicar na Play Store, crie uma chave nova e privada (o Android Studio faz isso em
"Generate Signed App Bundle") e não a coloque no repositório.
