// ═══════════════════════════════════════════════════════════
// finance.js  —  Финансы: дашборд + вкладка Оплата + платежи
//                Зависит от: utils.js, state.js, api-client.js, ui.js
// ═══════════════════════════════════════════════════════════

async function renderGdPayments(gid, month) {
  const tab = document.getElementById('gd-tab-content');
  if (session.role !== 'admin') {
    if (tab) tab.innerHTML = '<div class="empty"><div class="empty-msg">Нет доступа к финансовым данным</div></div>';
    return;
  }
  const mon   = month || curMonth();
  const g     = groups.find(x => sameId(x.id, gid));
  const price = parseFloat(g?.price || 0);
  if (!tab) return;

  let members = [];
  try {
    members = await api('group_students', 'GET', null, `&id=${gid}&month=${mon}`) || [];
  } catch(e) {
    tab.innerHTML = `<div class="empty"><div class="empty-msg">Ошибка: ${esc(e.message)}</div></div>`;
    return;
  }

  const fin = computeGroupFinance(members, price);
  const { total, revenue, expected, debt, avgCheck, paidCount, partialCount } = fin;

  let html = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <input type="month" class="form-input" id="gd-pay-month" value="${mon}"
        style="width:160px" onchange="renderGdPayments(${gid},this.value)">
      <span style="font-size:12px;color:var(--muted)">
        Цена: <strong style="color:var(--text)">${fmtMoney(price)}/мес</strong>
      </span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      <div class="finance-card">
        <div class="finance-val" style="color:var(--green)">${fmtMoney(revenue)}</div>
        <div class="finance-lbl">Получено</div></div>
      <div class="finance-card">
        <div class="finance-val" style="color:var(--red)">${fmtMoney(Math.max(0,debt))}</div>
        <div class="finance-lbl">Долг</div></div>
      <div class="finance-card">
        <div class="finance-val" style="color:var(--yellow)">${fmtMoney(avgCheck)}</div>
        <div class="finance-lbl">Ср. чек/мес</div></div>
      <div class="finance-card">
        <div class="finance-val">${paidCount}<span style="color:var(--muted);font-size:14px">/${total}</span></div>
        <div class="finance-lbl">Оплатили${partialCount>0?` (ч: ${partialCount})`:''}</div></div>
    </div>
    <div style="overflow-x:auto;border-radius:12px;border:1.5px solid var(--border)">
    <table style="width:100%;border-collapse:collapse;background:var(--surface)">
      <thead style="background:linear-gradient(135deg,var(--accent2),var(--accent))">
        <tr>
          <th style="padding:11px 14px;text-align:left;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase">Студент</th>
          <th style="padding:11px 14px;text-align:center;color:#fff;font-size:10px;font-weight:700;width:80px">Мес.</th>
          <th style="padding:11px 14px;text-align:right;color:#fff;font-size:10px;font-weight:700;width:130px">Сумма</th>
          <th style="padding:11px 14px;text-align:center;color:#fff;font-size:10px;font-weight:700;width:150px">Статус</th>
          <th style="padding:11px 14px;color:#fff;font-size:10px;font-weight:700;width:120px"></th>
        </tr>
      </thead>
      <tbody>`;

  members.forEach(m => {
    const { mc, paidAmt, debtAmt, status } = memberFinance(m, price);
    const amt      = paidAmt > 0 ? paidAmt : price * mc;
    const initials = ((m.fname||'?')[0] + ((m.lname||'')[0]||'')).toUpperCase();
    const rowStyle = status==='full' ? 'background:rgba(5,150,105,.04)' : status==='partial' ? 'background:rgba(217,119,6,.05)' : '';
    html += `<tr style="border-top:1px solid var(--border);${rowStyle}">
      <td style="padding:10px 14px">
        <div class="person-cell">
          <div class="av" style="background:${safeColor(m.av_color,avColor(m.fname))};width:30px;height:30px;font-size:11px">${initials}</div>
          <div>
            <div style="font-weight:600;font-size:13px">${esc(m.fname)} ${esc(m.lname)}</div>
            ${m.end_date?`<div style="font-size:10px;color:var(--muted)">до ${fmtDate(m.end_date)}</div>`:''}
          </div>
        </div>
      </td>
      <td style="padding:10px 14px;text-align:center">
        <input type="number" id="mc-${m.id}" value="${mc}" min="1" max="60"
          style="width:58px;padding:5px;text-align:center;font-size:13px;font-weight:700;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;color:var(--text);outline:none"
          onchange="recalcPayRow('${m.id}',${price})">
      </td>
      <td style="padding:10px 14px;text-align:right">
        <input type="number" id="amt-${m.id}" value="${amt.toFixed(0)}" min="0"
          style="width:105px;padding:5px;text-align:right;font-size:13px;font-weight:700;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;color:var(--text);outline:none">
      </td>
      <td style="padding:10px 14px;text-align:center">
        <span class="badge ${status==='full'?'b-green':status==='partial'?'b-yellow':'b-red'}">
          ${status==='full' ? '<i class="fa-solid fa-check"></i> Оплачено'
            : status==='partial' ? `<i class="fa-solid fa-circle-half-stroke"></i> Частично, долг ${fmtMoney(debtAmt)}`
            : '<i class="fa-solid fa-clock"></i> Ожидает'}
        </span>
      </td>
      <td style="padding:10px 14px;text-align:center">
        <button class="btn btn-sm ${m.paid==1?'btn-outline':'btn-success'}" id="pay-toggle-${m.id}"
          onclick="togglePayment('${m.id}',${gid},'${mon}',${m.paid==1?0:1},${price})">
          ${m.paid==1 ? '<i class="fa-solid fa-rotate-left"></i> Отменить' : '<i class="fa-solid fa-check"></i> Оплатил'}
        </button>
      </td>
    </tr>`;
  });

  html += `</tbody>
    <tfoot>
      <tr style="background:var(--surface2);border-top:2px solid var(--border)">
        <td style="padding:10px 14px;font-weight:700;font-size:12px">Итого: ${paidCount} из ${total}</td>
        <td></td>
        <td style="padding:10px 14px;text-align:right;font-weight:700;color:var(--green)">${fmtMoney(revenue)}</td>
        <td style="padding:10px 14px;text-align:center;font-size:11px;color:var(--muted)">из ${fmtMoney(expected)}</td>
        <td></td>
      </tr>
    </tfoot></table></div>`;
  tab.innerHTML = html;
}

// Пересчёт суммы при изменении количества месяцев
function recalcPayRow(sid, pricePerMonth) {
  const mcEl  = document.getElementById('mc-'+sid);
  const amtEl = document.getElementById('amt-'+sid);
  if (!mcEl || !amtEl) return;
  amtEl.value = Math.round(pricePerMonth * Math.max(1, parseInt(mcEl.value)||1));
}

async function togglePayment(sid, gid, month, paid, price) {
  const mcEl   = document.getElementById('mc-'+sid);
  const amtEl  = document.getElementById('amt-'+sid);
  const months = mcEl  ? Math.max(1, parseInt(mcEl.value)||1)  : 1;
  const amount = amtEl ? Math.max(0, parseFloat(amtEl.value)||price*months) : price*months;
  const btn = document.getElementById('pay-toggle-'+sid);
  setBtnLoading(btn, true, paid ? 'Сохранение...' : 'Отмена...');
  try {
    await api('payments', 'POST', {
      student_id: sid, group_id: gid, month, paid,
      months_count: months, amount: paid ? amount : 0,
    });
    toast('success', paid ? `Оплата ${fmtMoney(amount)} отмечена` : 'Оплата отменена');
    renderGdPayments(gid, month); // авторефреш вкладки
  } catch(e) { toast('error', e.message); }
  finally { setBtnLoading(btn, false); }
}

// ── Финансы: общая страница ───────────────────────────────
async function renderFinance() {
  const wrap = document.getElementById('finance-content');
  if (!wrap) return;
  if (session.role !== 'admin') {
    wrap.innerHTML = '<div class="empty"><div class="empty-msg">Нет доступа к финансовым данным</div></div>';
    return;
  }
  const month = document.getElementById('finance-month').value || curMonth();
  const activeGroups = groups.filter(g => g.is_active == 1);
  if (!activeGroups.length) {
    wrap.innerHTML = '<div class="empty"><div class="empty-msg">Нет активных групп</div></div>';
    return;
  }
  wrap.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
  try {
    const membersAll = await Promise.all(
      activeGroups.map(g => api('group_students','GET',null,`&id=${g.id}&month=${month}`).catch(()=>[]))
    );
    let totalRevenue=0, totalExpected=0, totalStudents=0;
    let totalMonthly=0, totalDebt=0, totalPaying=0, totalPaidFull=0;
    const groupFin = activeGroups.map((g, i) => {
      const fin = computeGroupFinance(membersAll[i]||[], parseFloat(g.price)||0);
      totalStudents += fin.total;   totalExpected += fin.expected;
      totalRevenue  += fin.revenue; totalDebt     += fin.debt;
      totalMonthly  += fin.monthlySum; totalPaying += fin.payingCount;
      totalPaidFull += fin.paidCount;
      return fin;
    });
    const avgCheck = totalPaying > 0 ? Math.round(totalMonthly/totalPaying) : 0;

    let html = `<div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <i class="fa-solid fa-money-bill-wave" style="font-size:22px;color:var(--green)"></i>
        <div class="stat-val" style="color:var(--green)">${fmtMoney(totalRevenue)}</div>
        <div class="stat-lbl">Получено за ${month}</div></div>
      <div class="stat-card">
        <i class="fa-solid fa-clock" style="font-size:22px;color:var(--red)"></i>
        <div class="stat-val" style="color:var(--red)">${fmtMoney(totalDebt)}</div>
        <div class="stat-lbl">Не оплачено</div></div>
      <div class="stat-card">
        <i class="fa-solid fa-receipt" style="font-size:22px;color:var(--yellow)"></i>
        <div class="stat-val" style="color:var(--yellow)">${fmtMoney(avgCheck)}</div>
        <div class="stat-lbl">Средний чек/мес</div></div>
      <div class="stat-card">
        <i class="fa-solid fa-users" style="font-size:22px;color:var(--accent)"></i>
        <div class="stat-val">${totalPaidFull}<span style="font-size:14px;color:var(--muted)">/${totalStudents}</span></div>
        <div class="stat-lbl">Оплатили</div></div>
    </div>`;

    activeGroups.forEach((g, i) => {
      const fin     = groupFin[i];
      const members = membersAll[i] || [];
      const price   = parseFloat(g.price) || 0;
      const { total, revenue, expected, avgCheck: avg, paidCount: paid, partialCount } = fin;
      html += `<div class="card" style="margin-bottom:14px">
        <div class="card-header" style="flex-wrap:wrap;gap:8px">
          <div>
            <div class="card-title">
              <i class="fa-solid ${safeIconClass(g.course_icon,'fa-book')}" style="color:${safeColor(g.course_color,'var(--accent)')}"></i>
              ${esc(g.name)}
              ${g.level?`<span class="badge b-gray" style="margin-left:6px;font-size:9px">${esc(g.level)}</span>`:''}
            </div>
            ${g.teacher_name?`<div style="font-size:11px;color:var(--muted);margin-top:3px"><i class="fa-solid fa-chalkboard-user"></i> ${esc(g.teacher_name)}</div>`:''}
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="badge b-green"><i class="fa-solid fa-check"></i> ${fmtMoney(revenue)}</span>
            <span class="badge b-yellow"><i class="fa-solid fa-receipt"></i> ${fmtMoney(avg)}/мес</span>
            <span class="badge ${paid===total&&total>0?'b-green':'b-red'}">${paid}/${total}</span>
            <button class="btn btn-sm btn-outline"
              onclick="openGroupDetail(${g.id});setTimeout(()=>renderGroupDetail(${g.id},'payments'),200)">
              <i class="fa-solid fa-eye"></i> Подробнее
            </button>
          </div>
        </div>
        ${total===0 ? '<div style="padding:12px;color:var(--muted);font-size:13px;text-align:center">Студентов нет</div>'
          : `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:var(--surface2);border-bottom:1.5px solid var(--border)">
            <th style="padding:8px 12px;text-align:left;font-weight:700;color:var(--text2)">Студент</th>
            <th style="padding:8px 12px;text-align:center;width:60px;font-weight:700;color:var(--text2)">Мес.</th>
            <th style="padding:8px 12px;text-align:right;font-weight:700;color:var(--text2)">Сумма</th>
            <th style="padding:8px 12px;text-align:center;font-weight:700;color:var(--text2)">Статус</th>
            <th style="padding:8px 12px;width:110px"></th>
          </tr></thead><tbody>
          ${members.map(m => {
            const { mc, paidAmt, debtAmt, status } = memberFinance(m, price);
            const amt      = paidAmt > 0 ? paidAmt : price*mc;
            const initials = ((m.fname||'?')[0]+((m.lname||'')[0]||'')).toUpperCase();
            const rowBg    = status==='full'?'background:rgba(5,150,105,.03)':status==='partial'?'background:rgba(217,119,6,.04)':'';
            return `<tr style="border-top:1px solid var(--border);${rowBg}">
              <td style="padding:8px 12px">
                <div class="person-cell">
                  <div class="av" style="background:${safeColor(m.av_color,avColor(m.fname))};width:28px;height:28px;font-size:10px">${initials}</div>
                  <span style="font-weight:500">${esc(m.fname)} ${esc(m.lname)}</span>
                </div>
              </td>
              <td style="padding:8px 12px;text-align:center;font-weight:700">${mc}</td>
              <td style="padding:8px 12px;text-align:right;font-weight:700">${fmtMoney(amt)}</td>
              <td style="padding:8px 12px;text-align:center">
                <span class="badge ${status==='full'?'b-green':status==='partial'?'b-yellow':'b-red'}" style="font-size:10px">
                  ${status==='full'?'✓ Оплачено':status==='partial'?`◐ Частично (${fmtMoney(debtAmt)})`:'⏳ Ожидает'}
                </span>
              </td>
              <td style="padding:8px 12px;text-align:center">
                <button class="btn btn-sm ${m.paid==1?'btn-outline':'btn-success'}" id="qpay-${g.id}-${m.id}"
                  onclick="quickTogglePayment('${m.id}',${g.id},'${month}',${m.paid==1?0:1},${price},${mc},${amt.toFixed(0)})">
                  ${m.paid==1?'Отменить':'Оплатил'}
                </button>
              </td>
            </tr>`;
          }).join('')}
          </tbody>
          <tfoot>
            <tr style="background:var(--surface2);border-top:2px solid var(--border)">
              <td colspan="2" style="padding:8px 12px;font-weight:700;color:var(--text2)">Итого${partialCount>0?` (частично: ${partialCount})`:''}</td>
              <td style="padding:8px 12px;text-align:right;font-weight:700;color:var(--green)">${fmtMoney(revenue)}</td>
              <td style="padding:8px 12px;text-align:center;font-size:10px;color:var(--muted)">из ${fmtMoney(expected)}</td>
              <td></td>
            </tr>
          </tfoot></table></div>`}
      </div>`;
    });
    wrap.innerHTML = html;
  } catch(e) {
    wrap.innerHTML = `<div class="empty"><div class="empty-msg">Ошибка: ${esc(e.message)}</div></div>`;
  }
}

async function quickTogglePayment(sid, gid, month, paid, price, months, amount) {
  const btn = document.getElementById('qpay-'+gid+'-'+sid);
  setBtnLoading(btn, true, paid ? 'Сохранение...' : 'Отмена...');
  const safeMonths = Math.max(1, parseInt(months)||1);
  const safeAmount = Math.max(0, parseFloat(amount)||price||0);
  try {
    await api('payments', 'POST', {
      student_id: sid, group_id: gid, month, paid,
      months_count: safeMonths, amount: paid ? safeAmount : 0,
    });
    toast('success', paid ? `Оплата ${fmtMoney(safeAmount)} отмечена` : 'Оплата отменена');
    renderFinance(); // авторефреш страницы финансов
  } catch(e) { toast('error', e.message); }
  finally { setBtnLoading(btn, false); }
}
