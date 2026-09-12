const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const activeBots = {};

io.on('connection', (socket) => {
  console.log('İstemci bağlandı:', socket.id);

  // BOT BAŞLATMA
  socket.on('start_bot', (data) => {
    const { botId, username, host, port, version, asmpCmd, offline } = data;

    if (activeBots[botId]) return;

    io.emit('bot_log', { id: botId, text: `[Sistem] ${username} sunucusuna (${host}:${port}) bağlanılıyor...`, type: 'log-system' });

    try {
      const bot = mineflayer.createBot({
        host: host,
        port: parseInt(port) || 25565,
        username: username,
        version: version && version !== 'auto' ? version : false,
        auth: offline ? 'offline' : 'microsoft'
      });

      activeBots[botId] = bot;

      // SUNUCUYA BAĞLANDIĞINDA
      bot.on('login', () => {
        io.emit('bot_log', { id: botId, text: '[Sistem] Sunucuya bağlantı başarılı.', type: 'log-success' });

        // Otomatik Giriş / ASMP komutu çalıştırma
        if (asmpCmd) {
          setTimeout(() => {
            const cmd = asmpCmd.startsWith('/') ? asmpCmd : `/login ${asmpCmd}`;
            bot.chat(cmd);
            io.emit('bot_log', { id: botId, text: `[Otomatik Komut] ${cmd} gönderildi.`, type: 'log-cmd' });
          }, 3000);
        }
      });

      // SOHBET VE SUNUCU MESAJLARINI DİNLEME (Canlı sohbet akışı)
      bot.on('messagestr', (message) => {
        if (!message || message.trim() === '') return;
        io.emit('bot_log', { id: botId, text: message, type: 'log-chat' });
      });

      // HATA VE KOPMA DURUMLARI
      bot.on('error', (err) => {
        io.emit('bot_log', { id: botId, text: `[Hata] ${err.message}`, type: 'log-error' });
      });

      bot.on('end', (reason) => {
        io.emit('bot_log', { id: botId, text: `[Sistem] Sunucu bağlantısı kesildi: ${reason}`, type: 'log-error' });
        delete activeBots[botId];
      });

    } catch (err) {
      io.emit('bot_log', { id: botId, text: `[Hata] Bot başlatılamadı: ${err.message}`, type: 'log-error' });
    }
  });

  // TELEFONDAN MANUEL KOMUT GÖNDERME
  socket.on('send_command', (data) => {
    const { botId, command } = data;
    const bot = activeBots[botId];

    if (bot) {
      bot.chat(command);
      io.emit('bot_log', { id: botId, text: `> ${command}`, type: 'log-user-input' });
    } else {
      socket.emit('bot_log', { id: botId, text: '[Hata] Bot aktif değil.', type: 'log-error' });
    }
  });

  // BOTU KAPATMA
  socket.on('stop_bot', (botId) => {
    if (activeBots[botId]) {
      activeBots[botId].quit();
      delete activeBots[botId];
      io.emit('bot_log', { id: botId, text: '[Sistem] Bot bağlantısı kapatıldı.', type: 'log-system' });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));
