// ═══════════════════════════════════════════════════════════
// app-init.js  —  Вход, выход, загрузка данных, дашборд
//                 Зависит от: все предыдущие модули
// ═══════════════════════════════════════════════════════════

// ── Вход ─────────────────────────────────────────────────
async function doLogin() {
  if (!validateForm([
    { id: 'l-user', rules: ['required'], label: 'Логин' },
    { id: 'l-pass', rules: ['required'], label: 'Пароль' },
  ])) return;

  const login = document.getElementById('l-user').value.trim();
  const pass  = document.getElementById('l-pass').value;
  const btn   = document.getElementById('login-btn');
  const err   = document.getElementById('auth-err');
  err.style.display = 'none';
  setBtnLoading(btn, true, 'Вход...');
  try {
    const res = await api('login', 'POST', { login, pass });
    saveToken(res.token); session = res.user;
    await loadAllData();
    startApp();
  } catch(e) {
    err.textContent = e.message; err.style.display = 'block';
  } finally {
    setBtnLoading(btn, false);
  }
}

// ── Выход ─────────────────────────────────────────────────
async function doLogout() {
  try { await api('logout', 'POST'); } catch(_) {}
  token = null; session = null;
  sessionStorage.removeItem('crm_token');
  courses=[]; groups=[]; students=[]; teachers=[];
  document.getElementById('appContainer').classList.add('hidden');
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('l-user').value = '';
  document.getElementById('l-pass').value = '';
  document.getElementById('auth-err').style.display = 'none';
}

// ── Загрузка всех данных ──────────────────────────────────
// Каждый промис обёрнут в .catch — если один эндпоинт недоступен,
// остальные данные всё равно загрузятся (graceful degradation).
async function loadAllData() {
  const [crs, grps, abt, subs] = await Promise.all([
    api('courses').catch(e => { toast('error', `Не удалось загрузить курсы: ${e.message}`); return []; }),
    api('groups') .catch(e => { toast('error', `Не удалось загрузить группы: ${e.message}`); return []; }),
    api('about')  .catch(() => ({})),
    api('subjects').catch(() => []),
  ]);
  courses = crs||[]; groups = grps||[];
  aboutData = abt||{}; subjectsList = subs||[];

  const orgName  = aboutData.name || 'Учебный центр';
  const logoTitle = document.querySelector('.logo-title');
  if (logoTitle) logoTitle.textContent = orgName;
  document.title = `CRM — ${orgName}`;

  if (session.role === 'admin') {
    const [st, tch] = await Promise.all([
      api('users','GET',null,'&role=student&active=1').catch(e => { toast('error', `Студенты: ${e.message}`); return []; }),
      api('users','GET',null,'&role=teacher&active=1').catch(e => { toast('error', `Преподаватели: ${e.message}`); return []; }),
    ]);
    students = st||[]; teachers = tch||[];
  }
  // Teacher не грузит глобальный список студентов — api.php блокирует это
  // (403), список студентов своей группы получается через group_students.
}

// ── Запуск приложения ─────────────────────────────────────
function startApp() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appContainer').classList.remove('hidden');

  const isAdmin   = session.role === 'admin';
  const isTeacher = session.role === 'teacher';

  renderUserAv(document.getElementById('user-av'), session, 36);
  document.getElementById('user-name').textContent = (session.fname+' '+session.lname).trim();

  const rMap  = { admin:['rp-admin','Администратор'], teacher:['rp-teacher','Преподаватель'], student:['rp-student','Студент'] };
  const [cls, lbl] = rMap[session.role] || ['rp-student',''];
  const pill  = document.getElementById('user-role-pill');
  if (pill) { pill.className = 'role-pill '+cls; pill.textContent = lbl; }

  // ── Навигация по ролям ─────────────────────────────────
  setVisible('nav-admin-group',        isAdmin);
  setVisible('nav-courses',            isAdmin);
  setVisible('nav-students',           isAdmin);
  setVisible('nav-section-management', isAdmin);
  setVisible('nav-finance',            isAdmin);
  setVisible('nav-archive',            isAdmin);
  setVisible('nav-section-analytics',  isAdmin);

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

  // Инициализация полей
  document.getElementById('dash-greeting').textContent = `Добро пожаловать, ${session.fname}! 👋`;
  const jd = document.getElementById('journal-date');
  if (jd) { jd.type = 'month'; jd.value = curMonth(); }
  const fm = document.getElementById('finance-month');
  if (fm) fm.value = curMonth();

  // Overlay-клики
  document.querySelectorAll('.modal-overlay').forEach(ov =>
    ov.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('show'); })
  );
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
  });

  startClock();
  updateBadges();
  renderDashboard();
}

