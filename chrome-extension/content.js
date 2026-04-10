// In-page toast notification
(function () {
  const TOAST_ID = '__mia_toast__';

  function showToast({ success, phrase, translation, message }) {
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

    // Animate in
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });

    // Animate out after 3s
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
    }, 3000);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'MIA_TOAST') showToast(msg);
  });
})();
