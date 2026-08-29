# WatchParty 2K26

Projeto completo de Watch Party com:

- Salas privadas por código
- Link de convite
- Chat em tempo real
- Lista de usuários
- Player de vídeo sincronizado
- Compartilhamento de tela via WebRTC
- Banner 2K26
- Interface responsiva

## 1. Instalar

Instale Node.js 18 ou superior.

No terminal, dentro desta pasta:

```bash
npm install
npm start
```

Abra:

http://localhost:10000

## 2. Testar

Abra o site em duas abas/janelas.

1. Crie uma sala em uma aba.
2. Copie o convite.
3. Abra o convite na outra aba.
4. Entre com outro nome.
5. Para testar vídeo, use uma URL direta para um arquivo `.mp4` ou `.webm`.
6. Para testar tela, clique em "Compartilhar tela".

## 3. Publicar no Render

Crie um Web Service no Render apontando para este projeto.

Build Command:
```bash
npm install
```

Start Command:
```bash
npm start
```

O Render define automaticamente a variável PORT.

## Observações

Este primeiro projeto mantém as salas em memória. Isso é ótimo para começar e testar, mas salas podem desaparecer quando o servidor reiniciar.

Para uma versão maior, podemos adicionar:
- banco de dados;
- login;
- histórico de salas;
- YouTube/Twitch;
- senha de sala;
- dono/moderador;
- emojis/reactions;
- áudio e câmera;
- múltiplas telas;
- armazenamento persistente.