// ── Дашборд ───────────────────────────────────────────────
// renderDashboard вызывается goPage-диспетчером и напрямую из startApp.
// Содержимое пишется в #dashboard-content, который есть в каждой роли.
async function renderDashboard() {
  const wrap = document.getElementById('dashboard-content');
  if (wrap) wrap.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
  try {
    const data = await api('dashboard');
    if      (session.role === 'student') renderStudentDash(data);
    else if (session.role === 'teacher') renderTeacherDash(data);
    else                                 renderAdminDash(data);
  } catch(e) {
    if (wrap) wrap.innerHTML = `<div class="empty"><div class="empty-msg">Ошибка: ${esc(e.message)}</div></div>`;
  }
}

function renderStudentDash(data) {
  const myGroups = data.groups || [];
  const attPct   = data.att_total > 0 ? Math.round(data.att_present / data.att_total * 100) : null;
  let html = `<div class="stats-grid">
    <div class="stat-card"><i class="fa-solid fa-people-group" style="font-size:24px;color:var(--accent)"></i>
      <div class="stat-val">${myGroups.length}</div><div class="stat-lbl">Моих групп</div></div>
    <div class="stat-card"><i class="fa-solid fa-calendar-check" style="font-size:24px;color:var(--green)"></i>
      <div class="stat-val">${attPct !== null ? attPct + '%' : '—'}</div>
      <div class="stat-lbl">Посещаемость</div>
      <div class="stat-sub">${data.att_present}/${data.att_total} дней</div></div>
    <div class="stat-card"><i class="fa-solid fa-money-bill" style="font-size:24px;color:var(--yellow)"></i>
      <div class="stat-val ${data.paid > 0 ? '' : 'b-red-text'}">${data.paid > 0 ? 'Оплачено' : 'Не оплачено'}</div>
      <div class="stat-lbl">Оплата</div></div>
  </div>`;
  if (myGroups.length) {
    html += `<div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-people-group" style="color:var(--accent)"></i> Мои группы</div></div>`;
    myGroups.forEach(g => {
      html += `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="width:38px;height:38px;border-radius:10px;background:${safeColor(g.course_color,'#2563eb')};display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0">
          <i class="fa-solid ${safeIconClass(g.course_icon,'fa-book')}"></i></div>
        <div><div style="font-weight:600">${esc(g.name)}</div>
          <div style="font-size:11px;color:var(--muted)">${esc(g.course_name||'')} · ${esc(g.teacher_name||'')}</div>
        </div></div>`;
    });
    html += `</div>`;
  }
  html += renderScheduleBlock(null, true);
  document.getElementById('dashboard-content').innerHTML = html;
  loadMyScheduleBlock();
}

function renderTeacherDash(data) {
  const myGroups = data.groups || [];
  let html = `<div class="stats-grid">
    <div class="stat-card"><i class="fa-solid fa-people-group" style="font-size:24px;color:var(--accent)"></i>
      <div class="stat-val">${myGroups.length}</div><div class="stat-lbl">Моих групп</div></div>
    <div class="stat-card"><i class="fa-solid fa-user-graduate" style="font-size:24px;color:var(--green)"></i>
      <div class="stat-val">${myGroups.reduce((s,g) => s + (parseInt(g.student_count)||0), 0)}</div>
      <div class="stat-lbl">Студентов</div></div>
  </div>`;
  if (myGroups.length) {
    html += `<div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-people-group" style="color:var(--accent)"></i> Мои группы</div></div>`;
    myGroups.forEach(g => {
      html += `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="openGroupDetail(${g.id})">
        <div style="width:38px;height:38px;border-radius:10px;background:${safeColor(g.course_color,'#2563eb')};display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0">
          <i class="fa-solid ${safeIconClass(g.course_icon,'fa-book')}"></i></div>
        <div style="flex:1"><div style="font-weight:600">${esc(g.name)}</div>
          <div style="font-size:11px;color:var(--muted)">${g.student_count||0} студентов</div>
        </div></div>`;
    });
    html += `</div>`;
  }
  html += renderScheduleBlock(null, true);
  document.getElementById('dashboard-content').innerHTML = html;
  loadMyScheduleBlock();
}

