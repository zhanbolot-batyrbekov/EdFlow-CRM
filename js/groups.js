// ═══════════════════════════════════════════════════════════
// groups.js  —  Группы, детальная карточка группы, курсы
//               Зависит от: utils.js, state.js, api-client.js,
//                           ui.js, validation.js, attendance.js
// ═══════════════════════════════════════════════════════════

// ── Список групп ──────────────────────────────────────────
function renderGroups() {
  const chips = document.getElementById('course-filter-chips');
  if (chips) chips.innerHTML = courses.map(c =>
    `<div class="chip${groupFilter===String(c.id)?' active':''}" onclick="filterGroups('${c.id}',this)">
      <i class="fa-solid ${safeIconClass(c.icon)}"></i> ${esc(c.name)}</div>`).join('');

  const hdrBtn = document.getElementById('groups-header-btn');
  if (hdrBtn) hdrBtn.innerHTML = session.role === 'admin'
    ? `<button class="btn btn-primary" onclick="openGroupModal()"><i class="fa-solid fa-plus"></i> Создать группу</button>` : '';

  let filtered = visibleGroups();
  if (groupFilter !== 'all') filtered = filtered.filter(g => sameId(g.course_id, groupFilter));

  const grid = document.getElementById('groups-grid');
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-icon"><i class="fa-solid fa-people-group" style="font-size:52px;color:var(--muted)"></i></div>
      <div class="empty-msg">Нет групп</div>
      ${session.role==='admin'?'<button class="btn btn-primary" onclick="openGroupModal()"><i class="fa-solid fa-plus"></i> Создать</button>':''}
    </div>`;
    return;
  }
  grid.innerHTML = filtered.map(g => {
    const color = safeColor(g.course_color, '#2563eb'), icon = safeIconClass(g.course_icon, 'fa-book');
    const pct   = g.max_students > 0 ? Math.round((g.student_count||0) / g.max_students * 100) : 0;
    return `<div class="c-card" onclick="openGroupDetail(${g.id})">
      <div class="c-card-header">
        <div class="c-card-icon" style="background:${color}"><i class="fa-solid ${icon}"></i></div>
        <div><div class="c-card-title">${esc(g.name)}</div>
             <div class="c-card-sub">${esc(g.course_name||'')}${g.level?' · '+esc(g.level):''}</div></div>
      </div>
      <div class="c-card-stats">
        <div class="c-stat"><i class="fa-solid fa-users"></i> ${g.student_count||0}/${g.max_students}</div>
        ${session.role==='admin'?`<div class="c-stat"><i class="fa-solid fa-money-bill"></i> ${fmtMoney(g.price||0)}</div>`:''}
        ${g.teacher_name?`<div class="c-stat"><i class="fa-solid fa-chalkboard-user"></i> ${esc(g.teacher_name)}</div>`:''}
      </div>
      <div style="background:var(--surface2);border-radius:99px;height:6px;overflow:hidden;margin-bottom:10px">
        <div style="width:${pct}%;height:100%;background:linear-gradient(135deg,${color},${color}88);border-radius:99px"></div>
      </div>
      <div class="c-card-actions" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-primary" onclick="openGroupDetail(${g.id})"><i class="fa-solid fa-eye"></i> Открыть</button>
        ${session.role==='admin'?`
          <button class="btn btn-sm btn-outline" onclick="openGroupModal(${g.id})"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-sm btn-danger" onclick="askConfirm('Архивировать группу?',()=>archiveGroup(${g.id}))">
            <i class="fa-solid fa-archive"></i></button>`:''}
      </div>
    </div>`;
  }).join('');
}

function filterGroups(f, el) {
  groupFilter = f;
  document.querySelectorAll('#p-groups .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderGroups();
}

async function archiveGroup(id) {
  try {
    await api('groups', 'DELETE', null, `&id=${id}`);
    groups = groups.map(g => sameId(g.id, id) ? { ...g, is_active: 0 } : g);
    renderGroups(); updateBadges(); toast('info', 'Группа архивирована');
  } catch (e) { toast('error', e.message); }
}

// ── Детальная карточка группы ─────────────────────────────
async function openGroupDetail(gid) {
  const g = groups.find(x => sameId(x.id, gid)); if (!g) return;
  if (session.role === 'teacher' && !sameId(g.teacher_id, session.id)) {
    toast('error', 'Нет доступа к этой группе'); return;
  }
  currentGroupId = gid;
  document.getElementById('gd-title').textContent = g.name;
  document.getElementById('gd-sub').textContent =
    (g.course_name||'') + (g.level ? ' · '+g.level : '') + (g.teacher_name ? ' · '+g.teacher_name : '');
  document.getElementById('gd-header-btns').innerHTML = session.role === 'admin' ? `
    <button class="btn btn-outline btn-sm" onclick="openGroupModal(${gid})"><i class="fa-solid fa-pen"></i> Редактировать</button>
    <button class="btn btn-primary btn-sm" onclick="openAddToGroupModal(${gid})"><i class="fa-solid fa-user-plus"></i> Добавить студента</button>` : '';
  goPage('group-detail', null, g.name);
  renderGroupDetail(gid, 'students');
}

async function renderGroupDetail(gid, tab = 'students') {
  const isAdmin = session.role === 'admin';
  if (tab === 'payments' && !isAdmin) tab = 'students';
  document.getElementById('group-detail-content').innerHTML = `
    <div class="gd-tabs">
      <div class="gd-tab${tab==='students'?' active':''}" onclick="renderGroupDetail(${gid},'students')"><i class="fa-solid fa-users"></i> Студенты</div>
      <div class="gd-tab${tab==='journal'?' active':''}"  onclick="renderGroupDetail(${gid},'journal')"><i class="fa-solid fa-calendar-check"></i> Журнал</div>
      <div class="gd-tab${tab==='history'?' active':''}"  onclick="renderGroupDetail(${gid},'history')"><i class="fa-solid fa-clock-rotate-left"></i> История</div>
      ${isAdmin?`<div class="gd-tab${tab==='payments'?' active':''}" onclick="renderGroupDetail(${gid},'payments')"><i class="fa-solid fa-money-bill"></i> Оплата</div>`:''}
      <div class="gd-tab${tab==='schedule'?' active':''}"  onclick="renderGroupDetail(${gid},'schedule')"><i class="fa-solid fa-clock"></i> Расписание</div>
    </div>
    <div id="gd-tab-content"><div style="text-align:center;padding:30px;color:var(--muted)"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div></div>`;
  try {
    if (tab === 'students') await renderGdStudents(gid, curMonth());
    if (tab === 'journal')  await renderGdJournal(gid);
    if (tab === 'history')  await renderGdHistory(gid, curMonth());
    if (tab === 'payments' && isAdmin) await renderGdPayments(gid, curMonth());
    if (tab === 'schedule') await renderGdSchedule(gid);
  } catch (e) {
    document.getElementById('gd-tab-content').innerHTML =
      `<div class="empty"><div class="empty-msg">Ошибка: ${esc(e.message)}</div></div>`;
  }
}

// ── Студенты группы (вкладка Students) ───────────────────
async function renderGdStudents(gid, month) {
  const members = await api('group_students', 'GET', null, `&id=${gid}&month=${month}`);
  const g       = groups.find(x => sameId(x.id, gid));
  const price   = parseFloat(g?.price || 0);
  const isAdmin = session.role === 'admin';
  const { total, avgCheck, paidCount, partialCount } = computeGroupFinance(members, price);

  let html = `<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
    <div class="c-stat"><i class="fa-solid fa-users" style="color:var(--accent)"></i> ${total} студентов</div>
    ${isAdmin ? `
    <div class="c-stat"><i class="fa-solid fa-receipt" style="color:var(--yellow)"></i> Ср.чек: ${fmtMoney(avgCheck)}</div>
    <div class="c-stat"><i class="fa-solid fa-check" style="color:var(--green)"></i> ${paidCount} оплатили${partialCount>0?` (частично: ${partialCount})`:''}</div>
    ${g?`<div class="c-stat"><i class="fa-solid fa-tag"></i> ${fmtMoney(g.price||0)}/мес</div>`:''}
    <button class="btn btn-sm btn-success" onclick="exportGroupStudents(${gid})"><i class="fa-solid fa-file-excel"></i> Экспорт</button>` : ''}
  </div>`;

  if (!total) {
    html += `<div class="empty"><div class="empty-msg">Студентов нет</div>
      ${isAdmin?`<button class="btn btn-primary" onclick="openAddToGroupModal(${gid})"><i class="fa-solid fa-user-plus"></i> Добавить</button>`:''}</div>`;
    document.getElementById('gd-tab-content').innerHTML = html;
    return;
  }

  html += `<div class="table-wrap"><table>
    <thead><tr>
      <th>Студент</th>
      ${isAdmin ? '<th>Логин</th><th>Телефон</th><th>Опекун</th><th>Дата рожд.</th><th>Срок обуч.</th>' : ''}
      <th>Посещ.</th><th></th>
    </tr></thead><tbody>
  ${(members||[]).map(m => {
    const pres  = parseInt(m.present_days)||0, tot = parseInt(m.total_days)||0;
    const pct   = tot > 0 ? Math.round(pres/tot*100) : null;
    const init  = ((m.fname||'?')[0] + ((m.lname||'')[0]||'')).toUpperCase();
    const expir = m.end_date && parseLocalDate(m.end_date) <= new Date(Date.now()+30*24*3600*1000);
    return `<tr>
      <td><div class="person-cell">
        <div class="av" style="background:${safeColor(m.av_color,avColor(m.fname))}">${init}</div>
        <div class="p-name">${esc(m.fname)} ${esc(m.lname)}</div>
      </div></td>
      ${isAdmin ? `
      <td><code style="background:var(--surface2);padding:2px 6px;border-radius:5px;font-size:10px">${esc(m.login)}</code></td>
      <td><small>${esc(m.phone||'—')}</small></td>
      <td><small>${esc(m.guardian||'—')}${m.guardian_phone?`<br><span style="color:var(--muted)">${esc(m.guardian_phone)}</span>`:''}</small></td>
      <td><small>${fmtDate(m.birth_date)}</small></td>
      <td><small class="${expir?'text-warning':''}">${fmtDate(m.end_date)}</small></td>` : ''}
      <td>${pct!==null?`<span class="badge ${pct>=75?'b-green':pct>=50?'b-yellow':'b-red'}">${pct}%</span>`:'—'}</td>
      <td><div class="actions-cell">
        ${isAdmin?`<button class="btn btn-icon btn-danger" title="Убрать из группы"
          onclick="askConfirm('Убрать студента из группы?',()=>removeFromGroup(${gid},'${m.id}'))">
          <i class="fa-solid fa-user-minus"></i></button>`:''}
      </div></td>
    </tr>`;
  }).join('')}
  </tbody></table></div>`;
  document.getElementById('gd-tab-content').innerHTML = html;
}

async function removeFromGroup(gid, sid) {
  try {
    await api('group_students', 'DELETE', null, `&group_id=${gid}&student_id=${sid}`);
    // Обновляем счётчик студентов в локальном стейте (без лишнего GET /groups)
    groups = groups.map(g => sameId(g.id, gid) ? { ...g, student_count: Math.max(0, (parseInt(g.student_count)||1)-1) } : g);
    toast('info', 'Убран из группы');
    renderGdStudents(gid, curMonth()); // авторефреш вкладки
  } catch (e) { toast('error', e.message); }
}

// ── Добавить студента в группу ────────────────────────────
function openAddToGroupModal(gid) {
  currentGroupId = gid;
  document.getElementById('atg-search').value = '';
  allStudentsForAtg = students.filter(s => !s.is_graduated);
  renderAtgList(allStudentsForAtg, gid);
  document.getElementById('ov-add-to-group').classList.add('show');
}
function filterAtgList(q) {
  const f = q ? allStudentsForAtg.filter(s =>
    (s.fname+' '+s.lname+' '+s.login).toLowerCase().includes(q.toLowerCase())) : allStudentsForAtg;
  renderAtgList(f, currentGroupId);
}
function renderAtgList(list, gid) {
  document.getElementById('atg-list').innerHTML = list.slice(0, 20).map(s => {
    const init = ((s.fname||'?')[0] + ((s.lname||'')[0]||'')).toUpperCase();
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1.5px solid var(--border);border-radius:10px;background:var(--surface2)">
      <div class="av" style="background:${safeColor(s.av_color,avColor(s.fname))}">${init}</div>
      <div style="flex:1"><div style="font-weight:600;font-size:13px">${esc(s.fname)} ${esc(s.lname)}</div>
        <div style="font-size:11px;color:var(--muted)">${esc(s.login)} · ${fmtDate(s.birth_date)}</div></div>
      <button class="btn btn-sm btn-primary" onclick="addStudentToGroup('${s.id}',${gid})"><i class="fa-solid fa-plus"></i></button>
    </div>`;
  }).join('');
}
async function addStudentToGroup(sid, gid) {
  try {
    await api('group_students', 'POST', { group_id: gid, student_id: sid });
    toast('success', 'Студент добавлен');
    closeModal('add-to-group');
    // Обновляем счётчик студентов локально — без тяжёлого GET /groups
    groups = groups.map(g => sameId(g.id, gid) ? { ...g, student_count: (parseInt(g.student_count)||0)+1 } : g);
    renderGroups();
    if (currentPage === 'group-detail') renderGdStudents(gid, curMonth());
  } catch (e) { toast('error', e.message); }
}

