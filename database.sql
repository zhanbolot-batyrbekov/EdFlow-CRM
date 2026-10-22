-- database: :memory:
-- CRM Учебный центр v6.0
CREATE DATABASE IF NOT EXISTS lyceum89 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lyceum89;

CREATE TABLE IF NOT EXISTS users (
  id           VARCHAR(20)  NOT NULL PRIMARY KEY,
  login        VARCHAR(100) NOT NULL UNIQUE,
  pass         VARCHAR(255) NOT NULL,
  role         ENUM('admin','teacher','student') NOT NULL DEFAULT 'student',
  fname        VARCHAR(100) NOT NULL DEFAULT '',
  lname        VARCHAR(100) NOT NULL DEFAULT '',
  phone        VARCHAR(50)  DEFAULT '',
  guardian     VARCHAR(255) DEFAULT '',
  birth_date   DATE         DEFAULT NULL,
  end_date     DATE         DEFAULT NULL,
  subjects     TEXT         DEFAULT NULL,
  avatar       MEDIUMTEXT   DEFAULT NULL,
  av_color     VARCHAR(7)   DEFAULT '#2563eb',
  is_graduated TINYINT(1)   NOT NULL DEFAULT 0,
  graduated_group VARCHAR(100) DEFAULT '',
  created      DATE         DEFAULT (CURDATE()),
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS courses (
  id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT DEFAULT NULL,
  color       VARCHAR(7)   DEFAULT '#2563eb',
  icon        VARCHAR(50)  DEFAULT 'fa-book',
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS groups_tbl (
  id           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  course_id    INT NOT NULL,
  teacher_id   VARCHAR(20)  DEFAULT NULL,
  price        DECIMAL(10,2) DEFAULT 0,
  level        VARCHAR(50)  DEFAULT '',
  max_students INT          DEFAULT 20,
  is_active    TINYINT(1)   DEFAULT 1,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id)  REFERENCES courses(id)    ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id)      ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS group_students (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_id   INT NOT NULL,
  student_id VARCHAR(20) NOT NULL,
  joined_at  DATE DEFAULT (CURDATE()),
  UNIQUE KEY uq_gs (group_id, student_id),
  FOREIGN KEY (group_id)   REFERENCES groups_tbl(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id)      ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schedule (
  id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_id    INT NOT NULL,
  teacher_id  VARCHAR(20) DEFAULT NULL,
  day_of_week TINYINT NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  room        VARCHAR(50) DEFAULT '',
  subject     VARCHAR(100) DEFAULT '',
  FOREIGN KEY (group_id)  REFERENCES groups_tbl(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(20) NOT NULL,
  group_id   INT NOT NULL,
  date       DATE NOT NULL,
  present    TINYINT(1) NOT NULL DEFAULT 1,
  note       TEXT DEFAULT NULL,
  UNIQUE KEY uq_att (student_id, group_id, date),
  FOREIGN KEY (student_id) REFERENCES users(id)      ON DELETE CASCADE,
  FOREIGN KEY (group_id)   REFERENCES groups_tbl(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(20) NOT NULL,
  group_id   INT NOT NULL,
  month      VARCHAR(7)  NOT NULL,
  months_count INT NOT NULL DEFAULT 1,
  paid       TINYINT(1)  NOT NULL DEFAULT 0,
  amount     DECIMAL(10,2) DEFAULT 0,
  paid_at    TIMESTAMP   DEFAULT NULL,
  note       VARCHAR(255) DEFAULT '',
  UNIQUE KEY uq_pay (student_id, group_id, month),
  FOREIGN KEY (student_id) REFERENCES users(id)      ON DELETE CASCADE,
  FOREIGN KEY (group_id)   REFERENCES groups_tbl(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  token      VARCHAR(64)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(20)  NOT NULL,
  expires_at TIMESTAMP    NOT NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- admin / admin123
INSERT IGNORE INTO users (id,login,pass,role,fname,lname) VALUES
  ('u_admin','admin','$2y$12$R6D7VmJb1/ABXBjxBxfUvuY.Q5L6Q0.j25wKkEBETMkLLvjFnl8XS','admin','Администратор','Системы');

INSERT IGNORE INTO courses (id,name,description,color,icon) VALUES
  (1,'Английский язык','Для всех уровней','#2563eb','fa-globe'),
  (2,'Математика','Алгебра и геометрия','#059669','fa-calculator'),
  (3,'Программирование','Python, Web','#7c3aed','fa-laptop-code');

-- ── Справочник предметов (полностью управляемый) ──
CREATE TABLE IF NOT EXISTS subjects_list (
  id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  sort_order INT          DEFAULT 0
) ENGINE=InnoDB;

INSERT IGNORE INTO subjects_list (name, sort_order) VALUES
  ('Английский язык',1),('Русский язык',2),('Кыргызский язык',3),
  ('Математика',4),('Физика',5),('Химия',6),('Биология',7),
  ('История',8),('География',9),('Литература',10),('Информатика',11);

-- ── Страница "О нас" ──────────────────────────
CREATE TABLE IF NOT EXISTS about (
  id        INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  field_key VARCHAR(50) NOT NULL UNIQUE,
  field_val TEXT        DEFAULT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO about (field_key, field_val) VALUES
  ('name',    'Учебный центр'),
  ('slogan',  'Качественное образование для каждого'),
  ('address', ''),
  ('phone',   ''),
  ('email',   ''),
  ('website', ''),
  ('director',''),
  ('founded', ''),
  ('desc',    '');

-- ── guardian_phone в users ────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(50) DEFAULT '' AFTER guardian;
