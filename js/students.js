// ═══════════════════════════════════════════════════════════
// students.js  —  Студенты, преподаватели, CRUD пользователей
//                 Зависит от: utils.js, state.js, api-client.js,
//                             ui.js, validation.js
// ═══════════════════════════════════════════════════════════

// ── Список студентов ───────────────────────────────────────
function renderStudents() {
  if (session.role !== 'admin') return;
  document.getElementById('st-subtitle').textContent = `${students.length} студентов`;
  document.getElementById('st-header-btn').innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select class="form-input" id="sort-select" style="width:160px;font-size:12px"
        onchange="sortStudents(this.value)">
        <option value="name"  ${studentSortBy==='name' ?'selected':''}>Сортировка: Имя</option>
        <option value="birth" ${studentSortBy==='birth'?'selected':''}>По дате рождения</option>
        <option value="end"   ${studentSortBy==='end'  ?'selected':''}>По сроку обучения</option>
      </select>
      <button class="btn btn-primary" onclick="openUserModal('student')">
        <i class="fa-solid fa-user-plus"></i> Добавить студента</button>
    </div>`;

  if (!students.length) {
    document.getElementById('st-table-wrap').style.display = 'none';
    document.getElementById('st-empty').style.display = '';
    return;
  }
  document.getElementById('st-table-wrap').style.display = '';
  document.getElementById('st-empty').style.display = 'none';

  // Сортировка выполняется только на клиенте — данные уже в памяти.
  // Ранее делался лишний API-вызов GET /users?sort=X, что тратило
  // сеть и вызывало мерцание при каждом переключении сортировки.
  let sorted = [...students];
  if      (studentSortBy === 'birth') sorted.sort((a,b) => (a.birth_date||'').localeCompare(b.birth_date||''));
  else if (studentSortBy === 'end')   sorted.sort((a,b) => (a.end_date||'9999').localeCompare(b.end_date||'9999'));
  else                                sorted.sort((a,b) => (a.lname+a.fname).localeCompare(b.lname+b.fname));

  document.getElementById('students-tbody').innerHTML = sorted.map(s => {
    const initials = ((s.fname||'?')[0] + ((s.lname||'')[0]||'')).toUpperCase();
    const expiring = s.end_date && parseLocalDate(s.end_date) <= new Date(Date.now()+30*24*3600*1000)
                                && parseLocalDate(s.end_date) >= new Date();
    return `<tr>
      <td><div class="person-cell">
        <div class="av" style="background:${safeColor(s.av_color,avColor(s.fname))}">${initials}</div>
        <div><div class="p-name">${esc(s.fname)} ${esc(s.lname)}</div></div>
      </div></td>
      <td><code style="background:var(--surface2);padding:2px 6px;border-radius:5px;font-size:10px">${esc(s.login)}</code></td>
      <td><small>${esc(s.phone||'—')}</small></td>
      <td><small>${esc(s.guardian||'—')}</small></td>
      <td><small>${fmtDate(s.birth_date)}</small></td>
      <td><small class="${expiring?'text-warning':''}">${fmtDate(s.end_date)}</small>
          ${expiring?'<span class="badge b-yellow" style="margin-left:4px">Истекает!</span>':''}</td>
      <td><div class="actions-cell">
        ${session.role==='admin'?`
          <button class="btn btn-icon btn-outline" onclick="openUserModal('student','${s.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-icon btn-outline" title="Архивировать"
            onclick="openArchiveModal('${s.id}','${esc((s.fname+' '+s.lname).replace(/'/g,''))}')">
            <i class="fa-solid fa-box-archive"></i></button>
          <button class="btn btn-icon btn-danger" title="Удалить навсегда"
            onclick="openDeleteStudentModal('${s.id}','${esc((s.fname+' '+s.lname).replace(/'/g,''))}')">
            <i class="fa-solid fa-trash"></i></button>`:''}
      </div></td>
    </tr>`;
  }).join('');
}

// Сортировка — только клиентская, без API-вызова
function sortStudents(by) {
  studentSortBy = by;
  renderStudents();
}

// ── Архив ──────────────────────────────────────────────────
function openArchiveModal(uid, name) {
  const groupOptions = visibleGroups().map(g =>
    `<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('');
  document.getElementById('confirm-title').textContent = 'Архивировать студента';
  document.getElementById('confirm-msg').innerHTML = `
    Перенести <strong>${esc(name)}</strong> в архив?
    <br><small style="color:var(--muted)">Дата завершения обучения будет зафиксирована сегодняшним числом.</small>
    <br><br>
    <label class="form-label">Группа, которую окончил:</label>
    <select class="form-input" id="grad-group-select" style="margin-top:6px">
      <option value="">— Выберите —</option>${groupOptions}
    </select>`;
  confirmCallback = () => archiveStudentWithGroup(uid);
  document.getElementById('ov-confirm').classList.add('show');
}