// ── Форма создания/редактирования группы ──────────────────
function openGroupModal(id = null) {
  const g = id ? groups.find(x => sameId(x.id, id)) : null;
  clearValidation('ov-group');
  document.getElementById('group-id').value = g?.id || '';
  document.getElementById('group-modal-title').textContent = g ? 'Редактировать группу' : 'Создать группу';
  document.getElementById('group-name').value  = g?.name || '';
  document.getElementById('group-level').value = g?.level || '';
  document.getElementById('group-max').value   = g?.max_students || 20;
  document.getElementById('group-price').value = g?.price || 0;
  document.getElementById('group-course').innerHTML  =
    courses.map(c => `<option value="${c.id}"${sameId(g?.course_id,c.id)?' selected':''}>${esc(c.name)}</option>`).join('');
  document.getElementById('group-teacher').innerHTML =
    '<option value="">— Не назначен —</option>' +
    teachers.map(t => `<option value="${t.id}"${sameId(g?.teacher_id,t.id)?' selected':''}>${esc(t.fname)} ${esc(t.lname)}</option>`).join('');
  document.getElementById('ov-group').classList.add('show');
}

async function saveGroup() {
  if (!validateForm([
    { id: 'group-name',   rules: ['required'],        label: 'Название' },
    { id: 'group-course', rules: ['required'],        label: 'Курс' },
    { id: 'group-price',  rules: ['required', 'pos0'],label: 'Цена' },
    { id: 'group-max',    rules: ['required', 'posint'], label: 'Макс. студентов' },
  ])) return;

  const id  = document.getElementById('group-id').value;
  const body = {
    name:         document.getElementById('group-name').value.trim(),
    course_id:    document.getElementById('group-course').value,
    teacher_id:   document.getElementById('group-teacher').value || null,
    price:        Math.max(0, parseFloat(document.getElementById('group-price').value) || 0),
    level:        document.getElementById('group-level').value,
    max_students: Math.max(1, parseInt(document.getElementById('group-max').value) || 20),
  };
  setModalLoading('group', true);
  try {
    const course  = courses.find(c => sameId(c.id, body.course_id));
    const teacher = body.teacher_id ? teachers.find(t => sameId(t.id, body.teacher_id)) : null;
    const joined  = {
      course_name:  course?.name  || null,
      course_color: course?.color || null,
      course_icon:  course?.icon  || null,
      teacher_name: teacher ? `${teacher.fname||''} ${teacher.lname||''}`.trim() : null,
    };
    if (id) {
      await api('groups', 'PUT', body, `&id=${id}`);
      groups = groups.map(g => sameId(g.id, id) ? { ...g, ...body, ...joined } : g);
    } else {
      const r = await api('groups', 'POST', body);
      groups.push({ id: r.id, ...body, is_active: 1, student_count: 0, ...joined });
    }
    closeModal('group'); renderGroups(); updateBadges(); toast('success', 'Группа сохранена');
  } catch (e) { toast('error', e.message); }
  finally { setModalLoading('group', false); }
}

