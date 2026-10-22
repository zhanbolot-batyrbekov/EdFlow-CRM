// ═══════════════════════════════════════════════════════════
// attendance.js  —  3-state посещаемость + Журнал + История
//                   Зависит от: utils.js, state.js, api-client.js, ui.js
// ═══════════════════════════════════════════════════════════

// ── Три состояния: unmarked / present / absent ─────────────
// нет записи в БД → unmarked (пусто), а не "присутствовал"
function attState(val) {
  if (val === undefined || val === null) return 'unmarked';
  const p = typeof val === 'object' ? val.present : val;
  return p ? 'present' : 'absent';
}
function attIcon(state) {
  return state === 'present' ? 'fa-check' : state === 'absent' ? 'fa-xmark' : 'fa-minus';
}
function attBtnHtml(state, extraAttrs = '') {
  return `<button class="att-btn ${state}" ${extraAttrs} onclick="toggleAttBtn(this)"><i class="fa-solid ${attIcon(state)}"></i></button>`;
}
function attBadgeHtml(state) {
  if (state === 'present') return '<span class="badge b-green">✓</span>';
  if (state === 'absent')  return '<span class="badge b-red">✗</span>';
  return '<span class="badge" style="background:var(--surface2);color:var(--muted)">—</span>';
}
// Цикл клика: unmarked → present → absent → unmarked
function toggleAttBtn(btn) {
  const cur  = btn.classList.contains('present') ? 'present' : btn.classList.contains('absent') ? 'absent' : 'unmarked';
  const next = cur === 'unmarked' ? 'present' : cur === 'present' ? 'absent' : 'unmarked';
  btn.className  = 'att-btn ' + next;
  btn.innerHTML  = `<i class="fa-solid ${attIcon(next)}"></i>`;
}

// ── Журнал: день (group-detail вкладка) ───────────────────
async function renderGdJournal(gid) {
  const dateVal = today();
  const [members, attData] = await Promise.all([
    api('group_students', 'GET', null, `&id=${gid}&month=${dateVal.slice(0,7)}`),
    api('attendance', 'GET', null, `&group_id=${gid}&date=${dateVal}`),
  ]);
  const canEdit = session.role === 'admin' || session.role === 'teacher';
  let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
    <input type="date" class="form-input" id="gd-att-date" value="${dateVal}" style="width:160px" onchange="reloadGdJournal(${gid})">
    ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="saveGdAtt(${gid})"><i class="fa-solid fa-floppy-disk"></i> Сохранить</button>` : ''}
  </div>
  <div class="journal-wrap"><table class="journal-table">
    <thead><tr><th>Студент</th><th style="text-align:center;width:100px">Присутствие</th></tr></thead>
    <tbody id="gd-att-tbody">
  ${(members||[]).map(m => {
    const state    = attState(attData && attData[m.id]);
    const initials = ((m.fname||'?')[0] + ((m.lname||'')[0]||'')).toUpperCase();
    return `<tr data-sid="${m.id}">
      <td><div class="person-cell">
        <div class="av" style="background:${safeColor(m.av_color,avColor(m.fname))}">${initials}</div>
        <div class="p-name">${esc(m.fname)} ${esc(m.lname)}</div>
      </div></td>
      <td style="text-align:center">${canEdit ? attBtnHtml(state, `id="attb-${m.id}"`) : attBadgeHtml(state)}</td>
    </tr>`;
  }).join('')}
  </tbody></table></div>`;
  document.getElementById('gd-tab-content').innerHTML = html;
}

async function reloadGdJournal(gid) {
  const date    = document.getElementById('gd-att-date')?.value || today();
  const [members, attData] = await Promise.all([
    api('group_students', 'GET', null, `&id=${gid}&month=${date.slice(0,7)}`),
    api('attendance', 'GET', null, `&group_id=${gid}&date=${date}`),
  ]);
  const tbody = document.getElementById('gd-att-tbody'); if (!tbody) return;
  (members||[]).forEach(m => {
    const state = attState(attData && attData[m.id]);
    const btn   = document.getElementById('attb-' + m.id);
    if (btn) { btn.className = 'att-btn ' + state; btn.innerHTML = `<i class="fa-solid ${attIcon(state)}"></i>`; }
  });
}

