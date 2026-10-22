// ═══════════════════════════════════════════════════════════
// profile.js  —  Профиль, аватар, «О нас», предметы
//                Зависит от: utils.js, state.js, api-client.js,
//                            ui.js, validation.js
// ═══════════════════════════════════════════════════════════

function renderSchedItems(sched) {
  if (!(sched||[]).length) return '<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px">Расписание не назначено</div>';
  return sched.map(s => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
    <div style="background:${safeColor(s.course_color,'var(--accent-soft)')};color:#fff;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;flex-shrink:0;text-align:center;min-width:50px">
      ${DAYS_SHORT[s.day_of_week]||'?'}<br>${s.start_time?.slice(0,5)}</div>
    <div>
      <div style="font-weight:600;font-size:13px">${esc(s.group_name||'')}</div>
      <div style="font-size:11px;color:var(--muted)">${esc(s.course_name||'')}${s.room?' · каб.'+esc(s.room):''}</div>
    </div>
  </div>`).join('');
}

async function renderMyProfile() {
  const fn = session.fname||'', ln = session.lname||'';
  const rNames = { admin:'Администратор', teacher:'Преподаватель', student:'Студент' };
  const pc = document.getElementById('profile-content'); if (!pc) return;
  pc.innerHTML = `
    <div style="background:linear-gradient(135deg,#1d4ed8,#2563eb,#3b82f6);border-radius:20px;padding:24px;margin-bottom:16px;color:#fff;display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <div style="cursor:pointer;position:relative;flex-shrink:0" onclick="openAvatarModal()">
        <div id="profile-av" class="av-xl" style="background:${safeColor(session.av_color,avColor(fn))}"></div>
        <div style="position:absolute;bottom:0;right:0;background:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.25)">
          <i class="fa-solid fa-camera" style="font-size:10px;color:#2563eb"></i>
        </div>
      </div>
      <div>
        <div style="font-family:'Unbounded',sans-serif;font-size:18px;font-weight:700">${esc(fn)} ${esc(ln)}</div>
        <div style="font-size:13px;opacity:.8;margin-top:5px">${rNames[session.role]||session.role}</div>
        <div style="font-size:12px;opacity:.6;margin-top:3px"><i class="fa-solid fa-at"></i> ${esc(session.login)}</div>
        ${session.phone?`<div style="font-size:12px;opacity:.6;margin-top:2px"><i class="fa-solid fa-phone"></i> ${esc(session.phone)}</div>`:''}
        ${session.birth_date?`<div style="font-size:12px;opacity:.6;margin-top:2px"><i class="fa-solid fa-cake-candles"></i> ${fmtDate(session.birth_date)}</div>`:''}
      </div>
    </div>`;
  const avEl = document.getElementById('profile-av');
  if (avEl) renderUserAv(avEl, session, 72);
  if (session.role !== 'admin') {
    try {
      const sched = await api('my_schedule');
      const card  = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="card-header"><div class="card-title"><i class="fa-solid fa-calendar-days" style="color:var(--accent)"></i> Моё расписание</div></div>
        ${renderSchedItems(sched)}`;
      pc.appendChild(card);
    } catch(_) {}
  }
}