// ── Курсы ─────────────────────────────────────────────────
function renderCourses() {
  if (session.role !== 'admin') return;
  document.getElementById('courses-grid').innerHTML = courses.length
    ? courses.map(c => `
      <div class="c-card">
        <div class="c-card-header">
          <div class="c-card-icon" style="background:${safeColor(c.color)}"><i class="fa-solid ${safeIconClass(c.icon)}"></i></div>
          <div><div class="c-card-title">${esc(c.name)}</div>
               <div class="c-card-sub">${esc(c.description||'')}</div></div>
        </div>
        <div class="c-card-actions">
          <button class="btn btn-sm btn-outline" onclick="openCourseModal('${c.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-sm btn-danger"  onclick="askConfirm('Удалить курс?',()=>deleteCourse('${c.id}'))"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`)
    .join('')
    : '<div class="empty"><div class="empty-msg">Курсов пока нет</div></div>';
}

function openCourseModal(id = null) {
  const c = id ? courses.find(x => sameId(x.id, id)) : null;
  clearValidation('ov-course');
  document.getElementById('course-id').value   = c?.id || '';
  document.getElementById('course-name').value = c?.name || '';
  document.getElementById('course-desc').value = c?.description || '';
  // Цвет
  const cp = document.getElementById('course-color-picker');
  if (cp) cp.querySelectorAll('div[data-color]').forEach(d => {
    d.style.outline = safeColor(d.dataset.color,'') === safeColor(c?.color,'') ? '3px solid #fff' : '3px solid transparent';
  });
  // Иконка
  const ip = document.getElementById('course-icon-picker');
  if (ip) ip.querySelectorAll('div[data-icon]').forEach(d => {
    const active = d.dataset.icon === (c?.icon || COURSE_ICONS[0]);
    d.style.background = active ? 'var(--accent)' : 'var(--surface2)';
    const i = d.querySelector('i');
    if (i) i.style.color = active ? '#fff' : 'var(--text2)';
  });
  document.getElementById('ov-course').classList.add('show');
}
function selectCourseColor(c, el) {
  document.querySelectorAll('#course-color-picker div').forEach(d => d.style.outline = '3px solid transparent');
  el.style.outline = '3px solid #fff';
}
function selectCourseIcon(ic, el) {
  document.querySelectorAll('#course-icon-picker div').forEach(d => {
    d.style.background = 'var(--surface2)';
    const i = d.querySelector('i'); if (i) i.style.color = 'var(--text2)';
  });
  el.style.background = 'var(--accent)';
  const i = el.querySelector('i'); if (i) i.style.color = '#fff';
}

