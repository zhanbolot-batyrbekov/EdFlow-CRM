// ═══════════════════════════════════════════════════════════
// utils.js  —  Константы и утилиты (не имеют зависимостей)
// ═══════════════════════════════════════════════════════════

const API          = 'api.php';
const CURRENCY     = 'сом';
const DAYS_RU      = ['','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
const DAYS_SHORT   = ['','Пн','Вт','Ср','Чт','Пт','Сб'];
const AV_COLORS    = ['#2563eb','#059669','#7c3aed','#d97706','#dc2626','#0891b2','#9333ea'];
const COURSE_COLORS= ['#2563eb','#059669','#7c3aed','#d97706','#dc2626','#0891b2','#9333ea','#0f766e'];
const COURSE_ICONS = ['fa-book','fa-globe','fa-calculator','fa-laptop-code','fa-music',
                      'fa-palette','fa-flask','fa-graduation-cap','fa-language','fa-pen-nib'];
const SUBJECTS_LIST= ['Английский язык','Математика','Физика','Химия','Биология','История',
                      'Русский язык','Кыргызский язык','Литература','Информатика','География','Другой'];

// ── XSS-safe escape ───────────────────────────────────────
const esc = v => String(v ?? '').replace(/[&<>"']/g, m =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

// ── ID-helpers ────────────────────────────────────────────
// DOM-атрибуты дают строки, JSON — числа. String-compare везде.
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// ── Дата/время (всегда локальное, не UTC) ─────────────────
const pad2          = n => String(n).padStart(2, '0');
const toLocalDateStr = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const today         = () => toLocalDateStr(new Date());
const curMonth      = () => { const d=new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; };
const fmtDate       = d => {
  if (!d) return '—';
  const p = String(d).slice(0, 10).split('-');
  return p.length < 3 ? '—' : `${p[2]}.${p[1]}.${p[0]}`;
};
// new Date('YYYY-MM-DD') → UTC midnight ≠ local midnight → используем ручной парсинг
function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
const fmtMoney = n => Number(n || 0).toLocaleString('ru-RU') + ' ' + CURRENCY;
const avColor  = n => { let s=0; for (const c of String(n||'')) s+=c.charCodeAt(0); return AV_COLORS[s % AV_COLORS.length]; };
const uid      = () => Math.random().toString(36).substr(2, 9);

// ── CSS/атрибут-инъекция protection ───────────────────────
// esc() не спасает от HEX-payload вида "#000;background:url()"
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SAFE_ICON_RE = /^[a-z0-9-]+$/i;
function safeColor(v, fallback = '#2563eb') {
  return (typeof v === 'string' && HEX_COLOR_RE.test(v.trim())) ? v.trim() : fallback;
}
function safeIconClass(v, fallback = 'fa-book') {
  return (typeof v === 'string' && SAFE_ICON_RE.test(v.trim())) ? v.trim() : fallback;
}