// ── Аватар ────────────────────────────────────────────────
function openAvatarModal() {
  pendingAvatarFile = null;
  const p = document.getElementById('av-preview'); if (!p) return;
  p.style.background = safeColor(session.av_color, avColor(session.fname));
  p.innerHTML = session.avatar
    ? `<img src="${session.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : `<span style="font-size:30px;font-weight:700;color:#fff">${((session.fname||'?')[0]+((session.lname||'')[0]||'')).toUpperCase()}</span>`;
  const ac = document.getElementById('av-colors');
  if (ac) ac.innerHTML = AV_COLORS.map(c =>
    `<div onclick="pickAvColor('${c}',this)" style="width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;outline:3px solid ${c===session.av_color?'#fff':'transparent'};outline-offset:2px;transition:.15s"></div>`
  ).join('');
  document.getElementById('ov-avatar').classList.add('show');
}
function pickAvColor(c, el) {
  session.av_color = c;
  const p = document.getElementById('av-preview');
  if (p) {
    p.style.background = c;
    if (!session.avatar) p.innerHTML = `<span style="font-size:30px;font-weight:700;color:#fff">${((session.fname||'?')[0]+((session.lname||'')[0]||'')).toUpperCase()}</span>`;
  }
  document.getElementById('av-colors')?.querySelectorAll('div').forEach(d =>
    d.style.outline = `3px solid ${d.style.background===c?'#fff':'transparent'}`);
}
function onAvatarSelected(input) {
  const f = input.files[0]; if (!f) return;
  if (f.size > 5*1024*1024) { toast('error','Файл > 5MB'); input.value=''; return; }
  pendingAvatarFile = f;
  const r = new FileReader();
  r.onload = e => {
    const p = document.getElementById('av-preview');
    if (p) p.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  };
  r.readAsDataURL(f);
}
async function uploadAvatar() {
  if (pendingAvatarFile) {
    const fd = new FormData(); fd.append('avatar', pendingAvatarFile);
    const h  = {}; if (token) { h['X-Token']=token; h['Authorization']='Bearer '+token; }
    try {
      const res  = await fetch(`${API}?action=avatar&_token=${encodeURIComponent(token||'')}`, { method:'POST', headers:h, body:fd });
      const json = await res.json(); if (!json.ok) throw new Error(json.error);
      session.avatar = json.data.avatar;
    } catch(e) { toast('error','Ошибка: '+e.message); return; }
  } else {
    try {
      await api('users','PUT',{
        login:session.login, fname:session.fname, lname:session.lname,
        role:session.role, phone:session.phone||'', guardian:session.guardian||'',
        av_color:session.av_color
      }, `&id=${session.id}`);
    } catch(_) {}
    session.avatar = null;
  }
  renderUserAv(document.getElementById('user-av'), session, 36);
  renderMyProfile();
  closeModal('avatar');
  toast('success','Фото обновлено');
}

// ── О нас ─────────────────────────────────────────────────
function aboutRow(icon, label, value) {
  if (!value) return '';
  return `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
    <i class="fa-solid ${icon}" style="color:var(--accent);width:16px;flex-shrink:0;margin-top:2px"></i>
    <div>
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">${label}</div>
      <div style="font-size:13px;font-weight:600;color:var(--text)">${value}</div>
    </div>
  </div>`;
}
async function renderAbout() {
  const isAdmin = session.role === 'admin';
  const btnWrap = document.getElementById('about-header-btns');
  if (btnWrap) btnWrap.innerHTML = isAdmin
    ? `<button class="btn btn-primary" onclick="openAboutModal()"><i class="fa-solid fa-pen"></i> Редактировать</button>` : '';
  try { aboutData = await api('about') || {}; } catch(_) { aboutData = {}; }
  const orgName = aboutData.name || 'Учебный центр';
  const navLabel = document.getElementById('nav-about-label'); if (navLabel) navLabel.textContent = orgName;
  const orgNameEl = document.getElementById('about-org-name'); if (orgNameEl) orgNameEl.textContent = orgName;
  const logoTitle = document.querySelector('.logo-title'); if (logoTitle) logoTitle.textContent = orgName;
  document.title = `CRM — ${orgName}`;
  const wrap = document.getElementById('about-content'); if (!wrap) return;
  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-building-columns" style="color:var(--accent)"></i> Основная информация</div></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${aboutRow('fa-building','Название',esc(aboutData.name))}
          ${aboutRow('fa-quote-left','Слоган',esc(aboutData.slogan))}
          ${aboutRow('fa-user-tie','Директор',esc(aboutData.director))}
          ${aboutRow('fa-calendar','Год основания',esc(aboutData.founded))}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-address-card" style="color:var(--accent)"></i> Контакты</div></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${aboutRow('fa-location-dot','Адрес',esc(aboutData.address))}
          ${aboutRow('fa-phone','Телефон',esc(aboutData.phone))}
          ${aboutRow('fa-envelope','Email',esc(aboutData.email))}
          ${aboutRow('fa-globe','Сайт',aboutData.website?`<a href="${esc(aboutData.website)}" target="_blank" style="color:var(--accent)">${esc(aboutData.website)}</a>`:null)}
        </div>
      </div>
    </div>
    ${aboutData.desc?`<div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-info-circle" style="color:var(--accent)"></i> О нас</div></div><p style="color:var(--text2);font-size:13px;line-height:1.7">${esc(aboutData.desc)}</p></div>`:''}
    <div class="card">
      <div class="card-header"><div class="card-title"><i class="fa-solid fa-chart-bar" style="color:var(--accent)"></i> Статистика</div></div>
      <div class="stats-grid" style="margin-bottom:0">
        <div class="stat-card"><i class="fa-solid fa-user-graduate" style="font-size:24px;color:var(--accent)"></i><div class="stat-val">${students.length}</div><div class="stat-lbl">Студентов</div></div>
        <div class="stat-card"><i class="fa-solid fa-chalkboard-user" style="font-size:24px;color:var(--green)"></i><div class="stat-val">${teachers.length}</div><div class="stat-lbl">Преподавателей</div></div>
        <div class="stat-card"><i class="fa-solid fa-people-group" style="font-size:24px;color:var(--purple)"></i><div class="stat-val">${groups.filter(g=>g.is_active==1).length}</div><div class="stat-lbl">Групп</div></div>
        <div class="stat-card"><i class="fa-solid fa-book" style="font-size:24px;color:var(--yellow)"></i><div class="stat-val">${courses.length}</div><div class="stat-lbl">Курсов</div></div>
      </div>
    </div>`;
}
function openAboutModal() {
  ['name','slogan','director','founded','address','phone','email','website','desc'].forEach(f => {
    const el = document.getElementById('ab-'+f); if (el) el.value = aboutData[f]||'';
  });
  document.getElementById('ov-about').classList.add('show');
}
async function saveAbout() {
  if (!validateForm([{ id:'ab-name', rules:['required'], label:'Название' }])) return;
  const body = {};
  ['name','slogan','director','founded','address','phone','email','website','desc'].forEach(f => {
    const el = document.getElementById('ab-'+f); if (el) body[f] = el.value.trim();
  });
  try {
    await api('about','POST',body);
    aboutData = {...aboutData,...body};
    closeModal('about'); renderAbout(); toast('success','Информация сохранена');
  } catch(e) { toast('error',e.message); }
}

// ── Справочник предметов ──────────────────────────────────
async function renderSubjects() {
  try { subjectsList = await api('subjects') || []; } catch(_) {}
  const grid = document.getElementById('subjects-grid'); if (!grid) return;
  if (!subjectsList.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-msg">Предметов нет. Добавьте первый!</div></div>`; return;
  }
  grid.innerHTML = subjectsList.map(s => `
    <div class="c-card" style="cursor:default">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:38px;height:38px;border-radius:10px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fa-solid fa-book-open" style="color:var(--accent)"></i></div>
          <div style="font-weight:600;font-size:13px">${esc(s.name)}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-icon btn-outline" onclick="openSubjectModal(${s.id},'${esc(s.name)}')" title="Переименовать"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-icon btn-danger"  onclick="askConfirm('Удалить предмет?',()=>deleteSubject(${s.id}))"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    </div>`).join('');
}
function openSubjectModal(id=null, name='') {
  clearValidation('ov-subject');
  document.getElementById('subject-id').value = id||'';
  document.getElementById('subject-modal-title').textContent = id ? 'Переименовать предмет' : 'Добавить предмет';
  document.getElementById('subject-name').value = name;
  document.getElementById('ov-subject').classList.add('show');
  setTimeout(()=>document.getElementById('subject-name').focus(),100);
}
async function saveSubject() {
  if (!validateForm([{ id:'subject-name', rules:['required'], label:'Название' }])) return;
  const id   = document.getElementById('subject-id').value;
  const name = document.getElementById('subject-name').value.trim();
  try {
    if (id) {
      await api('subjects','PUT',{name},`&id=${id}`);
      subjectsList = subjectsList.map(s => sameId(s.id,id) ? {...s,name} : s);
    } else {
      const r = await api('subjects','POST',{name});
      subjectsList.push({id:r.id,name,sort_order:subjectsList.length});
    }
    closeModal('subject'); renderSubjects();
    toast('success', id ? 'Переименовано' : 'Предмет добавлен');
  } catch(e) { toast('error',e.message); }
}
async function deleteSubject(id) {
  try {
    await api('subjects','DELETE',null,`&id=${id}`);
    subjectsList = subjectsList.filter(s => !sameId(s.id,id));
    renderSubjects(); toast('info','Предмет удалён');
  } catch(e) { toast('error',e.message); }
}

