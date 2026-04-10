const API_URL = 'https://english-learn-five.vercel.app/api/extension/save';
const MENU_ID = 'mia-save-word';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: '単語帳に保存 (Mia)',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID) return;

  const word = (info.selectionText ?? '').trim();
  if (!word) return;

  const { connection_code } = await chrome.storage.local.get('connection_code');

  if (!connection_code) {
    notify('連携コードを設定してください', '拡張機能のアイコンをクリックしてコードを入力してください');
    return;
  }

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, connection_code }),
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data?.error ?? '保存できませんでした';
      notify(msg === '単語・熟語のみ保存できます' ? msg : '保存できませんでした', msg);
      return;
    }

    notify('単語帳に保存しました', `${data.phrase} → ${data.translation}`);
  } catch {
    notify('保存できませんでした', 'ネットワークエラーが発生しました');
  }
});

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title,
    message,
  });
}
