const input = document.getElementById('code-input');
const saveBtn = document.getElementById('save-btn');
const clearBtn = document.getElementById('clear-btn');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const savedEl = document.getElementById('saved');

function showStatus(code) {
  if (code) {
    statusEl.textContent = '連携中: ' + code.slice(0, 8) + '…';
    statusEl.className = 'status ok';
    clearBtn.style.display = 'block';
  } else {
    statusEl.textContent = '連携コード未設定';
    statusEl.className = 'status none';
    clearBtn.style.display = 'none';
  }
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
  savedEl.style.display = 'none';
}

function showSaved() {
  savedEl.textContent = '保存しました';
  savedEl.style.display = 'block';
  errorEl.style.display = 'none';
  setTimeout(() => { savedEl.style.display = 'none'; }, 2000);
}

// Load stored code on open
chrome.storage.local.get('connection_code', ({ connection_code }) => {
  showStatus(connection_code ?? null);
  if (connection_code) input.value = connection_code;
});

saveBtn.addEventListener('click', () => {
  const code = input.value.trim();
  if (!code.match(/^[0-9a-f-]{36}$/i)) {
    showError('正しい連携コードを入力してください（UUID形式）');
    return;
  }
  chrome.storage.local.set({ connection_code: code }, () => {
    showStatus(code);
    showSaved();
  });
});

clearBtn.addEventListener('click', () => {
  chrome.storage.local.remove('connection_code', () => {
    input.value = '';
    showStatus(null);
  });
});