// ── Picker предметов (в форме преподавателя) ───────────────
async function renderSubjectsPicker(selected=[]) {
  const container = document.getElementById('user-subjects-picker'); if (!container) return;
  if (!subjectsList.length) {
    try { subjectsList = await api('subjects') || []; } catch(_) {}
  }
  _renderSubjectsPickerUI(container, selected);
}
function _renderSubjectsPickerUI(container, selected=[]) {
  const selSet = new Set(selected);
  container.innerHTML = `
    <div id="subj-selected-wrap" style="display:flex;flex-wrap:wrap;gap:6px;min-height:36px;padding:8px;background:var(--surface);border:1.5px solid var(--accent-soft);border-radius:10px;margin-bottom:8px">
      ${selected.map(s=>`<span class="subj-chip sel" data-subj="${esc(s)}">${esc(s)}
        <span onclick="removeSubjectFromPicker(this)" style="margin-left:5px;cursor:pointer;opacity:.7;font-weight:700">×</span></span>`).join('')}
      ${!selected.length?'<span style="color:var(--muted);font-size:12px;padding:2px">Нет выбранных предметов</span>':''}
    </div>
    <div style="display:flex;gap:6px;margin-bottom:6px">
      <div style="position:relative;flex:1">
        <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:12px"></i>
        <input type="text" class="form-input" id="subj-search-input" placeholder="Поиск или новый предмет..."
          style="padding-left:30px;font-size:12px" oninput="filterSubjPickerList(this.value)"
          onkeydown="if(event.key==='Enter'){event.preventDefault();addNewSubjectInline();}">
      </div>
      <button type="button" class="btn btn-primary btn-sm" onclick="addNewSubjectInline()"><i class="fa-solid fa-plus"></i> Новый</button>
    </div>
    <div id="subj-list-wrap" style="max-height:180px;overflow-y:auto;display:flex;flex-wrap:wrap;gap:5px;padding:6px;background:var(--surface2);border-radius:10px;border:1.5px solid var(--border)">
      ${subjectsList.map(s=>{
        const isSel=selSet.has(s.name);
        return `<div style="display:flex;align-items:center;gap:4px">
          <span class="subj-chip${isSel?' sel':''}" id="spick-${s.id}"
            onclick="toggleSubjPickerItem(${s.id},'${esc(s.name)}')"
            style="font-size:11px;padding:4px 10px;cursor:pointer">${esc(s.name)}</span>
          <span onclick="renameSubjectInline(${s.id},'${esc(s.name)}')" style="cursor:pointer;color:var(--muted);font-size:10px;padding:2px" title="Переименовать">✏️</span>
          <span onclick="deleteSubjectInline(${s.id},'${esc(s.name)}')" style="cursor:pointer;color:var(--red);font-size:10px;padding:2px" title="Удалить">🗑</span>
        </div>`;
      }).join('')}
      ${!subjectsList.length?'<span style="color:var(--muted);font-size:12px">Справочник пуст</span>':''}
    </div>`;
}
function filterSubjPickerList(q) {
  const wrap = document.getElementById('subj-list-wrap'); if (!wrap) return;
  const selSet = new Set(getSelectedSubjectsFromPicker());
  const filtered = q ? subjectsList.filter(s=>s.name.toLowerCase().includes(q.toLowerCase())) : subjectsList;
  wrap.innerHTML = filtered.map(s=>{
    const isSel=selSet.has(s.name);
    return `<div style="display:flex;align-items:center;gap:4px">
      <span class="subj-chip${isSel?' sel':''}" id="spick-${s.id}"
        onclick="toggleSubjPickerItem(${s.id},'${esc(s.name)}')"
        style="font-size:11px;padding:4px 10px;cursor:pointer">${esc(s.name)}</span>
      <span onclick="renameSubjectInline(${s.id},'${esc(s.name)}')" style="cursor:pointer;color:var(--muted);font-size:10px;padding:2px">✏️</span>
      <span onclick="deleteSubjectInline(${s.id},'${esc(s.name)}')" style="cursor:pointer;color:var(--red);font-size:10px;padding:2px">🗑</span>
    </div>`;
  }).join('') || '<span style="color:var(--muted);font-size:12px">Ничего не найдено</span>';
}
function toggleSubjPickerItem(id, name) {
  const selWrap = document.getElementById('subj-selected-wrap'); if (!selWrap) return;
  const existing = selWrap.querySelector(`[data-subj="${name}"]`);
  if (existing) {
    existing.remove();
    if (!selWrap.querySelector('[data-subj]')) selWrap.innerHTML='<span style="color:var(--muted);font-size:12px;padding:2px">Нет выбранных предметов</span>';
  } else {
    const placeholder=selWrap.querySelector('span:not([data-subj])'); if(placeholder) placeholder.remove();
    const chip=document.createElement('span'); chip.className='subj-chip sel'; chip.dataset.subj=name;
    chip.innerHTML=`${esc(name)}<span onclick="removeSubjectFromPicker(this)" style="margin-left:5px;cursor:pointer;opacity:.7;font-weight:700">×</span>`;
    selWrap.appendChild(chip);
  }
  const btn=document.getElementById('spick-'+id);
  if(btn) btn.className=btn.classList.contains('sel')?'subj-chip':'subj-chip sel';
}
function removeSubjectFromPicker(x) {
  const chip=x.parentElement; const wrap=document.getElementById('subj-selected-wrap');
  const name=chip.dataset.subj; chip.remove();
  if(wrap&&!wrap.querySelector('[data-subj]')) wrap.innerHTML='<span style="color:var(--muted);font-size:12px;padding:2px">Нет выбранных предметов</span>';
  const item=subjectsList.find(s=>s.name===name);
  if(item){const btn=document.getElementById('spick-'+item.id);if(btn)btn.classList.remove('sel');}
}
function getSelectedSubjectsFromPicker() {
  return [...document.querySelectorAll('#subj-selected-wrap [data-subj]')].map(el=>el.dataset.subj).filter(Boolean);
}
async function addNewSubjectInline() {
  const input=document.getElementById('subj-search-input'); if(!input) return;
  const name=input.value.trim();
  if(!name){toast('warn','Введите название предмета');return;}
  if(subjectsList.find(s=>s.name.toLowerCase()===name.toLowerCase())){
    const s=subjectsList.find(s=>s.name.toLowerCase()===name.toLowerCase());
    toggleSubjPickerItem(s.id,s.name); input.value=''; filterSubjPickerList(''); return;
  }
  try {
    const r=await api('subjects','POST',{name});
    const newS={id:r.id,name,sort_order:subjectsList.length};
    subjectsList.push(newS);
    filterSubjPickerList(''); input.value='';
    toggleSubjPickerItem(newS.id,name);
    toast('success','Предмет добавлен');
  } catch(e){toast('error',e.message);}
}
async function renameSubjectInline(id, oldName) {
  const newName=prompt('Новое название:',oldName); if(!newName||newName===oldName) return;
  try {
    await api('subjects','PUT',{name:newName},`&id=${id}`);
    subjectsList=subjectsList.map(s=>sameId(s.id,id)?{...s,name:newName}:s);
    const selected=getSelectedSubjectsFromPicker().map(n=>n===oldName?newName:n);
    _renderSubjectsPickerUI(document.getElementById('user-subjects-picker'),selected);
    toast('success','Переименовано');
  } catch(e){toast('error',e.message);}
}
async function deleteSubjectInline(id, name) {
  if(!confirm(`Удалить предмет «${name}» из справочника?`)) return;
  try {
    await api('subjects','DELETE',null,`&id=${id}`);
    subjectsList=subjectsList.filter(s=>!sameId(s.id,id));
    const selWrap=document.getElementById('subj-selected-wrap');
    const chip=selWrap?.querySelector(`[data-subj="${name}"]`); if(chip) chip.remove();
    filterSubjPickerList('');
    toast('info',`«${name}» удалён из справочника`);
  } catch(e){toast('error',e.message);}
}
