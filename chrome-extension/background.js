const API_URL = 'https://english-learn-five.vercel.app/api/extension/save';
const MENU_ID = 'mia-save-word';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: '単語帳に保存 (Mia)',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const word = (info.selectionText ?? '').trim();
  if (!word) return;

  const { connection_code } = await chrome.storage.local.get('connection_code');

  if (!connection_code) {
    toast(tab, { success: false, message: '連携コードを設定してください' });
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
      toast(tab, { success: false, message: data?.error ?? '保存できませんでした' });
      return;
    }

    toast(tab, { success: true, phrase: data.phrase, translation: data.translation });
  } catch {
    toast(tab, { success: false, message: 'ネットワークエラーが発生しました' });
  }
});

function toast(tab, payload) {
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'MIA_TOAST', ...payload }).catch(() => {});
}
