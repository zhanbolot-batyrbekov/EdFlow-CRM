// ═══════════════════════════════════════════════════════════
// schedule.js  —  Расписание (страница + group-detail вкладка)
//                 Зависит от: utils.js, state.js, api-client.js,
//                             ui.js, validation.js
// ═══════════════════════════════════════════════════════════

async function renderSchedule() {
  const selHtml = `<select class="form-input" id="sched-view-group" style="width:200px"
    onchange="loadScheduleView()">
    <option value="">— Все группы —</option>
    ${visibleGroups().map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}
  </select>`;
  document.getElementById('schedule-filter-row').innerHTML = selHtml +
    (session.role === 'admin'
      ? ` <button class="btn btn-primary" onclick="openScheduleModal()">
            <i class="fa-solid fa-plus"></i> Добавить</button>` : '');
  await loadScheduleView();
}

async function loadScheduleView() {
  const gid    = document.getElementById('sched-view-group')?.value || '';
  const slots  = await api('schedule', 'GET', null, gid ? `&group_id=${gid}` : '');
  const byDay  = { 1:[],2:[],3:[],4:[],5:[],6:[] };
  (slots||[]).forEach(s => { if (byDay[s.day_of_week]) byDay[s.day_of_week].push(s); });
  const canEdit = session.role === 'admin';

  document.getElementById('schedule-week').innerHTML = [1,2,3,4,5,6].map(d => `
    <div class="sched-day-col">
      <div class="sched-day-head">${DAYS_SHORT[d]}<br><small style="opacity:.7">${DAYS_RU[d]}</small></div>
      <div class="sched-day-body">
        ${byDay[d].map(s => `
          <div class="sched-slot"
            style="border-color:${safeColor(s.course_color,'var(--accent-soft)')};background:${safeColor(s.course_color,'#2563eb')}18"
            onclick="${canEdit?`openScheduleModal(${s.group_id},${s.id})`:''}">
            <div class="sched-slot-time">${s.start_time?.slice(0,5)}–${s.end_time?.slice(0,5)}</div>
            <div class="sched-slot-name">${esc(s.group_name||'')}</div>
            <div class="sched-slot-teacher">${s.subject?esc(s.subject)+' · ':''}${esc(s.teacher_name||s.course_name||'')}</div>
            ${s.room?`<div class="sched-slot-teacher">каб. ${esc(s.room)}</div>`:''}
          </div>`).join('')}
        ${canEdit?`<button class="sched-add-btn" onclick="openScheduleModal(${gid||'null'},null,${d})">
          <i class="fa-solid fa-plus"></i></button>`:''}
      </div>
    </div>`).join('');
}

// ── Расписание: group-detail вкладка ──────────────────────
async function renderGdSchedule(gid) {
  const slots   = await api('schedule', 'GET', null, `&group_id=${gid}`);
  const canEdit = session.role === 'admin';
  let html = canEdit
    ? `<div style="margin-bottom:12px">
        <button class="btn btn-primary btn-sm" onclick="openScheduleModal(${gid})">
          <i class="fa-solid fa-plus"></i> Добавить</button></div>` : '';
  if (!(slots||[]).length) {
    html += '<div class="empty"><div class="empty-msg">Расписание не настроено</div></div>';
    document.getElementById('gd-tab-content').innerHTML = html;
    return;
  }
  html += `<div style="display:flex;flex-direction:column;gap:8px">
  ${slots.map(s => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--surface2);border:1.5px solid var(--border);border-radius:10px">
      <div style="background:var(--accent-soft);color:var(--accent);border-radius:8px;padding:8px 12px;font-weight:700;font-size:12px;flex-shrink:0;text-align:center;min-width:64px">
        ${DAYS_SHORT[s.day_of_week]||'?'}<br>${s.start_time?.slice(0,5)}–${s.end_time?.slice(0,5)}
      </div>
      <div style="flex:1">
        <div style="font-weight:600">${DAYS_RU[s.day_of_week]||'?'}</div>
        <div style="font-size:11px;color:var(--muted)">
          ${s.subject?esc(s.subject)+' · ':''}
          ${s.teacher_name?'👤 '+esc(s.teacher_name):''}
          ${s.room?' · каб.'+esc(s.room):''}
        </div>
      </div>
      ${canEdit?`<div class="actions-cell">
        <button class="btn btn-icon btn-outline" onclick="openScheduleModal(${gid},${s.id})"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-icon btn-danger"  onclick="delSchedSlot(${s.id},${gid})"><i class="fa-solid fa-trash"></i></button>
      </div>`:''}</div>`).join('')}
  </div>`;
  document.getElementById('gd-tab-content').innerHTML = html;
}

// ── Форма создания/редактирования слота ───────────────────
function openScheduleModal(gid = null, slotId = null, dayPreset = null) {
  if (session.role !== 'admin') return;
  clearValidation('ov-schedule');
  document.getElementById('sched-id').value = slotId || '';
  document.getElementById('sched-modal-title').textContent = slotId ? 'Редактировать' : 'Добавить занятие';
  document.getElementById('sched-del-btn').style.display = slotId ? 'inline-flex' : 'none';
  const gSel = document.getElementById('sched-group');
  gSel.innerHTML = visibleGroups().map(g =>
    `<option value="${g.id}"${sameId(g.id,gid)?' selected':''}>${esc(g.name)}</option>`).join('');
  const tSel = document.getElementById('sched-teacher');
  tSel.innerHTML = '<option value="">— Не назначен —</option>' +
    teachers.map(t => `<option value="${t.id}">${esc(t.fname)} ${esc(t.lname)}</option>`).join('');
  if (dayPreset) document.getElementById('sched-day').value = dayPreset;
  document.getElementById('ov-schedule').classList.add('show');
}

async function saveScheduleSlot() {
  if (!validateForm([
    { id: 'sched-group', rules: ['required'], label: 'Группа' },
    { id: 'sched-day',   rules: ['required'], label: 'День' },
    { id: 'sched-start', rules: ['required'], label: 'Начало' },
    { id: 'sched-end',   rules: ['required'], label: 'Конец' },
  ])) return;

  const id       = document.getElementById('sched-id').value;
  const gid      = document.getElementById('sched-group').value;
  const body     = {
    day_of_week: document.getElementById('sched-day').value,
    start_time:  document.getElementById('sched-start').value,
    end_time:    document.getElementById('sched-end').value,
    room:        document.getElementById('sched-room').value,
    subject:     document.getElementById('sched-subject').value,
    teacher_id:  document.getElementById('sched-teacher').value || null,
  };
  if (!id) body.group_id = gid;

  setModalLoading('schedule', true);
  try {
    if (id) await api('schedule', 'PUT', body, `&id=${id}`);
    else    await api('schedule', 'POST', body);
    closeModal('schedule');
    toast('success', 'Расписание сохранено');
    // Авторефреш: нужный контекст в зависимости от текущей страницы
    if (currentPage === 'schedule')     loadScheduleView();
    if (currentPage === 'group-detail') renderGdSchedule(currentGroupId);
  } catch(e) { toast('error', e.message); }
  finally { setModalLoading('schedule', false); }
}

async function delSchedSlot(id, gid) {
  try {
    await api('schedule', 'DELETE', null, `&id=${id}`);
    toast('info', 'Удалено');
    if (currentPage === 'schedule')     loadScheduleView();
    if (currentPage === 'group-detail') renderGdSchedule(gid || currentGroupId);
  } catch(e) { toast('error', e.message); }
}

async function deleteScheduleSlot() {
  const id = document.getElementById('sched-id').value;
  await delSchedSlot(id, currentGroupId);
  closeModal('schedule');
}
