// ═══════════════════════════════════════════════════════════
// state.js  —  Глобальное состояние + финансовые расчёты
//              Зависит от: utils.js
// ═══════════════════════════════════════════════════════════

// ── Сессия и данные ───────────────────────────────────────
let session   = null;
let token     = null;
let courses   = [];
let groups    = [];
let students  = [];
let teachers  = [];
let aboutData = {};
let subjectsList = [];

// ── UI-состояние ──────────────────────────────────────────
let currentPage       = 'dashboard';
let confirmCallback   = null;
let pendingAvatarFile = null;
let currentGroupId    = null;
let groupFilter       = 'all';
let studentSortBy     = 'name';
let allStudentsForAtg = [];
let lastExportBlobUrl = null;

// Освобождаем Blob URL экспорта при закрытии вкладки
window.addEventListener('beforeunload', () => {
  if (lastExportBlobUrl) URL.revokeObjectURL(lastExportBlobUrl);
});

// ── Группы, видимые текущему пользователю ─────────────────
// Teacher видит только свои группы (teacher_id === session.id).
// Это ограничение на уровне UI; реальная защита — в api.php.
function visibleGroups(onlyActive = true) {
  let list = onlyActive ? groups.filter(g => g.is_active == 1) : groups;
  if (session?.role === 'teacher') list = list.filter(g => sameId(g.teacher_id, session.id));
  return list;
}

// ── Единый расчёт финансов группы ─────────────────────────
// Принципы:
//   1) Долг считается per-student — предоплата одного не гасит долг другого.
//   2) expected = price × months_count (не 1 месяц на всех).
//   3) Расчёт по paid_amount, а не бинарному флагу paid.
function computeGroupFinance(members, price) {
  const list = members || [];
  let revenue = 0, expected = 0, debt = 0;
  let payingCount = 0, paidCount = 0, partialCount = 0, monthlySum = 0;

  list.forEach(m => {
    const mc      = Math.max(1, parseInt(m.months_count) || 1);
    const paidAmt = Math.max(0, parseFloat(m.paid_amount) || 0);
    const expAmt  = price * mc;
    const debtAmt = Math.max(0, expAmt - paidAmt);

    revenue  += paidAmt;
    expected += expAmt;
    debt     += debtAmt;

    if (paidAmt > 0) {
      payingCount++;
      monthlySum += paidAmt / mc;
      if (debtAmt > 0) partialCount++;
      else paidCount++;
    }
  });

  const avgCheck = payingCount > 0 ? Math.round(monthlySum / payingCount) : 0;
  return { total: list.length, revenue, expected, debt, avgCheck,
           payingCount, paidCount, partialCount, monthlySum };
}

// Финансовый статус одного студента за период
function memberFinance(m, price) {
  const mc      = Math.max(1, parseInt(m.months_count) || 1);
  const paidAmt = Math.max(0, parseFloat(m.paid_amount) || 0);
  const expAmt  = price * mc;
  const debtAmt = Math.max(0, expAmt - paidAmt);
  const status  = paidAmt <= 0 ? 'none' : (debtAmt > 0 ? 'partial' : 'full');
  return { mc, paidAmt, expectedAmt: expAmt, debtAmt, status };
}