function renderAdminDash(data) {
  let html = `<div class="stats-grid">
    <div class="stat-card"><i class="fa-solid fa-user-graduate" style="font-size:24px;color:var(--accent)"></i>
      <div class="stat-val" style="color:var(--accent)">${data.students}</div><div class="stat-lbl">Студентов</div></div>
    <div class="stat-card"><i class="fa-solid fa-chalkboard-user" style="font-size:24px;color:var(--green)"></i>
      <div class="stat-val" style="color:var(--green)">${data.teachers}</div><div class="stat-lbl">Преподавателей</div></div>
    <div class="stat-card"><i class="fa-solid fa-people-group" style="font-size:24px;color:var(--purple)"></i>
      <div class="stat-val" style="color:var(--purple)">${data.groups}</div><div class="stat-lbl">Групп</div></div>
    <div class="stat-card"><i class="fa-solid fa-receipt" style="font-size:24px;color:var(--yellow)"></i>
      <div class="stat-val" style="color:var(--yellow);font-size:16px">${fmtMoney(data.avg_check)}</div>
      <div class="stat-lbl">Средний чек</div>
      <div class="stat-sub">${data.paid_count} оплатили</div></div>
  </div>
  <div class="dash-grid">
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa-solid fa-money-bill-wave" style="color:var(--green)"></i> Финансы — ${data.month}</div>
        <button class="btn btn-sm btn-outline" onclick="goPage('finance',null,'Финансы')">Подробнее</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="profile-stat">
          <div class="profile-stat-val" style="color:var(--green)">${fmtMoney(data.revenue)}</div>
          <div class="profile-stat-lbl">Получено</div></div>
        <div class="profile-stat">
          <div class="profile-stat-val" style="color:var(--red)">${fmtMoney((data.expected||0)-(data.revenue||0))}</div>
          <div class="profile-stat-lbl">Не оплачено</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title"><i class="fa-solid fa-clock" style="color:var(--yellow)"></i> Истекает скоро</div></div>
      ${(data.ending_soon||[]).length
        ? data.ending_soon.map(s => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">
            <span>${esc(s.fname)} ${esc(s.lname)}</span>
            <span class="badge b-yellow">${fmtDate(s.end_date)}</span></div>`).join('')
        : '<div style="color:var(--muted);font-size:12px;padding:10px 0">Нет</div>'}
    </div>
  </div>`;
  document.getElementById('dashboard-content').innerHTML = html;
}

// ── Блок расписания на дашборде ───────────────────────────
function renderScheduleBlock(sched, loading = false) {
  return `<div class="card" id="my-sched-card">
    <div class="card-header"><div class="card-title"><i class="fa-solid fa-calendar-days" style="color:var(--accent)"></i> Моё расписание</div></div>
    <div id="my-sched-content">${loading
      ? '<div style="text-align:center;padding:20px;color:var(--muted)"><i class="fa-solid fa-spinner fa-spin"></i></div>'
      : renderSchedItems(sched)}</div></div>`;
}
async function loadMyScheduleBlock() {
  try {
    const s  = await api('my_schedule');
    const el = document.getElementById('my-sched-content');
    if (el) el.innerHTML = renderSchedItems(s);
  } catch(_) {}
}

// ── Инициализация при старте страницы ─────────────────────
initTheme();

(async function init() {
  loadToken();
  if (token) {
    try {
      session = await api('me');
      await loadAllData();
      startApp();
    } catch(e) {
      token = null;
      sessionStorage.removeItem('crm_token');
      toast('warn', e?.message
        ? `Сессия истекла: ${e.message}. Войдите снова.`
        : 'Сессия истекла или сервер недоступен. Войдите снова.');
    }
  }
})();