async function saveCourse() {
  if (!validateForm([{ id: 'course-name', rules: ['required'], label: 'Название' }])) return;
  const id    = document.getElementById('course-id').value;
  const name  = document.getElementById('course-name').value.trim();
  const color = document.querySelector('#course-color-picker div[style*="3px solid #fff"]')?.dataset.color || COURSE_COLORS[0];
  const icon  = document.querySelector('#course-icon-picker div[style*="var(--accent)"]')?.dataset.icon  || COURSE_ICONS[0];
  const body  = { name, description: document.getElementById('course-desc').value, color, icon };
  setModalLoading('course', true);
  try {
    if (id) {
      await api('courses', 'PUT', body, `&id=${id}`);
      courses = courses.map(c => sameId(c.id, id) ? { ...c, ...body } : c);
      // Каскадно обновляем denormalized-поля курса в группах
      groups = groups.map(g => sameId(g.course_id, id)
        ? { ...g, course_name: body.name, course_color: body.color, course_icon: body.icon } : g);
    } else {
      const r = await api('courses', 'POST', body);
      courses.push({ id: r.id, ...body });
    }
    closeModal('course'); renderCourses(); renderGroups(); toast('success', 'Курс сохранён');
  } catch (e) { toast('error', e.message); }
  finally { setModalLoading('course', false); }
}

