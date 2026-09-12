const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let bot = null;
let afkInterval = null;
let currentConfig = null;
let autoReconnect = false;

// Terminale/Konsola log basma fonksiyonu
function sendTerminalLog(message, type = 'info') {
  const time = new Date().toLocaleTimeString();
  io.emit('terminal-log', { time, message, type });
}

function stopBot() {
  if (afkInterval) clearInterval(afkInterval);
  if (bot) {
    bot.quit();
    bot = null;
  }
  io.emit('bot-status', 'OFFLINE');
}

function createBot(config) {
  if (bot) stopBot();

  currentConfig = config;
  autoReconnect = config.autoReconnect;

  sendTerminalLog(`[SİSTEM] Sunucuya bağlanılıyor: ${config.host}:${config.port} (${config.username})`, 'system');
  io.emit('bot-status', 'CONNECTING');

  try {
    bot = mineflayer.createBot({
      host: config.host,
      port: parseInt(config.port) || 25565,
      username: config.username,
      version: config.version || false
    });
  } catch (err) {
    sendTerminalLog(`[HATA] Bot başlatılamadı: ${err.message}`, 'error');
    io.emit('bot-status', 'OFFLINE');
    return;
  }

  // Oyuna giriş yapıldığında
  bot.once('spawn', () => {
    sendTerminalLog(`[+] ${bot.username} olarak oyuna başarıyla girildi!`, 'success');
    io.emit('bot-status', 'ONLINE');

    // Otomatik Giriş / AuthMe Komutu
    if (config.authCmd && config.authCmd.trim() !== '') {
      setTimeout(() => {
        if (bot) {
          bot.chat(config.authCmd);
          sendTerminalLog(`[KOMUT] Giriş komutu gönderildi: ${config.authCmd}`, 'cmd');
        }
      }, 2000);
    }

    // Proxy / Sunucu Yönlendirme Komutu (Örn: /gir boxpvp)
    if (config.redirectCmd && config.redirectCmd.trim() !== '') {
      setTimeout(() => {
        if (bot) {
          bot.chat(config.redirectCmd);
          sendTerminalLog(`[KOMUT] Yönlendirme komutu gönderildi: ${config.redirectCmd}`, 'cmd');
        }
      }, 5000);
    }

    // Anti-AFK Döngüsü (Her 20-30 saniyede bir zıplar ve döner)
    if (afkInterval) clearInterval(afkInterval);
    afkInterval = setInterval(() => {
      if (!bot) return;

      // Zıplama
      bot.setControlState('jump', true);
      setTimeout(() => {
        if (bot) bot.setControlState('jump', false);
      }, 450);

      // Etrafa Bakma
      const yaw = Math.random() * Math.PI * 2;
      const pitch = (Math.random() - 0.5) * (Math.PI / 2);
      bot.look(yaw, pitch, true);
    }, 25000);
  });

  // Chat Mesajlarını Yakalama
  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    sendTerminalLog(`<${username}> ${message}`, 'chat');
  });

  // Sistem / Sunucu Mesajlarını Yakalama
  bot.on('message', (jsonMsg) => {
    const rawText = jsonMsg.toString().trim();
    if (rawText) {
      sendTerminalLog(rawText, 'server');
    }
  });

  // Sunucudan Düşme
  bot.on('end', (reason) => {
    sendTerminalLog(`[-] Bot sunucudan ayrıldı. Nedeni: ${reason}`, 'warn');
    io.emit('bot-status', 'OFFLINE');
    if (afkInterval) clearInterval(afkInterval);
    bot = null;

    if (autoReconnect) {
      sendTerminalLog('[SİSTEM] Otomatik yeniden bağlanma aktif. 10 saniye sonra tekrar bağlanılıyor...', 'system');
      setTimeout(() => {
        if (autoReconnect && !bot && currentConfig) {
          createBot(currentConfig);
        }
      }, 10000);
    }
  });

  // Hata Yakalama
  bot.on('error', (err) => {
    sendTerminalLog(`[HATA] ${err.message}`, 'error');
  });
}

// Socket.io Web Bağlantıları
io.on('connection', (socket) => {
  // Mevcut Durumu Bildir
  socket.emit('bot-status', bot ? 'ONLINE' : 'OFFLINE');

  // Dashboard'dan Bağlantı İsteği
  socket.on('start-bot', (config) => {
    createBot(config);
  });

  // Dashboard'dan Bağlantıyı Kes İsteği
  socket.on('stop-bot', () => {
    autoReconnect = false;
    stopBot();
    sendTerminalLog('[SİSTEM] Bot bağlantısı kullanıcı tarafından kesildi.', 'warn');
  });

  // Terminalden Gelen Komut/Chat Gönderimi
  socket.on('send-command', (cmd) => {
    if (bot) {
      bot.chat(cmd);
      sendTerminalLog(`> ${cmd}`, 'user-input');
    } else {
      socket.emit('terminal-log', {
        time: new Date().toLocaleTimeString(),
        message: '[HATA] Komut gönderilemedi: Bot aktif değil!',
        type: 'error'
      });
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`[PANEL] Dashboard hazır -> http://localhost:${PORT}`);
});