async function saveGdAtt(gid) {
  const date = document.getElementById('gd-att-date')?.value || today();
  const atts = {};
  document.querySelectorAll('[id^="attb-"]').forEach(btn => {
    if (btn.classList.contains('unmarked')) return; // пустое поле — не отправляем
    const sid = btn.id.replace('attb-', '');
    atts[sid] = { present: btn.classList.contains('present') ? 1 : 0 };
  });
  if (!Object.keys(atts).length) { toast('warn', 'Нет отмеченных студентов'); return; }
  try   { await api('attendance', 'POST', { group_id: gid, date, attendance: atts }); toast('success', 'Сохранено'); }
  catch (e) { toast('error', e.message); }
}

// ── Журнал: История (group-detail вкладка) ────────────────
async function renderGdHistory(gid, month) {
  const mon = month || curMonth();
  document.getElementById('gd-tab-content').innerHTML =
    '<div style="text-align:center;padding:30px;color:var(--muted)"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
  try {
    const [members, data] = await Promise.all([
      api('group_students', 'GET', null, `&id=${gid}&month=${mon}`),
      api('attendance', 'GET', null, `&group_id=${gid}&month=${mon}`),
    ]);
    if (!(members||[]).length) {
      document.getElementById('gd-tab-content').innerHTML = '<div class="empty"><div class="empty-msg">Нет студентов</div></div>';
      return;
    }
    // Даты из ответа API — строки ключей "2024-01-05"
    const dates = Object.keys(data||{}).sort();
    let html = `<div style="overflow-x:auto"><table class="journal-table" style="min-width:${100 + dates.length*34}px">
      <thead><tr>
        <th>Студент</th>
        ${dates.map(d => `<th style="text-align:center;min-width:30px;font-size:10px">${d.slice(8)}</th>`).join('')}
        <th style="text-align:center;min-width:50px">%</th>
      </tr></thead><tbody>
    ${(members||[]).map(m => {
      let presCount = 0, markedCount = 0;
      const cells = dates.map(d => {
        const state = attState(data[d] && data[d][m.id]);
        if (state !== 'unmarked') { markedCount++; if (state === 'present') presCount++; }
        return `<td style="text-align:center">${attBadgeHtml(state)}</td>`;
      }).join('');
      const pct      = markedCount > 0 ? Math.round(presCount/markedCount*100) : 0;
      const initials = ((m.fname||'?')[0] + ((m.lname||'')[0]||'')).toUpperCase();
      return `<tr>
        <td><div class="person-cell" style="min-width:120px">
          <div class="av" style="background:${safeColor(m.av_color,avColor(m.fname))}">${initials}</div>
          <div class="p-name">${esc(m.fname)} ${esc(m.lname)}</div>
        </div></td>${cells}
        <td style="text-align:center">${markedCount > 0
          ? `<span class="badge ${pct>=75?'b-green':pct>=50?'b-yellow':'b-red'}">${pct}%</span>`
          : '<span style="color:var(--muted)">—</span>'}</td>
      </tr>`;
    }).join('')}
    </tbody></table></div>`;
    document.getElementById('gd-tab-content').innerHTML = html;
  } catch (e) {
    document.getElementById('gd-tab-content').innerHTML =
      `<div class="empty"><div class="empty-msg">Ошибка: ${esc(e.message)}</div></div>`;
  }
}

// ── Журнал: страница (30-дневная сетка) ───────────────────
async function renderJournal() {
  const gSel = document.getElementById('journal-group');
  const prev = gSel.value;
  gSel.innerHTML = '<option value="">— Выберите группу —</option>' +
    visibleGroups().map(g => `<option value="${g.id}"${sameId(g.id,prev)?' selected':''}>${esc(g.name)}</option>`).join('');
  if (prev) gSel.value = prev;
  const dateInput = document.getElementById('journal-date');
  if (dateInput && dateInput.type !== 'month') {
    dateInput.type  = 'month';
    dateInput.value = (dateInput.value || today()).slice(0, 7);
  }
  if (!gSel.value) {
    document.getElementById('journal-content').innerHTML =
      '<div class="empty"><div class="empty-msg">Выберите группу</div></div>';
    return;
  }
  await loadJournalData();
}

