const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Aktif botları ve onların AFK döngülerini saklayan nesne
const activeBots = {};

// Terminal Log Gönderimi
function sendLog(botId, message, type = 'info') {
  const time = new Date().toLocaleTimeString();
  io.emit('bot-log', { botId, time, message, type });
}

// Bot Durum Güncellemesi
function updateStatus(botId, status) {
  io.emit('bot-status-change', { botId, status });
}

// Yeni Bot Oluşturma ve Bağlama
function createBotInstance(config) {
  const { id, host, port, username, version, authCmd, redirectCmd, autoReconnect } = config;

  // Eğer bu ID ile bot zaten varsa durdur
  if (activeBots[id]) {
    stopBotInstance(id);
  }

  sendLog(id, `[SİSTEM] ${host}:${port} sunucusuna bağlanılıyor...`, 'system');
  updateStatus(id, 'CONNECTING');

  try {
    const bot = mineflayer.createBot({
      host: host,
      port: parseInt(port) || 25565,
      username: username,
      version: version || false
    });

    activeBots[id] = {
      bot: bot,
      config: config,
      afkInterval: null,
      shouldReconnect: autoReconnect
    };

    // Oyuna Giriş
    bot.once('spawn', () => {
      sendLog(id, `[+] ${username} sunucuya giriş yaptı!`, 'success');
      updateStatus(id, 'ONLINE');

      // Giriş Komutu (AuthMe vb.)
      if (authCmd && authCmd.trim() !== '') {
        setTimeout(() => {
          if (activeBots[id] && activeBots[id].bot) {
            bot.chat(authCmd);
            sendLog(id, `[KOMUT] Giriş komutu gönderildi: ${authCmd}`, 'cmd');
          }
        }, 2000);
      }

      // Yönlendirme Komutu (Lobi/Proxy /gir vb.)
      if (redirectCmd && redirectCmd.trim() !== '') {
        setTimeout(() => {
          if (activeBots[id] && activeBots[id].bot) {
            bot.chat(redirectCmd);
            sendLog(id, `[KOMUT] Yönlendirme komutu gönderildi: ${redirectCmd}`, 'cmd');
          }
        }, 5000);
      }

      // Anti-AFK Döngüsü (Zıplama & Bakış Değiştirme)
      if (activeBots[id].afkInterval) clearInterval(activeBots[id].afkInterval);
      activeBots[id].afkInterval = setInterval(() => {
        if (!activeBots[id] || !activeBots[id].bot) return;

        // Zıpla
        bot.setControlState('jump', true);
        setTimeout(() => {
          if (activeBots[id] && activeBots[id].bot) bot.setControlState('jump', false);
        }, 400);

        // Etrafa Bak
        const yaw = Math.random() * Math.PI * 2;
        const pitch = (Math.random() - 0.5) * (Math.PI / 2);
        bot.look(yaw, pitch, true);
      }, 20000);
    });

    // Chat Mesajları
    bot.on('chat', (sender, message) => {
      if (sender === username) return;
      sendLog(id, `<${sender}> ${message}`, 'chat');
    });

    // Sunucu/Sistem Mesajları
    bot.on('message', (jsonMsg) => {
      const txt = jsonMsg.toString().trim();
      if (txt) sendLog(id, txt, 'server');
    });

    // Sunucudan Düşme
    bot.on('end', (reason) => {
      sendLog(id, `[-] Bot sunucudan ayrıldı. Nedeni: ${reason}`, 'warn');
      updateStatus(id, 'OFFLINE');

      if (activeBots[id] && activeBots[id].afkInterval) {
        clearInterval(activeBots[id].afkInterval);
      }

      const rec = activeBots[id] ? activeBots[id].shouldReconnect : false;
      delete activeBots[id];

      if (rec) {
        sendLog(id, '[SİSTEM] Otomatik yeniden bağlanma aktif (10sn içinde deneniyor)...', 'system');
        setTimeout(() => {
          if (rec) createBotInstance(config);
        }, 10000);
      }
    });

    // Hata Durumları
    bot.on('error', (err) => {
      sendLog(id, `[HATA] ${err.message}`, 'error');
    });

  } catch (err) {
    sendLog(id, `[HATA] Bot başlatılamadı: ${err.message}`, 'error');
    updateStatus(id, 'OFFLINE');
  }
}

// Bot Durdurma
function stopBotInstance(id) {
  if (activeBots[id]) {
    activeBots[id].shouldReconnect = false;
    if (activeBots[id].afkInterval) clearInterval(activeBots[id].afkInterval);
    if (activeBots[id].bot) activeBots[id].bot.quit();
    delete activeBots[id];
    sendLog(id, '[SİSTEM] Bot bağlantısı sonlandırıldı.', 'warn');
  }
  updateStatus(id, 'OFFLINE');
}

// Socket.io Olayları
io.on('connection', (socket) => {
  // Mevcut aktif bot listesini gönder
  const currentList = {};
  Object.keys(activeBots).forEach(id => {
    currentList[id] = {
      username: activeBots[id].config.username,
      status: 'ONLINE'
    };
  });
  socket.emit('init-bots', currentList);

  // Bot Ekle/Başlat
  socket.on('start-bot-instance', (config) => {
    createBotInstance(config);
  });

  // Botu Durdur
  socket.on('stop-bot-instance', (id) => {
    stopBotInstance(id);
  });

  // Bot Terminalinden Komut Gönderme
  socket.on('send-bot-command', ({ id, cmd }) => {
    if (activeBots[id] && activeBots[id].bot) {
      activeBots[id].bot.chat(cmd);
      sendLog(id, `> ${cmd}`, 'user-input');
    } else {
      sendLog(id, '[HATA] Komut gönderilemedi: Bot oyunda değil!', 'error');
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`[PANEL] Çoklu AFK Bot Dashboard http://localhost:${PORT} adresinde hazır.`);
});