async function archiveStudentWithGroup(uid) {
  const gname = document.getElementById('grad-group-select')?.value || '';
  try {
    await api('users', 'DELETE', { graduated_group: gname }, `&id=${uid}`);
    students = students.filter(s => !sameId(s.id, uid));
    renderStudents(); updateBadges(); toast('info', 'Студент архивирован');
  } catch(e) { toast('error', e.message); }
}

function openDeleteStudentModal(uid, name) {
  document.getElementById('confirm-title').textContent = 'Удалить студента навсегда';
  document.getElementById('confirm-msg').innerHTML = `
    <strong style="color:var(--red)">Это действие необратимо.</strong><br>
    Студент <strong>${esc(name)}</strong> и вся его история будут удалены.<br><br>
    Если хотите сохранить историю — используйте «Архивировать».`;
  confirmCallback = () => deleteStudentPermanently(uid);
  document.getElementById('ov-confirm').classList.add('show');
}

async function deleteStudentPermanently(uid) {
  try {
    await api('users', 'DELETE', { force: 1 }, `&id=${uid}`);
    students = students.filter(s => !sameId(s.id, uid));
    renderStudents(); updateBadges(); toast('info', 'Студент удалён');
  } catch(e) { toast('error', e.message); }
}

async function renderArchive() {
  if (session.role !== 'admin') return;
  try {
    const archived = await api('users', 'GET', null, '&role=student&active=0');
    const tbody = document.getElementById('archive-tbody'); if (!tbody) return;
    tbody.innerHTML = (archived||[]).map(s => {
      const initials = ((s.fname||'?')[0] + ((s.lname||'')[0]||'')).toUpperCase();
      return `<tr>
        <td><div class="person-cell">
          <div class="av" style="background:${safeColor(s.av_color,avColor(s.fname))}">${initials}</div>
          <div class="p-name">${esc(s.fname)} ${esc(s.lname)}</div>
        </div></td>
        <td><code style="background:var(--surface2);padding:2px 6px;border-radius:5px;font-size:10px">${esc(s.login)}</code></td>
        <td><small>${esc(s.phone||'—')}</small></td>
        <td><small>${esc(s.guardian||'—')}</small></td>
        <td><small>${fmtDate(s.birth_date)}</small></td>
        <td><span class="badge b-purple">${esc(s.graduated_group||'—')}</span></td>
        <td><small>${fmtDate(s.created)}</small>
            ${s.end_date?`<br><small style="color:var(--muted)">Завершил: ${fmtDate(s.end_date)}</small>`:''}</td>
        <td><button class="btn btn-sm btn-outline"
          onclick="askConfirm('Восстановить студента из архива?',()=>restoreStudent('${s.id}'))">
          <i class="fa-solid fa-rotate-left"></i> Восстановить</button></td>
      </tr>`;
    }).join('');
  } catch(e) { toast('error', e.message); }
}

async function restoreStudent(id) {
  try {
    await api('users', 'PUT', { restore: 1 }, `&id=${id}`);
    toast('success', 'Студент восстановлен из архива');
    renderArchive(); updateBadges();
  } catch(e) { toast('error', e.message); }
}

