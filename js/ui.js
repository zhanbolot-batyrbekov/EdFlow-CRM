// ═══════════════════════════════════════════════════════════
// ui.js  —  Инфраструктура UI: toast, modal, навигация
//           Зависит от: utils.js, state.js, api-client.js
// ═══════════════════════════════════════════════════════════

// ── Тема ──────────────────────────────────────────────────
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); localStorage.setItem('crm_theme', t); }
function toggleTheme() { applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }
function initTheme()  { applyTheme(localStorage.getItem('crm_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')); }

// ── Часы ──────────────────────────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    const el = document.getElementById('clock-display');   if (el) el.textContent = now.toLocaleTimeString('ru-RU');
    const td = document.getElementById('topbar-date');     if (td) td.textContent = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    const ds = document.getElementById('dash-date');       if (ds) ds.textContent = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  tick(); setInterval(tick, 1000);
}

// ── Toast ─────────────────────────────────────────────────
// ВАЖНО: msg вставляется через textContent (не innerHTML) — XSS-safe.
function toast(type, msg) {
  const wrap = document.getElementById('toasts');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success:'fa-check-circle', error:'fa-times-circle', info:'fa-info-circle', warn:'fa-triangle-exclamation' };
  const iconEl = document.createElement('i');
  iconEl.className = `fa-solid ${icons[type] || 'fa-info-circle'}`;
  const textEl = document.createElement('span');
  textEl.textContent = ' ' + String(msg ?? '');
  el.appendChild(iconEl);
  el.appendChild(textEl);
  wrap.appendChild(el);
  setTimeout(() => { el.style.transition = '.3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
}

// ── Modal ─────────────────────────────────────────────────
function closeModal(id) {
  const el = document.getElementById('ov-' + id);
  if (el) {
    el.classList.remove('show');
    clearValidation(el);
  }
}

// ── Confirm dialog ─────────────────────────────────────────
function askConfirm(msg, cb, title = 'Подтверждение') {
  document.getElementById('confirm-title').textContent = title;
  const msgEl = document.getElementById('confirm-msg');
  // msg может содержать HTML (для форм с select внутри confirm — см. архивация)
  msgEl.innerHTML = msg;
  confirmCallback = cb;
  document.getElementById('ov-confirm').classList.add('show');
}
function confirmAction() {
  if (confirmCallback) { const cb = confirmCallback; confirmCallback = null; cb(); }
  closeModal('confirm');
}

// ── DOM visibility ─────────────────────────────────────────
function setVisible(id, v) {
  const el = document.getElementById(id);
  if (el) el.style.display = v ? '' : 'none';
}

// ── Navigation ─────────────────────────────────────────────
function goPage(page, navEl, title) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'p-' + page));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.bn-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');
  const bn = document.getElementById('bn-' + page);
  if (bn) bn.classList.add('active');
  if (title) document.getElementById('topbar-title').textContent = title;
  closeSidebar();
}
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}

// ── Badges (счётчик студентов с истекающим сроком) ─────────
function updateBadges() {
  const now = Date.now();
  const soon = 30 * 24 * 3600 * 1000;
  const expiring = students.filter(s => {
    const d = parseLocalDate(s.end_date);
    return d && d.getTime() <= now + soon && d.getTime() >= now;
  }).length;
  const badge = document.getElementById('expiring-badge');
  if (badge) { badge.textContent = expiring || ''; badge.style.display = expiring ? '' : 'none'; }
}

// ── Аватар ────────────────────────────────────────────────
function renderUserAv(el, user, size = 36) {
  if (!el || !user) return;
  el.style.width = size + 'px'; el.style.height = size + 'px';
  el.style.fontSize = Math.round(size * 0.38) + 'px';
  if (user.av_url) {
    el.style.background = 'none';
    el.style.backgroundImage = `url(${user.av_url})`;
    el.style.backgroundSize = 'cover';
    el.textContent = '';
  } else {
    el.style.background = safeColor(user.av_color, avColor(user.fname));
    el.style.backgroundImage = '';
    el.textContent = ((user.fname||'?')[0] + ((user.lname||'')[0]||'')).toUpperCase();
  }
}

// ── Sidebar / BootApp ──────────────────────────────────────
function bootApp() {
  renderUserAv(document.getElementById('user-av'), session, 36);
  document.getElementById('user-name').textContent = (session.fname + ' ' + session.lname).trim();

  // Меню по ролям (навигация в сайдбаре)
  const isAdmin   = session.role === 'admin';
  const isTeacher = session.role === 'teacher';

  setVisible('nav-admin-group',       isAdmin);
  setVisible('nav-courses',           isAdmin);
  setVisible('nav-students',          isAdmin);
  setVisible('nav-section-management',isAdmin);
  setVisible('nav-finance',           isAdmin);
  setVisible('nav-archive',           isAdmin);
  setVisible('nav-section-analytics', isAdmin);

  if (isTeacher) {
    setVisible('nav-groups',       true);
    setVisible('nav-journal',      true);
    setVisible('nav-schedule-nav', true);
  }
  if (session.role === 'student') {
    setVisible('nav-groups',       false);
    setVisible('nav-journal',      false);
    setVisible('nav-schedule-nav', true);
  }

  // Нижняя мобильная навигация
  setVisible('bn-students', isAdmin);
  setVisible('bn-groups',   isAdmin || isTeacher);
  setVisible('bn-journal',  isAdmin || isTeacher);

  document.getElementById('dash-greeting').textContent = `Добро пожаловать, ${session.fname}! 👋`;

  // Подписка на закрытие модалок по клику на оверлей
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('show'); });
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show')); });

  startClock();
  updateBadges();
}
