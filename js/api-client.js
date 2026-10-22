// ═══════════════════════════════════════════════════════════
// api-client.js  —  HTTP-обёртка + токен
//                   Зависит от: state.js (token)
// ═══════════════════════════════════════════════════════════

async function api(action, method = 'GET', body = null, params = '') {
  const h = { 'Content-Type': 'application/json' };
  if (token) { h['X-Token'] = token; h['Authorization'] = 'Bearer ' + token; }
  const opts = { method, headers: h };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const tp = token ? `&_token=${encodeURIComponent(token)}` : '';
  let res;
  try {
    res = await fetch(`${API}?action=${action}${params}${tp}`, opts);
  } catch (e) {
    throw new Error('Нет связи с сервером');
  }
  const text = await res.text();
  if (!text?.trim()) throw new Error(`Пустой ответ (${res.status})`);
  let json;
  try { json = JSON.parse(text); }
  catch (e) { console.error('Не JSON:', text.slice(0, 300)); throw new Error('Ошибка сервера'); }
  if (!json.ok) throw new Error(json.error || 'Ошибка сервера');
  return json.data;
}

function saveToken(t) { token = t; sessionStorage.setItem('crm_token', t); }
function loadToken()  { token = sessionStorage.getItem('crm_token'); }

// ── Race-condition protection ──────────────────────────────
// Блокирует ВСЕ кнопки внутри модалки на время await api(...)
function setModalLoading(modalKey, loading, loadingText = 'Сохранение...') {
  const modal = document.getElementById('ov-' + modalKey);
  if (!modal) return;
  modal.querySelectorAll('button').forEach(b => {
    if (loading) {
      if (b.dataset.origHtml === undefined) b.dataset.origHtml = b.innerHTML;
      b.disabled = true;
      if (b.classList.contains('btn-primary'))
        b.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${esc(loadingText)}`;
    } else {
      b.disabled = false;
      if (b.dataset.origHtml !== undefined) {
        b.innerHTML = b.dataset.origHtml;
        delete b.dataset.origHtml;
      }
    }
  });
}

// Блокирует конкретную кнопку (кнопки в таблице, вне модалки)
function setBtnLoading(btn, loading, loadingText = 'Сохранение...') {
  if (!btn) return;
  if (loading) {
    if (btn.dataset.origHtml === undefined) btn.dataset.origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${esc(loadingText)}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.origHtml !== undefined) {
      btn.innerHTML = btn.dataset.origHtml;
      delete btn.dataset.origHtml;
    }
  }
}
