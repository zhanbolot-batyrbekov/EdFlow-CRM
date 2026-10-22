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
async function renderDashboard() {
  goPage('dashboard');
  const data = await api('dashboard').catch(() => null);
  if (!data) return;
  if (session.role === 'admin')   renderAdminDash(data);
  if (session.role === 'teacher') renderTeacherDash(data);
  if (session.role === 'student') renderStudentDash(data);
}

function renderStudentDash(data) {
  const schedEl = document.getElementById('student-dash-schedule');
  if (schedEl) schedEl.innerHTML = renderSchedItems(data.schedule||[]);
}

function renderTeacherDash(data) {
  const myGroups = (data.my_groups||[]);
  const el = document.getElementById('teacher-dash-groups');
  if (!el) return;
  el.innerHTML = myGroups.length
    ? myGroups.map(g => {
        const color = safeColor(g.course_color,'#2563eb'), icon = safeIconClass(g.course_icon,'fa-book');
        return `<div class="c-card" onclick="openGroupDetail(${g.id})" style="cursor:pointer">
          <div class="c-card-header">
            <div class="c-card-icon" style="background:${color}"><i class="fa-solid ${icon}"></i></div>
            <div style="flex:1"><div style="font-weight:600">${esc(g.name)}</div>
              <div style="font-size:11px;color:var(--muted)">${g.student_count||0} студентов</div></div>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty"><div class="empty-msg">Группы не назначены</div></div>';
}

function renderAdminDash(data) {
  // Экспирирующие студенты
  const expEl = document.getElementById('dash-expiring');
  if (expEl) {
    const exp = students.filter(s => {
      const d = parseLocalDate(s.end_date);
      return d && d.getTime() <= Date.now()+30*24*3600*1000 && d.getTime() >= Date.now();
    });
    expEl.innerHTML = exp.length
      ? exp.map(s => {
          const init = ((s.fname||'?')[0]+((s.lname||'')[0]||'')).toUpperCase();
          const d    = parseLocalDate(s.end_date);
          const days = d ? Math.ceil((d.getTime()-Date.now())/(1000*3600*24)) : null;
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
            <div class="av" style="background:${safeColor(s.av_color,avColor(s.fname))};width:32px;height:32px;font-size:11px">${init}</div>
            <div style="flex:1">
              <div style="font-weight:600;font-size:13px">${esc(s.fname)} ${esc(s.lname)}</div>
              <div style="font-size:11px;color:var(--muted)">Истекает: ${fmtDate(s.end_date)}</div>
            </div>
            ${days!==null?`<span class="badge ${days<=7?'b-red':'b-yellow'}">${days} дн.</span>`:''}
          </div>`;
        }).join('')
      : '<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px">Истекающих нет</div>';
  }

  // Сводка
  const stats = [
    { icon:'fa-user-graduate', color:'var(--accent)', val: students.length, lbl:'Студентов' },
    { icon:'fa-chalkboard-user',color:'var(--green)', val: teachers.length, lbl:'Преподавателей' },
    { icon:'fa-people-group',  color:'var(--purple)', val: groups.filter(g=>g.is_active==1).length, lbl:'Групп' },
    { icon:'fa-book',          color:'var(--yellow)', val: courses.length, lbl:'Курсов' },
  ];
  const statsEl = document.getElementById('dash-stats');
  if (statsEl) statsEl.innerHTML = stats.map(s =>
    `<div class="stat-card"><i class="fa-solid ${s.icon}" style="font-size:24px;color:${s.color}"></i>
     <div class="stat-val">${s.val}</div><div class="stat-lbl">${s.lbl}</div></div>`
  ).join('');
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
