// ═══════════════════════════════════════════════════════════
// validation.js  —  Единый фреймворк валидации форм
//                   Зависит от: utils.js
// ═══════════════════════════════════════════════════════════
// Использование:
//   const ok = validateForm([
//     { id: 'user-fname', rules: ['required'], label: 'Имя' },
//     { id: 'user-login', rules: ['required', 'login'], label: 'Логин' },
//     { id: 'user-pass',  rules: ['minlen:6'],          label: 'Пароль', skipIf: !!editId },
//     { id: 'group-price',rules: ['required', 'pos'],   label: 'Цена' },
//   ]);
//   if (!ok) return;  // форма уже показала ошибки

// Набор правил. Каждое правило возвращает true (ок) или строку с ошибкой.
const RULES = {
  required: v => v.trim() !== ''              || 'Поле обязательно',
  pos:      v => parseFloat(v) > 0            || 'Должно быть > 0',
  pos0:     v => parseFloat(v) >= 0           || 'Должно быть ≥ 0',
  posint:   v => /^\d+$/.test(v.trim()) && parseInt(v)>0 || 'Целое число > 0',
  phone:    v => v.trim()==='' || /^[+\d\s()\-]{6,}$/.test(v.trim()) || 'Некорректный номер',
  login:    v => /^[a-zA-Z0-9_.]{3,32}$/.test(v.trim()) || 'Логин: a-z, 0-9, _, длина 3–32',
  month:    v => /^\d{4}-\d{2}$/.test(v)     || 'Формат: ГГГГ-ММ',
  date:     v => v.trim()==='' || /^\d{4}-\d{2}-\d{2}$/.test(v) || 'Формат: ГГГГ-ММ-ДД',
};

// Правила с параметрами: 'minlen:6', 'maxlen:100', 'min:1', 'max:60'
function applyRule(ruleStr, rawVal) {
  const [name, param] = ruleStr.split(':');
  const v = String(rawVal ?? '');
  if (name in RULES) return RULES[name](v, param);
  if (name === 'minlen') return v.trim().length >= parseInt(param) || `Минимум ${param} символов`;
  if (name === 'maxlen') return v.trim().length <= parseInt(param) || `Максимум ${param} символов`;
  if (name === 'min')    return parseFloat(v) >= parseFloat(param) || `Минимум ${param}`;
  if (name === 'max')    return parseFloat(v) <= parseFloat(param) || `Максимум ${param}`;
  return true; // неизвестное правило пропускаем
}

// ── Показывает ошибку у конкретного поля ──────────────────
function setFieldError(el, msg) {
  el.classList.add('input-error');
  let hint = el.nextElementSibling;
  if (!hint || !hint.classList.contains('field-error')) {
    hint = document.createElement('div');
    hint.className = 'field-error';
    el.parentNode.insertBefore(hint, el.nextSibling);
  }
  hint.textContent = msg;
  hint.style.display = 'block';
}

// ── Убирает ошибку у конкретного поля ─────────────────────
function clearFieldError(el) {
  el.classList.remove('input-error');
  const hint = el.nextElementSibling;
  if (hint?.classList.contains('field-error')) hint.style.display = 'none';
}

// ── Сбрасывает ВСЕ ошибки внутри контейнера ──────────────
function clearValidation(containerOrId) {
  const c = typeof containerOrId === 'string'
    ? document.getElementById(containerOrId)
    : containerOrId;
  if (!c) return;
  c.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
  c.querySelectorAll('.field-error').forEach(el => { el.style.display = 'none'; });
}

// ── Главная функция ───────────────────────────────────────
// fields: [{ id, rules[], label?, skipIf? }]
// Возвращает true, если все поля прошли; иначе false + визуальная подсветка.
function validateForm(fields) {
  let ok = true;
  for (const { id, rules = [], label = '', skipIf = false } of fields) {
    const el = document.getElementById(id);
    if (!el || skipIf) continue;
    clearFieldError(el);
    const val = el.value ?? '';
    for (const rule of rules) {
      const result = applyRule(rule, val);
      if (result !== true) {
        setFieldError(el, result);
        if (ok) el.focus(); // фокус на первое ошибочное поле
        ok = false;
        break;
      }
    }
    // Авто-очистка ошибки при вводе
    el.addEventListener('input', () => clearFieldError(el), { once: true });
  }
  return ok;
}