// ── Преподаватели ─────────────────────────────────────────
function renderTeachers() {
  if (session.role !== 'admin') return;
  document.getElementById('teachers-grid').innerHTML = teachers.length
    ? teachers.map(t => {
        const initials = ((t.fname||'?')[0] + ((t.lname||'')[0]||'')).toUpperCase();
        const subs = (t.subjects||'').split(',').filter(Boolean);
        return `<div class="c-card">
          <div class="c-card-header">
            <div class="av av-lg" style="background:${safeColor(t.av_color,avColor(t.fname))}">${initials}</div>
            <div><div class="c-card-title">${esc(t.fname)} ${esc(t.lname)}</div></div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
            ${subs.map(s=>`<span class="badge b-blue" style="font-size:9px">${esc(s.trim())}</span>`).join('')
              || '<span style="color:var(--muted);font-size:11px">Предметы не назначены</span>'}
          </div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:8px">
            <i class="fa-solid fa-phone"></i> ${esc(t.phone||'—')}
          </div>
          <div class="c-card-actions">
            <button class="btn btn-sm btn-outline" onclick="openUserModal('teacher','${t.id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-danger"
              onclick="askConfirm('Архивировать преподавателя?',()=>archiveUser('${t.id}'))">
              <i class="fa-solid fa-archive"></i></button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty"><div class="empty-msg">Преподавателей нет</div></div>';
}

async function archiveUser(id) {
  try {
    await api('users', 'DELETE', { archive: 1 }, `&id=${id}`);
    students = students.filter(s => !sameId(s.id, id));
    teachers = teachers.filter(t => !sameId(t.id, id));
    renderStudents(); renderTeachers(); updateBadges(); toast('info', 'Архивирован');
  } catch(e) { toast('error', e.message); }
}

// ── Форма добавления/редактирования пользователя ──────────
function openUserModal(role = 'student', id = null) {
  const isStudent = role === 'student';
  const u = id ? [...students,...teachers].find(x => sameId(x.id, id)) : null;
  clearValidation('ov-user');
  document.getElementById('user-id').value          = u?.id || '';
  document.getElementById('user-role-hidden').value = u?.role || role;
  document.getElementById('user-modal-title').textContent = u
    ? (isStudent ? 'Редактировать студента' : 'Редактировать преподавателя')
    : (isStudent ? 'Добавить студента'      : 'Добавить преподавателя');

  // Поля, специфичные для роли
  const guardianGrp      = document.getElementById('user-guardian-group');
  const guardianPhoneGrp = document.getElementById('user-guardian-phone-group');
  const monthsGrp        = document.getElementById('user-months-group');
  const payGrp           = document.getElementById('user-payment-amount-group');
  const subsWrap         = document.getElementById('user-subjects-wrap');

  if (guardianGrp)      guardianGrp.style.display      = isStudent ? '' : 'none';
  if (guardianPhoneGrp) guardianPhoneGrp.style.display  = isStudent ? '' : 'none';
  if (monthsGrp)        monthsGrp.style.display         = isStudent ? '' : 'none';
  if (payGrp)           payGrp.style.display            = isStudent ? '' : 'none';
  if (subsWrap) {
    subsWrap.style.display = role === 'teacher' ? '' : 'none';
    renderSubjectsPicker((u?.subjects||'').split(',').filter(Boolean));
  }

  document.getElementById('user-fname').value   = u?.fname || '';
  document.getElementById('user-lname').value   = u?.lname || '';
  document.getElementById('user-phone').value   = u?.phone || '';
  document.getElementById('user-guardian').value= u?.guardian || '';
  const gpEl = document.getElementById('user-guardian-phone');
  if (gpEl) gpEl.value = u?.guardian_phone || '';

  // Срок обучения: если есть end_date — показываем оставшееся кол-во месяцев
  const mEl = document.getElementById('user-months');
  if (mEl) {
    if (u?.end_date) {
      const diff = Math.round((parseLocalDate(u.end_date) - new Date()) / (1000*60*60*24*30));
      mEl.value = diff > 0 ? diff : '';
    } else {
      mEl.value = '';
    }
  }
  document.getElementById('user-birth').value    = u?.birth_date || '';
  document.getElementById('user-end-date').value = u?.end_date   || '';
  document.getElementById('user-login').value    = u?.login      || '';
  document.getElementById('user-pass').value     = '';
  const passHint = document.getElementById('user-pass-hint');
  if (passHint) passHint.style.display = id ? '' : 'none';

  // Сумма оплаты — информационный калькулятор среднего чека
  const amtEl = document.getElementById('user-payment-amount');
  if (amtEl) amtEl.value = '';
  updateAvgCheckHint();

  document.getElementById('ov-user').classList.add('show');
}

function updateAvgCheckHint() {
  const hint    = document.getElementById('user-avg-check-hint'); if (!hint) return;
  const months  = Math.max(0, parseInt(document.getElementById('user-months')?.value)||0);
  const amount  = Math.max(0, parseFloat(document.getElementById('user-payment-amount')?.value)||0);
  hint.textContent = (months > 0 && amount > 0) ? `${fmtMoney(Math.round(amount/months))}/мес` : '—';
}

async function saveUser() {
  const id   = document.getElementById('user-id').value;
  const role = document.getElementById('user-role-hidden').value;
  const pass = document.getElementById('user-pass').value;

  // Валидация с визуальным выделением полей
  const fields = [
    { id: 'user-fname', rules: ['required'],              label: 'Имя' },
    { id: 'user-login', rules: ['required', 'login'],     label: 'Логин' },
    { id: 'user-phone', rules: ['phone'],                 label: 'Телефон' },
  ];
  // Пароль обязателен только при создании нового пользователя
  if (!id) fields.push({ id: 'user-pass', rules: ['required', 'minlen:4'], label: 'Пароль' });
  if (!validateForm(fields)) return;

  const fname   = document.getElementById('user-fname').value.trim();
  const lname   = document.getElementById('user-lname').value.trim();
  const phone   = document.getElementById('user-phone').value.trim();
  const guardian= document.getElementById('user-guardian').value.trim();
  const birth   = document.getElementById('user-birth').value;
  const login   = document.getElementById('user-login').value.trim();
  const endDate = document.getElementById('user-end-date').value;
  const selectedSubs = getSelectedSubjectsFromPicker();

  // Пересчёт end_date из числа месяцев (только если явно указано)
  let finalEndDate = endDate || null;
  const monthsInput = document.getElementById('user-months');
  const monthsVal   = monthsInput?.value !== '' ? parseInt(monthsInput.value) : NaN;
  if (!isNaN(monthsVal) && monthsVal > 0) {
    const d = new Date();
    d.setMonth(d.getMonth() + monthsVal);
    finalEndDate = toLocalDateStr(d);
    const hiddenEnd = document.getElementById('user-end-date');
    if (hiddenEnd) hiddenEnd.value = finalEndDate;
  }

  const guardianPhone = document.getElementById('user-guardian-phone')?.value || '';
  const body = { fname, lname, phone, guardian, guardian_phone: guardianPhone,
    role, birth_date: birth||null, end_date: finalEndDate, login, subjects: selectedSubs.join(',') };
  // Пароль отправляем ТОЛЬКО если непустой — иначе бэкенд затрёт хэш
  if (pass) body.pass = pass;

  setModalLoading('user', true, 'Сохранение...');
  try {
    if (id) {
      await api('users', 'PUT', body, `&id=${id}`);
      const upd = { ...(students.find(s=>sameId(s.id,id)) || teachers.find(t=>sameId(t.id,id)) || {}), ...body };
      students = students.map(s => sameId(s.id,id) ? upd : s);
      teachers = teachers.map(t => sameId(t.id,id) ? upd : t);
      toast('success', 'Данные сохранены');
    } else {
      const r    = await api('users', 'POST', body);
      const newU = { id: r.id, login: r.login, fname, lname, phone, guardian, role,
        birth_date: birth||null, end_date: finalEndDate||null, av_color:'#2563eb', subjects: selectedSubs.join(',') };
      if (role==='student') { students.push(newU); toast('success', `Добавлен. Логин: ${r.login}`); }
      if (role==='teacher') { teachers.push(newU); toast('success', 'Преподаватель добавлен'); }
    }
    closeModal('user');
    // Авторефреш нужного списка с сохранением текущей сортировки
    if (role==='student') renderStudents();
    if (role==='teacher') renderTeachers();
    updateBadges();
  } catch(e) { toast('error', e.message); }
  finally { setModalLoading('user', false); }
}
