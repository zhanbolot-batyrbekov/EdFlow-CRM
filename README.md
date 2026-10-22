# 🎓 EdFlow CRM — Профессиональная система управления учебным центром

[![PHP](https://img.shields.io/badge/PHP-777BB4?style=for-the-badge&logo=php&logoColor=white)](https://php.net)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org)
[![MySQL](https://img.shields.io/badge/MySQL-00000F?style=for-the-badge&logo=mysql&logoColor=white)](https://mysql.com)
[![Status](https://img.shields.io/badge/Status-Production%20Ready-success?style=for-the-badge)]()

**EdFlow CRM** — это легковесная, быстрая и безопасная веб-система для автоматизации учебных центров, языковых школ и курсов. Проект спроектирован с упором на производительность, безопасность данных и удобный интерфейс для трех ролей пользователей: администраторов, преподавателей и студентов.

---

## ✨ Ключевые возможности

- 🔐 **Многоуровневая ролевая модель (RBAC):**
  - **Администратор:** Полный контроль над структурой центра, финансами, аналитикой, архивом и глобальными настройками.
  - **Преподаватель:** Доступ к своим группам, электронному журналу посещаемости и индивидуальному расписанию.
  - **Студент:** Персональный личный кабинет с расписанием занятий и статусом обучения.
- 📅 **Интерактивное расписание:**
  - Недельная сетка занятий с фильтрацией по группам[span_24](start_span)[span_24](end_span).
  - Управление аудиториями, предметами и преподавателями[span_25](start_span)[span_25](end_span).
- 📊 **Электронный журнал посещаемости:**
  - 3-статусная система отметок (`присутствовал` / `отсутствовал` / `не отмечено`)[span_26](start_span)[span_26](end_span).
  - Автоматический расчет процента посещаемости за месяц[span_27](start_span)[span_27](end_span).
- 💰 **Продвинутый финансовый модуль:**
  - Учет оплат, расчет задолженностей и средних чеков[span_28](start_span)[span_28](end_span).
  - Алгоритм «жадного заполнения» для распределения средств по периодам[span_29](start_span)[span_29](end_span).
- 📱 **Адаптивный UI / UX:**
  - Поддержка светлой и темной тем оформления[span_30](start_span)[span_30](end_span).
  - Оптимизация под мобильные устройства (мощная нижняя панель навигации)[span_31](start_span)[span_31](end_span)[span_32](start_span)[span_32](end_span).

---

## 🛠 Технологический стек

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 (CSS Variables, Flexbox, Grid)[span_33](start_span)[span_33](end_span)[span_34](start_span)[span_34](end_span).
- **Backend:** PHP ( REST-подобная архитектура через единый контроллер `api.php`, транзакции PDO)[span_35](start_span)[span_35](end_span)[span_36](start_span)[span_36](end_span).
- **Database:** MySQL / MariaDB (с оптимизированными индексами и внешними ключами)[span_37](start_span)[span_37](end_span).

---

## 📁 Структура проекта

```text
├── api.php              # Главный защищенный бэкенд-контроллер (API)[span_38](start_span)[span_38](end_span)
├── config.php           # Подключение к БД (PDO) и базовые константы[span_39](start_span)[span_39](end_span)
├── index.html           # Главный шаблон приложения и модальные окна[span_40](start_span)[span_40](end_span)
├── style.css            # Таблица стилей (темная/светлая тема, адаптив)[span_41](start_span)[span_41](end_span)
└── js/
    ├── utils.js         # Утилиты, форматирование дат, XSS-защита[span_42](start_span)[span_42](end_span)
    ├── state.js         # Глобальное состояние и финансовые расчеты[span_43](start_span)[span_43](end_span)
    ├── api-client.js    # HTTP-клиент (Fetch API) и управление токенами[span_44](start_span)[span_44](end_span)
    ├── validation.js    # Фреймворк клиентской валидации форм[span_45](start_span)[span_45](end_span)
    ├── ui.js            # Компоненты интерфейса, тосты, темы, часы[span_46](start_span)[span_46](end_span)
    ├── groups.js        # Управление группами и курсами[span_47](start_span)[span_47](end_span)
    ├── attendance.js    # Логика журнала посещаемости[span_48](start_span)[span_48](end_span)
    ├── finance.js       # Финансовые отчеты и платежи[span_49](start_span)[span_49](end_span)
    ├── students.js      # Управление учениками и преподавателями[span_50](start_span)[span_50](end_span)
    ├── schedule.js      # Модуль расписания занятий[span_51](start_span)[span_51](end_span)
    ├── profile.js       # Настройки профиля и аватарки[span_52](start_span)[span_52](end_span)
    └── app-init.js      # Точка входа, роутинг и инициализация приложения[span_53](start_span)[span_53](end_span)
