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
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: injectToast,
    args: [payload],
  }).catch(() => {});
}

function injectToast({ success, phrase, translation, message }) {
  const TOAST_ID = '__mia_toast__';
  let el = document.getElementById(TOAST_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = TOAST_ID;
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: '2147483647',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '13px',
      lineHeight: '1.5',
      maxWidth: '260px',
      borderRadius: '14px',
      padding: '12px 16px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
      transition: 'opacity 0.25s ease, transform 0.25s ease',
      opacity: '0',
      transform: 'translateY(8px)',
      pointerEvents: 'none',
    });
    document.body.appendChild(el);
  }

  if (success) {
    el.style.background = '#f3e8ff';
    el.style.border = '1.5px solid #c084fc';
    el.style.color = '#581c87';
    el.innerHTML = `
      <div style="font-weight:700;margin-bottom:3px;">✓ 単語帳に保存しました</div>
      <div style="color:#7c3aed;font-weight:600;">${phrase}</div>
      <div style="color:#6b7280;font-size:12px;">${translation}</div>
    `;
  } else {
    el.style.background = '#fef2f2';
    el.style.border = '1.5px solid #fca5a5';
    el.style.color = '#7f1d1d';
    el.innerHTML = `<div style="font-weight:600;">✕ ${message}</div>`;
  }

  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });

  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
  }, 3000);
}