async function deleteCourse(id) {
  try {
    await api('courses', 'DELETE', null, `&id=${id}`);
    courses = courses.filter(c => !sameId(c.id, id));
    groups  = groups.filter(g => !sameId(g.course_id, id));
    renderCourses(); renderGroups(); toast('info', 'Удалено');
  } catch (e) { toast('error', e.message); }
}

// ── Экспорт студентов группы в CSV ────────────────────────
async function exportGroupStudents(gid) {
  const g = groups.find(x => sameId(x.id, gid));
  try {
    const members = await api('group_students', 'GET', null, `&id=${gid}&month=${curMonth()}`);
    const hdr = ['Фамилия','Имя','Телефон','Опекун','Тел. опекуна','Дата рождения','Срок обучения'];
    const rows = (members||[]).map(m =>
      [m.lname,m.fname,m.phone,m.guardian,m.guardian_phone,m.birth_date,m.end_date].map(v=>`"${String(v||'').replace(/"/g,'""')}"`)
    );
    const csv = [hdr,...rows].map(r=>r.join(',')).join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom+csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    if (lastExportBlobUrl) URL.revokeObjectURL(lastExportBlobUrl);
    lastExportBlobUrl = url;
    const a = document.createElement('a');
    a.href = url; a.download = `students_${(g?.name||gid).replace(/[^a-zA-Zа-яА-Я0-9]/g,'_')}_${curMonth()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    toast('success', 'Экспорт завершён');
  } catch (e) { toast('error', e.message); }
}
