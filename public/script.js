document.addEventListener('DOMContentLoaded', () => {
  const botForm = document.getElementById('bot-form');
  const tabsHeader = document.getElementById('tabs-header');
  const noTabMsg = document.getElementById('no-tab-msg');
  const terminalsWrapper = document.getElementById('terminals-wrapper');
  const terminalInput = document.getElementById('terminal-input');
  const btnSendCmd = document.getElementById('btn-send-cmd');
  const activeBotTitle = document.getElementById('active-bot-title');
  const btnDisconnectBot = document.getElementById('btn-disconnect-bot');
  const btnClearTerm = document.getElementById('btn-clear-term');

  let activeBotId = null;
  const bots = {};

  // BOT OLUŞTURMA
  botForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const username = document.getElementById('bot-username').value.trim();
    const host = document.getElementById('server-host').value.trim();
    const port = document.getElementById('server-port').value.trim();
    const version = document.getElementById('bot-version').value.trim();
    const asmpCmd = document.getElementById('asmp-cmd').value.trim();
    const offline = document.getElementById('auth-offline').checked;

    if (!username || !host) return;

    const botId = 'bot_' + Date.now();
    bots[botId] = {
      id: botId,
      username,
      host,
      port,
      version,
      asmpCmd,
      offline,
      status: 'online'
    };

    createBotTab(botId, username);
    createBotTerminal(botId);
    selectBotTab(botId);

    // ASMP veya Login komutu tanımlandıysa konsola bilgi bas
    if (asmpCmd) {
      appendLog(botId, `[Sistem] Giriş/ASMP komutu hazırlandı: ${asmpCmd}`, 'log-system');
    }

    botForm.reset();
  });

  // SEKME OLUŞTURMA
  function createBotTab(id, name) {
    if (noTabMsg) noTabMsg.style.display = 'none';

    const tab = document.createElement('div');
    tab.className = 'tab-item';
    tab.dataset.id = id;
    tab.innerHTML = `<span class="status-dot online"></span> ${name}`;

    tab.addEventListener('click', () => selectBotTab(id));
    tabsHeader.appendChild(tab);
  }

  // TERMINAL EKRANI OLUŞTURMA
  function createBotTerminal(id) {
    const screen = document.createElement('div');
    screen.className = 'terminal-screen';
    screen.id = `term-${id}`;
    screen.innerHTML = `<div class="log-line log-system">[Sistem] ${bots[id].username} sunucuya (${bots[id].host}:${bots[id].port}) bağlanıyor...</div>`;
    terminalsWrapper.appendChild(screen);
  }

  // BOT SEKMESİ SEÇME
  function selectBotTab(id) {
    activeBotId = id;

    document.querySelectorAll('.tab-item').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.id === id);
    });

    document.querySelectorAll('.terminal-screen').forEach(screen => {
      screen.classList.toggle('active', screen.id === `term-${id}`);
    });

    if (bots[id]) {
      activeBotTitle.innerText = `Seçili Bot: ${bots[id].username}`;
    }
  }

  // LOG EKLEME
  function appendLog(id, text, styleClass = 'log-line') {
    const term = document.getElementById(`term-${id}`);
    if (!term) return;

    const line = document.createElement('div');
    line.className = `log-line ${styleClass}`;
    line.innerText = text;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
  }

  // KOMUT GÖNDERME
  function sendCommand() {
    const cmd = terminalInput.value.trim();
    if (!cmd || !activeBotId) return;

    appendLog(activeBotId, `> ${cmd}`, 'log-user-input');
    terminalInput.value = '';
  }

  btnSendCmd.addEventListener('click', sendCommand);
  terminalInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendCommand();
  });

  // EKRANI TEMİZLE
  btnClearTerm.addEventListener('click', () => {
    if (!activeBotId) return;
    const term = document.getElementById(`term-${activeBotId}`);
    if (term) term.innerHTML = '';
  });

  // BOTU KAPAT
  btnDisconnectBot.addEventListener('click', () => {
    if (!activeBotId) return;

    const tab = document.querySelector(`.tab-item[data-id="${activeBotId}"]`);
    const term = document.getElementById(`term-${activeBotId}`);

    if (tab) tab.remove();
    if (term) term.remove();
    delete bots[activeBotId];

    const remainingKeys = Object.keys(bots);
    if (remainingKeys.length > 0) {
      selectBotTab(remainingKeys[0]);
    } else {
      activeBotId = null;
      activeBotTitle.innerText = 'Seçili Bot: Yok';
      if (noTabMsg) noTabMsg.style.display = 'inline';
    }
  });
});