async function loadJournalData() {
  const gid = document.getElementById('journal-group').value;
  const mon = (document.getElementById('journal-date')?.value || today()).slice(0, 7);
  if (!gid) {
    document.getElementById('journal-content').innerHTML =
      '<div class="empty"><div class="empty-msg">Выберите группу</div></div>';
    return;
  }
  document.getElementById('journal-content').innerHTML =
    '<div style="text-align:center;padding:30px;color:var(--muted)"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
  try {
    const [members, attData] = await Promise.all([
      api('group_students', 'GET', null, `&id=${gid}&month=${mon}`),
      api('attendance', 'GET', null, `&group_id=${gid}&month=${mon}`),
    ]);
    const att     = attData || {};
    const canEdit = session.role === 'admin' || session.role === 'teacher';
    const days    = Array.from({ length: 30 }, (_, i) => i + 1);
    const dayDate = d => `${mon}-${pad2(d)}`;

    let html = `${canEdit ? `<div style="margin-bottom:10px;display:flex;justify-content:flex-end">
      <button class="btn btn-primary" id="journal-save-btn" onclick="saveJournalPage()">
        <i class="fa-solid fa-floppy-disk"></i> Сохранить</button></div>` : ''}
    <div class="journal-wrap" style="overflow-x:auto">
    <table class="journal-table" style="min-width:${140+days.length*34}px">
      <thead><tr>
        <th style="position:sticky;left:0;background:var(--surface)">Студент</th>
        ${days.map(d => `<th style="text-align:center;min-width:30px;font-size:10px;padding:4px 2px">${d}</th>`).join('')}
        <th style="text-align:center;min-width:54px">%</th>
      </tr></thead><tbody>
    ${(members||[]).map(m => {
      let presCount = 0, markedCount = 0;
      const cells = days.map(d => {
        const date  = dayDate(d);
        const state = attState(att[date] && att[date][m.id]);
        if (state !== 'unmarked') { markedCount++; if (state === 'present') presCount++; }
        return canEdit
          ? `<td style="text-align:center;padding:2px">${attBtnHtml(state,
              `id="jattb-${m.id}-${d}" data-sid="${m.id}" data-day="${d}" style="width:24px;height:24px;font-size:10px;padding:0"`)}</td>`
          : `<td style="text-align:center">${attBadgeHtml(state)}</td>`;
      }).join('');
      const pct      = markedCount > 0 ? Math.round(presCount/markedCount*100) : 0;
      const initials = ((m.fname||'?')[0] + ((m.lname||'')[0]||'')).toUpperCase();
      return `<tr>
        <td style="position:sticky;left:0;background:var(--surface)">
          <div class="person-cell">
            <div class="av" style="background:${safeColor(m.av_color,avColor(m.fname))}">${initials}</div>
            <div class="p-name">${esc(m.fname)} ${esc(m.lname)}</div>
          </div>
        </td>${cells}
        <td style="text-align:center">${markedCount > 0
          ? `<span class="badge ${pct>=75?'b-green':pct>=50?'b-yellow':'b-red'}">${pct}%</span>`
          : '<span style="color:var(--muted)">—</span>'}</td>
      </tr>`;
    }).join('')}
    </tbody></table></div>`;
    document.getElementById('journal-content').innerHTML = html;
  } catch (e) {
    document.getElementById('journal-content').innerHTML =
      `<div class="empty"><div class="empty-msg">Ошибка: ${esc(e.message)}</div></div>`;
  }
}

async function saveJournalPage() {
  const gid = document.getElementById('journal-group').value;
  const mon = (document.getElementById('journal-date')?.value || today()).slice(0, 7);
  if (!gid) return;
  const byDay = {};
  document.querySelectorAll('[id^="jattb-"]').forEach(btn => {
    if (btn.classList.contains('unmarked')) return;
    const sid = btn.dataset.sid, day = parseInt(btn.dataset.day);
    if (!sid || !day) return;
    const date = `${mon}-${pad2(day)}`;
    if (!byDay[date]) byDay[date] = {};
    byDay[date][sid] = { present: btn.classList.contains('present') ? 1 : 0 };
  });
  const dates = Object.keys(byDay);
  if (!dates.length) { toast('warn', 'Нет отмеченных дней'); return; }
  const btn = document.getElementById('journal-save-btn');
  setBtnLoading(btn, true, 'Сохранение...');
  let failed = 0;
  await Promise.all(dates.map(date =>
    api('attendance', 'POST', { group_id: gid, date, attendance: byDay[date] }).catch(() => { failed++; })
  ));
  setBtnLoading(btn, false);
  if (failed === 0) toast('success', 'Сохранено');
  else toast('warn', `Сохранено, но ${failed} из ${dates.length} дней не удалось`);
}
