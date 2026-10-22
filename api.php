<?php
error_reporting(E_ALL); ini_set('display_errors','0'); ob_start();
require_once __DIR__.'/config.php';

// ════ CORS ═══════════════════════════════════════════════════════════════
// Раньше: 'Access-Control-Allow-Origin: *' — любой сайт в браузере мог дёргать
// API CRM с персональными и финансовыми данными. Теперь — белый список доменов
// из config.php (ALLOWED_ORIGINS = ['https://your-frontend.example', ...]).
// Если константа не определена — список пуст, и заголовок просто не отправляется
// (безопасный дефолт: браузер блокирует cross-origin чтение ответа). Запросы
// с того же origin, что и сам API, в CORS не нуждаются и не затрагиваются.
$__allowedOrigins = defined('ALLOWED_ORIGINS') ? ALLOWED_ORIGINS : [];
$__origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($__origin !== '' && in_array($__origin, $__allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: '.$__origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Token, Authorization');
if ($_SERVER['REQUEST_METHOD']==='OPTIONS'){ob_clean();http_response_code(204);exit;}
header('Content-Type: application/json; charset=utf-8');

// ════ ОБРАБОТКА ОШИБОК ═══════════════════════════════════════════════════
// error_reporting(0) ранее глушил вообще всё на уровне ядра PHP, а
// set_exception_handler перехватывал только Throwable — обычные Warning/Notice
// проходили мимо и могли "молча" portить данные в БД. Теперь error_reporting
// выставлен в E_ALL (показ зрителю всё равно отключён display_errors=0), а
// set_error_handler конвертирует любые предупреждения/уведомления в
// ErrorException, который дальше штатно ловит set_exception_handler ниже и
// возвращает структурированный JSON 500. Оператор @ продолжает работать как
// раньше: на время подавленного вызова error_reporting() внутри обработчика
// равен 0, и обработчик в этом случае просто возвращает false.
set_error_handler(function($severity, $message, $file, $line){
    if (!(error_reporting() & $severity)) { return false; }
    // E_DEPRECATED/E_USER_DEPRECATED не считаем "молчаливым повреждением
    // данных" — это просто сигнал об устаревшем API на будущее (например,
    // из стороннего кода в config.php после обновления версии PHP).
    // Логируем и не прерываем запрос исключением, чтобы редкая безобидная
    // deprecation-нотиса не превращалась в 500-ю ошибку у пользователя.
    if (in_array($severity, [E_DEPRECATED, E_USER_DEPRECATED], true)) {
        error_log("Deprecated: $message in $file:$line");
        return true;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(function(Throwable $e){
    ob_clean(); http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok'=>false,'error'=>$e->getMessage()],JSON_UNESCAPED_UNICODE); exit;
});

function json_ok($data=null):void{ ob_clean(); header('Content-Type: application/json; charset=utf-8'); echo json_encode(['ok'=>true,'data'=>$data],JSON_UNESCAPED_UNICODE); exit; }
function json_err(string $msg,int $code=400):void{ ob_clean(); http_response_code($code); header('Content-Type: application/json; charset=utf-8'); echo json_encode(['ok'=>false,'error'=>$msg],JSON_UNESCAPED_UNICODE); exit; }

// ════ БЕЗОПАСНЫЕ (лёгкие) НАБОРЫ ПОЛЕЙ users ═════════════════════════════
// Единый источник правды для "безопасного" SELECT по таблице users: без
// avatar (Base64-картинка до 5MB) и без pass. Это устраняет SELECT * / u.*
// в авторизации и списках пользователей — главную причину OOM при выдаче
// 50-100 пользователей одним запросом (см. пояснение в конце ответа, п.1).
// avatar выбирается ТОЛЬКО точечно по id (handleMe, handleLogin, профиль).
const USER_SAFE_FIELDS   = 'id, login, role, fname, lname, phone, guardian, guardian_phone, birth_date, end_date, subjects, av_color, created, is_graduated, graduated_group';
const USER_SAFE_FIELDS_U = 'u.id, u.login, u.role, u.fname, u.lname, u.phone, u.guardian, u.guardian_phone, u.birth_date, u.end_date, u.subjects, u.av_color, u.created, u.is_graduated, u.graduated_group';

function currentUser():?array{
    $token=getToken(); if(!$token) return null;
    $st=db()->prepare('SELECT '.USER_SAFE_FIELDS_U.' FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>NOW() LIMIT 1');
    $st->execute([$token]); return $st->fetch()?:null;
}
function requireAuth():array{ $u=currentUser(); if(!$u) json_err('Unauthorized',401); return $u; }
function requireAdmin():array{ $u=requireAuth(); if($u['role']!=='admin') json_err('Forbidden',403); return $u; }
function requireAdminOrTeacher():array{ $u=requireAuth(); if(!in_array($u['role'],['admin','teacher'])) json_err('Forbidden',403); return $u; }

/*
 * ═══════════════════════════════════════════════════════════════════════
 * ФИНАНСОВЫЙ МОДУЛЬ — ИСПРАВЛЕНИЯ (см. handlePayments, handleGroups,
 * handleDashboard, handleUsers/handleAttendance/handleGroupStudents/handleAbout)
 * ───────────────────────────────────────────────────────────────────────
 * 1) Деньги (groups_tbl.price, payments.amount) обрабатываются ТОЛЬКО как
 *    целые числа (целый сом). В PHP нигде не выполняется float/double-
 *    арифметика над денежными суммами (никаких (float)$price*$months).
 *    Суммовые/средние показатели считаются точной DECIMAL-арифметикой
 *    MySQL (SUM/ROUND на стороне БД), а не сложением float в PHP.
 *    Если колонки price/amount сейчас FLOAT/DOUBLE — для самого файла это
 *    не критично (значения приводятся к int на входе/выходе), но для
 *    надёжности рекомендуется (опционально, отдельной миграцией):
 *      ALTER TABLE groups_tbl MODIFY price  INT UNSIGNED NOT NULL DEFAULT 0;
 *      ALTER TABLE payments   MODIFY amount INT UNSIGNED NOT NULL DEFAULT 0;
 *
 * 2) Цепочки связанных запросов обёрнуты в ACID-транзакции
 *    (beginTransaction/commit), с блокировкой задействованных строк
 *    (SELECT ... FOR UPDATE), где это предотвращает гонки:
 *      - handlePayments()      — чтение цены группы + запись оплаты
 *      - handleUsers() DELETE  — архивация студента + удаление сессий
 *      - handleAttendance() POST — пакетная запись посещаемости группы
 *      - handleGroupStudents() POST — проверка студента + добавление в группу
 *      - handleAbout() POST    — пакетное обновление настроек
 *
 * 3) Каждая транзакция обёрнута в try/catch: при любой ошибке выполняется
 *    rollBack(), клиенту возвращается понятная ошибка, процесс не «зависает»
 *    и частично записанные данные не остаются в базе.
 * ═══════════════════════════════════════════════════════════════════════
 */

// ════ MONEY HELPERS (целочисленная арифметика, без float/double) ═══════
function moneyToInt($value): int {
    if ($value === null || $value === '') return 0;
    if (is_int($value)) return $value;
    if (is_bool($value)) return $value ? 1 : 0;
    $s = is_string($value) ? trim(str_replace([' ', "\xC2\xA0", ','], ['', '', '.'], $value)) : $value;
    if ($s === '' || !is_numeric($s)) return 0;
    // round() здесь — единственная точка, где временно участвует float,
    // и только для того, чтобы привести введённое значение к целому сому.
    $r = round((float)$s);
    if (!is_finite($r)) return 0;
    return (int)$r;
}
function moneyPositiveInt($value, string $field='Сумма'): int {
    $v = moneyToInt($value);
    if ($v < 0) json_err("$field не может быть отрицательной");
    return $v;
}

// ════ ПАГИНАЦИЯ (опциональная, обратно совместимая) ═════════════════════
// Если клиент не передал limit — поведение НЕ меняется (возвращается весь
// список, как раньше), чтобы не сломать текущий фронтенд. Если limit передан —
// он жёстко ограничен сверху (200), а offset считается из page или передаётся
// напрямую. Используется в списках, которые потенциально растут без предела
// (handleUsers, handlePayments) — см. п.3.4 в пояснениях.
function applyOptionalPagination(string $sql, int $maxLimit=200): string {
    if(!isset($_GET['limit'])) return $sql;
    $limit=max(1,min($maxLimit,(int)$_GET['limit']));
    $page=max(1,(int)($_GET['page']??1));
    $offset=isset($_GET['offset'])?max(0,(int)$_GET['offset']):($page-1)*$limit;
    return $sql.' LIMIT '.$limit.' OFFSET '.$offset;
}

$method=$_SERVER['REQUEST_METHOD']; $action=$_GET['action']??''; $id=$_GET['id']??'';
$body=[]; $raw=file_get_contents('php://input'); if($raw) $body=json_decode($raw,true)??[];

switch($action){
    case 'login':           handleLogin();                           break;
    case 'logout':          handleLogout();                          break;
    case 'me':              handleMe();                              break;
    case 'users':           handleUsers($method,$id,$body);          break;
    case 'courses':         handleCourses($method,$id,$body);        break;
    case 'groups':          handleGroups($method,$id,$body);         break;
    case 'group_students':  handleGroupStudents($method,$id,$body);  break;
    case 'schedule':        handleSchedule($method,$id,$body);       break;
    case 'attendance':      handleAttendance($method,$id,$body);     break;
    case 'payments':        handlePayments($method,$id,$body);       break;
    case 'dashboard':       handleDashboard();                       break;
    case 'avatar':          handleAvatar();                          break;
    case 'my_schedule':     handleMySchedule();                      break;
    case 'export_students': handleExportStudents();                  break;
    case 'about':           handleAbout($method,$id,$body);          break;
    case 'subjects':        handleSubjects($method,$id,$body);       break;
    case 'reset_pass':      handleResetPass();                       break;
    default:                json_err('Unknown action',404);
}

// ════ AUTH ════════════════════════════════════════
function handleLogin(){
    global $body;
    $login=trim($body['login']??''); $pass=$body['pass']??'';
    if(!$login||!$pass) json_err('Заполните все поля');
    // Лёгкая выборка без avatar (см. п.1.1) + pass только для проверки пароля.
    $st=db()->prepare('SELECT pass, '.USER_SAFE_FIELDS.' FROM users WHERE login=? LIMIT 1');
    $st->execute([$login]); $user=$st->fetch();
    if(!$user||!password_verify($pass,$user['pass'])) json_err('Неверный логин или пароль');
    if($user['is_graduated']) json_err('Аккаунт архивирован');
    $token=bin2hex(random_bytes(32)); $exp=date('Y-m-d H:i:s',strtotime('+30 days'));
    db()->prepare('INSERT INTO sessions(token,user_id,expires_at)VALUES(?,?,?)')->execute([$token,$user['id'],$exp]);
    // avatar — отдельным легковесным запросом по ID, не через общий SELECT (п.1.1).
    $avStmt=db()->prepare('SELECT avatar FROM users WHERE id=? LIMIT 1');
    $avStmt->execute([$user['id']]); $user['avatar']=$avStmt->fetchColumn() ?: null;
    unset($user['pass']); json_ok(['token'=>$token,'user'=>$user]);
}
function handleLogout(){ $t=getToken(); if($t) db()->prepare('DELETE FROM sessions WHERE token=?')->execute([$t]); json_ok(); }
function handleMe(){
    $u=requireAuth();
    // avatar — отдельным легковесным запросом по ID (см. п.1.1).
    $avStmt=db()->prepare('SELECT avatar FROM users WHERE id=? LIMIT 1');
    $avStmt->execute([$u['id']]); $u['avatar']=$avStmt->fetchColumn() ?: null;
    json_ok($u);
}

// ════ USERS ═══════════════════════════════════════
function handleUsers($method,$id,$body){
    $cu=requireAuth();
    if($method==='GET'){
        // Учителя и студенты могут смотреть свой профиль.
        // (string)-приведение обеих сторон (см. п.4.1): если PDO когда-либо
        // вернёт id текущего пользователя как int при строковом $_GET['id'],
        // строгое === не должно ломать доступ к собственному профилю.
        if($id && (string)$id===(string)$cu['id']){
            $st=db()->prepare('SELECT '.USER_SAFE_FIELDS.' FROM users WHERE id=? LIMIT 1');
            $st->execute([$id]); $r=$st->fetch(); if(!$r) json_err('Не найдено',404);
            $avStmt=db()->prepare('SELECT avatar FROM users WHERE id=? LIMIT 1');
            $avStmt->execute([$id]); $r['avatar']=$avStmt->fetchColumn() ?: null;
            json_ok($r);
        }
        if($cu['role']!=='admin') json_err('Forbidden',403);
        $role=$_GET['role']??''; $active=$_GET['active']??'1'; $sort=$_GET['sort']??'name';
        // Явный список полей без avatar/pass (см. п.1.1): массовая выборка не
        // должна тащить Base64-картинки до 5MB на пользователя — иначе на
        // 50-100 пользователях сервер исчерпывает память (Allowed memory size
        // exhausted) и падает.
        $sql='SELECT '.USER_SAFE_FIELDS.' FROM users WHERE 1=1';
        $params=[];
        if($role){ $sql.=' AND role=?'; $params[]=$role; }
        if($active!=='all'){ $sql.=' AND is_graduated=?'; $params[]=$active==='1'?0:1; }
        switch($sort){
            case 'birth': $sql.=' ORDER BY birth_date ASC'; break;
            case 'end':   $sql.=' ORDER BY end_date ASC';   break;
            case 'name':  default: $sql.=' ORDER BY role,lname,fname'; break;
        }
        // Пагинация опциональна (см. п.3.4): без ?limit= контракт не меняется
        // и возвращается весь список, как раньше.
        $sql=applyOptionalPagination($sql);
        $st=db()->prepare($sql); $st->execute($params); $rows=$st->fetchAll();
        json_ok($rows);
    }
    requireAdmin();
    if($method==='POST'){ createUser($body); return; }
    if($method==='PUT'){
        if(!$id) json_err('ID required');
        // Восстановление из архива — отдельная, более узкая операция: не
        // требует login/fname и т.д. (как полный updateUserRecord), просто
        // снимает флаг is_graduated. Статус оплаты пересчитывать отдельно
        // не нужно: и на фронте, и здесь он всегда считается "на лету" от
        // текущего end_date, а не кэшируется при архивации/восстановлении.
        if(!empty($body['restore'])){
            db()->prepare('UPDATE users SET is_graduated=0 WHERE id=?')->execute([$id]);
            json_ok();
        }
        updateUserRecord($id,$body); return;
    }
    if($method==='DELETE'){
        if(!$id) json_err('ID required');
        $force=(int)($body['force']??0);
        $gname=$body['graduated_group']??'';
        if($force){
            db()->prepare('DELETE FROM users WHERE id=?')->execute([$id]);
        } else {
            // Архивация студента + завершение сессий + очистка привязок к
            // группам — единая ACID-транзакция (см. п.2.1). Без удаления из
            // group_students архивный студент продолжал бы учитываться в
            // лимите max_students группы ("фантомный" студент навсегда
            // занимающий место).
            // end_date=CURDATE(): фиксируем дату завершения обучения именно
            // как дату архивации (а не доверяем произвольной дате от клиента) —
            // это и есть "дата завершения обучения" из требований.
            $pdo=db();
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            try{
                $pdo->beginTransaction();
                $pdo->prepare('UPDATE users SET is_graduated=1,graduated_group=?,end_date=CURDATE() WHERE id=?')->execute([$gname,$id]);
                $pdo->prepare('DELETE FROM sessions WHERE user_id=?')->execute([$id]);
                $pdo->prepare('DELETE FROM group_students WHERE student_id=?')->execute([$id]);
                $pdo->commit();
            } catch(\Throwable $e){
                if($pdo->inTransaction()) $pdo->rollBack();
                json_err('Не удалось архивировать пользователя. Изменения отменены.',500);
            }
        }
        json_ok();
    }
    json_err('Method not allowed',405);
}

function createUser(array $b):void{
    $login=trim($b['login']??''); $pass=$b['pass']??'';
    $fname=trim($b['fname']??''); $lname=trim($b['lname']??'');
    $role=$b['role']??'student';
    if(!$login) json_err('Логин обязателен');
    if(!$pass)  json_err('Пароль обязателен');
    if(!$fname) json_err('Имя обязательно');
    if(!in_array($role,['admin','teacher','student'])) json_err('Неверная роль');
    $st=db()->prepare('SELECT id FROM users WHERE login=? LIMIT 1'); $st->execute([$login]);
    if($st->fetch()) json_err('Логин уже занят');
    $id=uid();
    $subs=is_array($b['subjects']??null)?implode(',',$b['subjects']):($b['subjects']??'');
    db()->prepare('INSERT INTO users(id,login,pass,role,fname,lname,phone,guardian,guardian_phone,birth_date,end_date,subjects,av_color,created)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$id,$login,password_hash($pass,PASSWORD_DEFAULT),$role,$fname,$lname,
            $b['phone']??'',$b['guardian']??'',$b['guardian_phone']??'',$b['birth_date']??null,$b['end_date']??null,
            $subs,'#2563eb',date('Y-m-d')]);
    json_ok(['id'=>$id,'login'=>$login]);
}

function updateUserRecord(string $id,array $b):void{
    $login=trim($b['login']??''); $fname=trim($b['fname']??'');
    if(!$login) json_err('Логин обязателен');
    if(!$fname) json_err('Имя обязательно');
    $st=db()->prepare('SELECT id FROM users WHERE login=? AND id!=? LIMIT 1'); $st->execute([$login,$id]);
    if($st->fetch()) json_err('Логин уже занят');
    $subs=is_array($b['subjects']??null)?implode(',',$b['subjects']):($b['subjects']??'');
    $av=!empty($b['av_color'])?$b['av_color']:'#2563eb';
    if(!empty($b['pass'])){
        db()->prepare('UPDATE users SET login=?,pass=?,role=?,fname=?,lname=?,phone=?,guardian=?,guardian_phone=?,birth_date=?,end_date=?,subjects=?,av_color=? WHERE id=?')
            ->execute([$login,password_hash($b['pass'],PASSWORD_DEFAULT),$b['role']??'student',$fname,$b['lname']??'',$b['phone']??'',$b['guardian']??'',$b['guardian_phone']??'',$b['birth_date']??null,$b['end_date']??null,$subs,$av,$id]);
    } else {
        db()->prepare('UPDATE users SET login=?,role=?,fname=?,lname=?,phone=?,guardian=?,guardian_phone=?,birth_date=?,end_date=?,subjects=?,av_color=? WHERE id=?')
            ->execute([$login,$b['role']??'student',$fname,$b['lname']??'',$b['phone']??'',$b['guardian']??'',$b['guardian_phone']??'',$b['birth_date']??null,$b['end_date']??null,$subs,$av,$id]);
    }
    json_ok();
}

// ════ COURSES ═════════════════════════════════════
function handleCourses($method,$id,$body){
    requireAuth();
    if($method==='GET'){
        if($id){ $st=db()->prepare('SELECT * FROM courses WHERE id=? LIMIT 1'); $st->execute([$id]); $r=$st->fetch(); if(!$r) json_err('Не найдено',404); json_ok($r); }
        json_ok(db()->query('SELECT * FROM courses ORDER BY name')->fetchAll());
    }
    requireAdmin();
    if($method==='POST'){ $n=trim($body['name']??''); if(!$n) json_err('Название обязательно'); $st=db()->prepare('INSERT INTO courses(name,description,color,icon)VALUES(?,?,?,?)'); $st->execute([$n,$body['description']??'',$body['color']??'#2563eb',$body['icon']??'fa-book']); json_ok(['id'=>db()->lastInsertId()]); }
    if($method==='PUT'){ if(!$id) json_err('ID required'); db()->prepare('UPDATE courses SET name=?,description=?,color=?,icon=? WHERE id=?')->execute([trim($body['name']??''),$body['description']??'',$body['color']??'#2563eb',$body['icon']??'fa-book',$id]); json_ok(); }
    if($method==='DELETE'){ if(!$id) json_err('ID required'); db()->prepare('DELETE FROM courses WHERE id=?')->execute([$id]); json_ok(); }
    json_err('Method not allowed',405);
}

// ════ GROUPS ══════════════════════════════════════
function handleGroups($method,$id,$body){
    $cu=requireAuth();
    if($method==='GET'){
        if($id){
            // student_count считает ТОЛЬКО активных студентов (см. п.2.1):
            // INNER JOIN на users с is_graduated=0 убирает архивных студентов
            // из подсчёта занятых мест, иначе группа с лимитом max_students
            // навсегда "забивается" выпускниками, чьи записи остались в
            // group_students.
            $st=db()->prepare('SELECT g.*,c.name as course_name,c.color as course_color,c.icon as course_icon,
                CONCAT(u.fname," ",u.lname) as teacher_name,
                (SELECT COUNT(*) FROM group_students gs INNER JOIN users u2 ON u2.id=gs.student_id
                    WHERE gs.group_id=g.id AND u2.is_graduated=0) as student_count
                FROM groups_tbl g LEFT JOIN courses c ON c.id=g.course_id LEFT JOIN users u ON u.id=g.teacher_id
                WHERE g.id=? LIMIT 1');
            $st->execute([$id]); $r=$st->fetch(); if(!$r) json_err('Не найдено',404);
            // Преподаватель — доступ только к своей группе, без цены
            // (полный запрет на финансовые данные). Закрыто на сервере, а
            // не только фильтром группы во фронтенде.
            if($cu['role']==='teacher'){
                if((string)($r['teacher_id']??'')!==(string)$cu['id']) json_err('Forbidden',403);
                unset($r['price']);
            }
            // Студент — доступ только к группе, в которой он состоит
            // (нужно, например, для фильтра группы в "Расписание").
            if($cu['role']==='student'){
                $own=db()->prepare('SELECT id FROM group_students WHERE group_id=? AND student_id=? LIMIT 1');
                $own->execute([$id,$cu['id']]);
                if(!$own->fetch()) json_err('Forbidden',403);
            }
            json_ok($r);
        }
        $active=$_GET['active']??'1'; $cid=$_GET['course_id']??'';
        $sql='SELECT g.*,c.name as course_name,c.color as course_color,c.icon as course_icon,
            CONCAT(u.fname," ",u.lname) as teacher_name,
            (SELECT COUNT(*) FROM group_students gs INNER JOIN users u2 ON u2.id=gs.student_id
                WHERE gs.group_id=g.id AND u2.is_graduated=0) as student_count
            FROM groups_tbl g LEFT JOIN courses c ON c.id=g.course_id LEFT JOIN users u ON u.id=g.teacher_id WHERE 1=1';
        $p=[];
        if($active!=='all'){$sql.=' AND g.is_active=?';$p[]=$active==='1'?1:0;}
        if($cid){$sql.=' AND g.course_id=?';$p[]=$cid;}
        // Преподаватель видит только свои группы, закреплённые администратором
        // (см. требования по ролям) — фильтруем на сервере, а не только в
        // выпадающих списках фронтенда (visibleGroups()).
        if($cu['role']==='teacher'){$sql.=' AND g.teacher_id=?';$p[]=$cu['id'];}
        // Студент — только группы, в которых он состоит (та же причина:
        // фильтр группы в "Расписание" не должен предлагать чужие группы).
        if($cu['role']==='student'){$sql.=' AND g.id IN (SELECT group_id FROM group_students WHERE student_id=?)';$p[]=$cu['id'];}
        $sql.=' ORDER BY g.name';
        $st=db()->prepare($sql); $st->execute($p); $rows=$st->fetchAll();
        if($cu['role']==='teacher'){ foreach($rows as &$row) unset($row['price']); }
        json_ok($rows);
    }
    requireAdmin();
    if($method==='POST'){
        $n=trim($body['name']??''); if(!$n||!($body['course_id']??'')) json_err('Название и курс обязательны');
        // Цена — целое число (целый сом), без float-операций.
        $price=moneyPositiveInt($body['price']??0,'Цена');
        // Нижняя граница лимита мест (см. п.4.3): 0/отрицательное значение
        // блокирует логику свободных мест на фронтенде.
        $maxStudents=max(1,(int)($body['max_students']??20));
        $st=db()->prepare('INSERT INTO groups_tbl(name,course_id,teacher_id,price,level,max_students)VALUES(?,?,?,?,?,?)');
        $st->execute([$n,$body['course_id'],$body['teacher_id']??null,$price,$body['level']??'',$maxStudents]);
        json_ok(['id'=>db()->lastInsertId()]);
    }
    if($method==='PUT'){
        if(!$id) json_err('ID required');
        $price=moneyPositiveInt($body['price']??0,'Цена');
        $maxStudents=max(1,(int)($body['max_students']??20));
        db()->prepare('UPDATE groups_tbl SET name=?,course_id=?,teacher_id=?,price=?,level=?,max_students=?,is_active=? WHERE id=?')
            ->execute([trim($body['name']??''),$body['course_id'],$body['teacher_id']??null,$price,$body['level']??'',$maxStudents,(int)($body['is_active']??1),$id]);
        json_ok();
    }
    if($method==='DELETE'){ if(!$id) json_err('ID required'); db()->prepare('UPDATE groups_tbl SET is_active=0 WHERE id=?')->execute([$id]); json_ok(); }
    json_err('Method not allowed',405);
}

// ════ GROUP STUDENTS ══════════════════════════════
function handleGroupStudents($method,$id,$body){
    $cu=requireAuth();
    if($method==='GET'){
        if(!$id) json_err('group_id required');
        // Студент не должен иметь доступа к ростеру группы вообще — там
        // персональные данные ДРУГИХ студентов (телефон, опекун и т.д.).
        // Закрываем на сервере, а не только скрытием пункта меню "Группы".
        if($cu['role']==='student') json_err('Forbidden',403);
        // Преподаватель может смотреть состав ТОЛЬКО группы, закреплённой
        // за ним администратором — даже если знает id чужой группы.
        if($cu['role']==='teacher'){
            $own=db()->prepare('SELECT id FROM groups_tbl WHERE id=? AND teacher_id=? LIMIT 1');
            $own->execute([$id,$cu['id']]);
            if(!$own->fetch()) json_err('Forbidden',403);
        }
        $month=$_GET['month']??date('Y-m');
        if($cu['role']==='teacher'){
            // Конфиденциальность данных: преподаватель видит только ФИО и
            // посещаемость — без контактов (телефон/опекун/логин/дата
            // рождения/срок обучения) и без финансовых полей (оплата).
            $st=db()->prepare('SELECT u.id,u.fname,u.lname,u.av_color,gs.joined_at,
                (SELECT COUNT(*) FROM attendance a WHERE a.student_id=u.id AND a.group_id=? AND DATE_FORMAT(a.date,"%Y-%m")=? AND a.present=1) as present_days,
                (SELECT COUNT(*) FROM attendance a WHERE a.student_id=u.id AND a.group_id=? AND DATE_FORMAT(a.date,"%Y-%m")=?) as total_days
                FROM group_students gs JOIN users u ON u.id=gs.student_id
                WHERE gs.group_id=? AND u.is_graduated=0 ORDER BY u.lname,u.fname');
            $st->execute([$id,$month,$id,$month,$id]);
            json_ok($st->fetchAll());
        }
        // admin — полный набор полей, как раньше.
        // avatar НЕ выбирается в списке (см. п.1.1): ростер группы может
        // отдавать десятки студентов за раз, и Base64-картинка до 5MB на
        // каждого — прямой путь к Allowed memory size exhausted. Если
        // фронтенду нужна именно фотография в ростере, её нужно подгружать
        // лениво по конкретному id студента, а не в общем списке.
        $st=db()->prepare('SELECT u.id,u.fname,u.lname,u.phone,u.birth_date,u.login,u.av_color,
            u.guardian,u.guardian_phone,u.end_date,gs.joined_at,
            (SELECT COUNT(*) FROM attendance a WHERE a.student_id=u.id AND a.group_id=? AND DATE_FORMAT(a.date,"%Y-%m")=? AND a.present=1) as present_days,
            (SELECT COUNT(*) FROM attendance a WHERE a.student_id=u.id AND a.group_id=? AND DATE_FORMAT(a.date,"%Y-%m")=?) as total_days,
            COALESCE((SELECT p.paid FROM payments p WHERE p.student_id=u.id AND p.group_id=? AND p.month=? LIMIT 1),0) as paid,
            COALESCE((SELECT p.amount FROM payments p WHERE p.student_id=u.id AND p.group_id=? AND p.month=? LIMIT 1),0) as paid_amount,
            COALESCE((SELECT p.months_count FROM payments p WHERE p.student_id=u.id AND p.group_id=? AND p.month=? LIMIT 1),1) as months_count,
            COALESCE((SELECT p.note FROM payments p WHERE p.student_id=u.id AND p.group_id=? AND p.month=? LIMIT 1),"") as pay_note
            FROM group_students gs JOIN users u ON u.id=gs.student_id
            WHERE gs.group_id=? AND u.is_graduated=0 ORDER BY u.lname,u.fname');
        $st->execute([$id,$month,$id,$month,$id,$month,$id,$month,$id,$month,$id,$month,$id]);
        json_ok($st->fetchAll());
    }
    requireAdminOrTeacher();
    if($method==='POST'){
        $gid=$body['group_id']??$id; $sid=$body['student_id']??'';
        if(!$gid||!$sid) json_err('group_id и student_id обязательны');
        // Проверка студента + добавление в группу — единая ACID-транзакция,
        // чтобы исключить добавление в группу несуществующего/архивного студента
        // и не оставлять частично выполненную операцию при сбое.
        $pdo=db();
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        try{
            $pdo->beginTransaction();
            $chk=$pdo->prepare("SELECT id FROM users WHERE id=? AND role='student' AND is_graduated=0 LIMIT 1");
            $chk->execute([$sid]);
            if(!$chk->fetch()){ $pdo->rollBack(); json_err('Студент не найден'); }
            $pdo->prepare('INSERT INTO group_students(group_id,student_id)VALUES(?,?)')->execute([$gid,$sid]);
            $pdo->commit();
        } catch(\Throwable $e){
            if($pdo->inTransaction()) $pdo->rollBack();
            json_err('Студент уже в этой группе');
        }
        json_ok();
    }
    if($method==='DELETE'){
        $gid=$_GET['group_id']??$body['group_id']??''; $sid=$_GET['student_id']??$body['student_id']??'';
        if(!$gid||!$sid) json_err('group_id и student_id обязательны');
        db()->prepare('DELETE FROM group_students WHERE group_id=? AND student_id=?')->execute([$gid,$sid]);
        json_ok();
    }
    json_err('Method not allowed',405);
}

// ════ SCHEDULE ════════════════════════════════════
function handleSchedule($method,$id,$body){
    $cu=requireAuth();
    if($method==='GET'){
        $gid=$_GET['group_id']??'';
        if($gid){
            // Запрос расписания конкретной группы — преподаватель может
            // смотреть только свою группу, студент — только группу, в
            // которой он состоит (иначе можно узнать id чужой группы и
            // подсмотреть её расписание напрямую, минуя общий список).
            if($cu['role']==='teacher'){
                $own=db()->prepare('SELECT id FROM groups_tbl WHERE id=? AND teacher_id=? LIMIT 1');
                $own->execute([$gid,$cu['id']]);
                if(!$own->fetch()) json_err('Forbidden',403);
            }
            if($cu['role']==='student'){
                $own=db()->prepare('SELECT id FROM group_students WHERE group_id=? AND student_id=? LIMIT 1');
                $own->execute([$gid,$cu['id']]);
                if(!$own->fetch()) json_err('Forbidden',403);
            }
            $st=db()->prepare('SELECT s.*,CONCAT(u.fname," ",u.lname) as teacher_name FROM schedule s LEFT JOIN users u ON u.id=s.teacher_id WHERE s.group_id=? ORDER BY s.day_of_week,s.start_time');
            $st->execute([$gid]); json_ok($st->fetchAll());
        }
        // Без group_id — общий список. Раньше отдавался ВЕСЬ список без
        // исключения любой авторизованной роли ("видны абсолютно все
        // расписания в системе"). Теперь student/teacher видят только своё
        // (та же логика, что и в handleMySchedule), admin — всё, как раньше.
        if($cu['role']==='student'){
            $st=db()->prepare('SELECT s.*,g.name as group_name,c.name as course_name,c.color as course_color,CONCAT(u.fname," ",u.lname) as teacher_name FROM schedule s JOIN groups_tbl g ON g.id=s.group_id LEFT JOIN courses c ON c.id=g.course_id LEFT JOIN users u ON u.id=s.teacher_id JOIN group_students gs ON gs.group_id=g.id WHERE gs.student_id=? AND g.is_active=1 ORDER BY s.day_of_week,s.start_time');
            $st->execute([$cu['id']]); json_ok($st->fetchAll());
        }
        if($cu['role']==='teacher'){
            $st=db()->prepare('SELECT s.*,g.name as group_name,c.name as course_name,c.color as course_color,CONCAT(u.fname," ",u.lname) as teacher_name FROM schedule s JOIN groups_tbl g ON g.id=s.group_id LEFT JOIN courses c ON c.id=g.course_id LEFT JOIN users u ON u.id=s.teacher_id WHERE (s.teacher_id=? OR g.teacher_id=?) AND g.is_active=1 ORDER BY s.day_of_week,s.start_time');
            $st->execute([$cu['id'],$cu['id']]); json_ok($st->fetchAll());
        }
        $st=db()->query('SELECT s.*,g.name as group_name,c.name as course_name,c.color as course_color,CONCAT(u.fname," ",u.lname) as teacher_name FROM schedule s JOIN groups_tbl g ON g.id=s.group_id LEFT JOIN courses c ON c.id=g.course_id LEFT JOIN users u ON u.id=s.teacher_id WHERE g.is_active=1 ORDER BY s.day_of_week,s.start_time');
        json_ok($st->fetchAll());
    }
    // Расписание — изменять может только admin. Раньше сюда же пускали
    // teacher (requireAdminOrTeacher) — теперь у преподавателя только
    // просмотр, и это закрыто и на сервере, а не только скрытием кнопок
    // в интерфейсе (иначе teacher мог бы редактировать через прямой
    // запрос к API, минуя скрытые кнопки).
    requireAdmin();
    if($method==='POST'){
        $gid=$body['group_id']??''; $day=(int)($body['day_of_week']??0); $start=$body['start_time']??''; $end=$body['end_time']??'';
        if(!$gid||!$day||!$start||!$end) json_err('Все поля обязательны');
        $st=db()->prepare('INSERT INTO schedule(group_id,teacher_id,day_of_week,start_time,end_time,room,subject)VALUES(?,?,?,?,?,?,?)');
        $st->execute([$gid,$body['teacher_id']??null,$day,$start,$end,$body['room']??'',$body['subject']??'']);
        json_ok(['id'=>db()->lastInsertId()]);
    }
    if($method==='PUT'){
        if(!$id) json_err('ID required');
        db()->prepare('UPDATE schedule SET teacher_id=?,day_of_week=?,start_time=?,end_time=?,room=?,subject=? WHERE id=?')
            ->execute([$body['teacher_id']??null,(int)($body['day_of_week']??1),$body['start_time']??'',$body['end_time']??'',$body['room']??'',$body['subject']??'',$id]);
        json_ok();
    }
    if($method==='DELETE'){ if(!$id) json_err('ID required'); db()->prepare('DELETE FROM schedule WHERE id=?')->execute([$id]); json_ok(); }
    json_err('Method not allowed',405);
}

// ════ ATTENDANCE ══════════════════════════════════
function handleAttendance($method,$id,$body){
    $cu=requireAuth();
    if($method==='GET'){
        $gid=$_GET['group_id']??''; $date=$_GET['date']??''; $month=$_GET['month']??'';
        if(!$gid) json_err('group_id required');
        if($date){
            $st=db()->prepare('SELECT student_id,present,note FROM attendance WHERE group_id=? AND date=?');
            $st->execute([$gid,$date]); $map=[];
            foreach($st->fetchAll() as $r) $map[$r['student_id']]=['present'=>(int)$r['present'],'note'=>$r['note']??''];
            json_ok($map);
        }
        // История по месяцу — все даты. Размер ответа естественным образом
        // ограничен числом дней в месяце × состав группы (которая сама
        // ограничена max_students), поэтому отдельная пагинация здесь не
        // добавлена осознанно — см. пояснение к п.3.4 в конце ответа.
        $m=$month?:date('Y-m');
        $st=db()->prepare("SELECT a.student_id,a.date,a.present,a.note,CONCAT(u.fname,' ',u.lname) as student_name FROM attendance a JOIN users u ON u.id=a.student_id WHERE a.group_id=? AND DATE_FORMAT(a.date,'%Y-%m')=? ORDER BY a.date,u.lname");
        $st->execute([$gid,$m]); $rows=$st->fetchAll();
        // Сгруппируем по дате
        $byDate=[];
        foreach($rows as $r){ $byDate[$r['date']][$r['student_id']]=['present'=>(int)$r['present'],'note'=>$r['note']??'']; }
        json_ok($byDate);
    }
    requireAdminOrTeacher();
    if($method==='POST'){
        $gid=$body['group_id']??''; $date=$body['date']??date('Y-m-d'); $att=$body['attendance']??[];
        if(!$gid||empty($att)) json_err('group_id и attendance обязательны');
        // Пакетная запись посещаемости всей группы — единая ACID-транзакция:
        // либо сохраняются все отметки за день, либо (при сбое) ни одна,
        // без "наполовину" записанного дня.
        $pdo=db();
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        try{
            $pdo->beginTransaction();
            $st=$pdo->prepare('INSERT INTO attendance(student_id,group_id,date,present,note)VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE present=VALUES(present),note=VALUES(note)');
            foreach($att as $sid=>$val){
                $present=is_array($val)?(int)($val['present']??1):(int)$val;
                $note=is_array($val)?($val['note']??''):'';
                $st->execute([$sid,$gid,$date,$present,$note]);
            }
            $pdo->commit();
        } catch(\Throwable $e){
            if($pdo->inTransaction()) $pdo->rollBack();
            json_err('Не удалось сохранить посещаемость. Изменения отменены.',500);
        }
        json_ok();
    }
    json_err('Method not allowed',405);
}

// ════ PAYMENTS ════════════════════════════════════
function handlePayments($method,$id,$body){
    // Полный запрет на просмотр/изменение финансовых данных для teacher
    // (и тем более student) — требование закрыто на сервере, не только
    // скрытием вкладки "Оплата" и кнопок на фронтенде.
    requireAdmin();
    if($method==='GET'){
        $gid=$_GET['group_id']??''; $month=$_GET['month']??date('Y-m');
        if(!$gid) json_err('group_id required');
        $sql='SELECT p.*,CONCAT(u.fname," ",u.lname) as student_name FROM payments p JOIN users u ON u.id=p.student_id WHERE p.group_id=? AND p.month=? ORDER BY u.lname,u.fname';
        // Пагинация опциональна (см. п.3.4): без ?limit= контракт не меняется.
        $sql=applyOptionalPagination($sql);
        $st=db()->prepare($sql);
        $st->execute([$gid,$month]);
        $rows=$st->fetchAll();
        // Приводим денежные поля к int явно — независимо от того, как PDO
        // вернул числовой тип колонки (строка/число), на выходе всегда int.
        foreach($rows as &$r){
            $r['amount']=(int)$r['amount'];
            $r['months_count']=(int)$r['months_count'];
            $r['paid']=(int)$r['paid'];
        }
        json_ok($rows);
    }
    if($method==='POST'){
        $sid=trim((string)($body['student_id']??''));
        $gid=trim((string)($body['group_id']??''));
        $month=(string)($body['month']??date('Y-m'));
        if(!$sid||!$gid) json_err('student_id и group_id обязательны');
        if(!preg_match('/^\d{4}-\d{2}$/',$month)) json_err('Некорректный формат месяца');

        $paid=!empty($body['paid'])?1:0;
        $months=(int)($body['months_count']??1);
        if($months<1) $months=1; // защита от деления на 0 при расчёте среднего чека

        $note=trim((string)($body['note']??''));

        // Сумма — ТОЛЬКО целое число. Если её явно не передали — она будет
        // посчитана из актуальной цены группы целочисленным умножением внутри
        // транзакции. Если передан явный 0 (100%-скидка/грантовый бесплатный
        // месяц) — он СОХРАНЯЕТСЯ как есть и не перезаписывается (см. п.2.2).
        $amountRaw=$body['amount']??null;
        $amountGiven=($amountRaw!==null && $amountRaw!=='');
        $amount=$amountGiven?moneyPositiveInt($amountRaw,'Сумма'):0;

        // Цепочка "прочитать актуальную цену группы" + "записать/обновить оплату"
        // выполняется как единая ACID-транзакция с блокировкой строки группы
        // (FOR UPDATE), чтобы параллельное изменение цены не привело к записи
        // оплаты по уже неактуальной стоимости.
        $pdo=db();
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        try{
            $pdo->beginTransaction();

            $g=$pdo->prepare('SELECT id,price FROM groups_tbl WHERE id=? LIMIT 1 FOR UPDATE');
            $g->execute([$gid]);
            $group=$g->fetch();
            if(!$group){ $pdo->rollBack(); json_err('Группа не найдена',404); }

            $chkS=$pdo->prepare("SELECT id FROM users WHERE id=? AND role='student' LIMIT 1");
            $chkS->execute([$sid]);
            if(!$chkS->fetch()){ $pdo->rollBack(); json_err('Студент не найден',404); }

            $price=(int)$group['price'];

            if(!$amountGiven){
                // Сумма не передана фронтендом вообще — целочисленное умножение
                // цены на число месяцев. Явный 0 сюда не попадает (см. п.2.2):
                // условие проверяет только факт передачи суммы, а не её значение.
                $amount=$price*$months;
            }
            if(!$paid){
                // Отмена/снятие оплаты — сумма всегда сбрасывается в 0
                $amount=0;
            }

            $up=$pdo->prepare('INSERT INTO payments(student_id,group_id,month,months_count,paid,amount,paid_at,note)
                VALUES(?,?,?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE months_count=VALUES(months_count),paid=VALUES(paid),amount=VALUES(amount),paid_at=VALUES(paid_at),note=VALUES(note)');

            if ($paid) {
                // ── АЛГОРИТМ ЖАДНОГО ЗАПОЛНЕНИЯ ──────────────────────────────
                // Требование: «сначала полностью закрывается текущий месяц;
                // остаток переносится на следующий».
                //
                // Пример: цена группы = 5 000 сом, студент платит 12 000 сом:
                //   Месяц 0 (текущий): min(12000, 5000) = 5 000 → закрыт полностью
                //   Остаток:           12000 - 5000 = 7 000
                //   Месяц 1 (+1):      min(7000, 5000)  = 5 000 → закрыт полностью
                //   Остаток:           7000 - 5000 = 2 000
                //   Месяц 2 (+2):      min(2000, 5000)  = 2 000 → закрыт частично
                //   Остаток:           0 → стоп
                //
                // Прежний алгоритм ("равное деление") давал 12000/3 = 4000/мес —
                // каждый месяц был бы частично оплачен, хотя студент заплатил
                // конкретную сумму без привязки к периодам.
                //
                // Защита от бесконечного цикла: при цене группы 0 делать нечего;
                // при amount=0 и paid=1 сохраняем один нулевой месяц (скидка/грант).
                if ($price <= 0) {
                    // Группа бесплатная — одна запись с суммой as-is
                    $paidAt = date('Y-m-d H:i:s');
                    $up->execute([$sid,$gid,$month,1,$paid,$amount,$paidAt,$note]);
                } else {
                    $remaining = $amount;
                    $i = 0;
                    [$y,$mo] = array_map('intval', explode('-', $month));
                    $paidAt  = date('Y-m-d H:i:s');
                    do {
                        $ty = $y + intdiv($mo-1+$i, 12);
                        $tm = ($mo-1+$i) % 12 + 1;
                        $targetMonth = sprintf('%04d-%02d', $ty, $tm);
                        $share       = min($remaining, $price);
                        $up->execute([$sid,$gid,$targetMonth,1,1,$share,$paidAt,$note]);
                        $remaining -= $share;
                        $i++;
                    } while ($remaining > 0 && $i < 60); // 60 — safety ceiling (5 лет)
                }
            } else {
                // ── ОТМЕНА ОПЛАТЫ ───────────────────────────────────────────
                // При отмене удаляем ВСЕ записи оплат данного студента в данной
                // группе начиная с указанного месяца (то есть весь "хвост"
                // жадного заполнения), а не только текущий месяц. Иначе при
                // оплате на 3 месяца и последующей отмене первого месяца записи
                // за месяцы +1 и +2 оставались бы "оплаченными".
                $pdo->prepare('DELETE FROM payments WHERE student_id=? AND group_id=? AND month>=?')
                    ->execute([$sid, $gid, $month]);
            }

            $pdo->commit();
        } catch(\Throwable $e){
            if($pdo->inTransaction()) $pdo->rollBack();
            json_err('Не удалось сохранить оплату. Изменения отменены.',500);
        }

        json_ok(['paid'=>$paid,'amount'=>$amount,'months'=>$months]);
    }
    json_err('Method not allowed',405);
}

// ════ DASHBOARD ═══════════════════════════════════
function handleDashboard(){
    $cu=requireAuth();
    // Для студентов — только их данные
    if($cu['role']==='student'){
        $groups=db()->prepare('SELECT g.id,g.name,g.price,c.name as course_name,c.color as course_color,c.icon as course_icon,CONCAT(u.fname," ",u.lname) as teacher_name FROM group_students gs JOIN groups_tbl g ON g.id=gs.group_id LEFT JOIN courses c ON c.id=g.course_id LEFT JOIN users u ON u.id=g.teacher_id WHERE gs.student_id=? AND g.is_active=1');
        $groups->execute([$cu['id']]); $myGroups=$groups->fetchAll();
        $month=date('Y-m');
        $attQ=db()->prepare("SELECT COUNT(*) as total,SUM(present) as present FROM attendance WHERE student_id=? AND DATE_FORMAT(date,'%Y-%m')=?");
        $attQ->execute([$cu['id'],$month]); $att=$attQ->fetch();
        $payQ=db()->prepare("SELECT SUM(paid) as paid_cnt,COUNT(*) as total FROM payments WHERE student_id=? AND month=?");
        $payQ->execute([$cu['id'],$month]); $pay=$payQ->fetch();
        json_ok(['role'=>'student','groups'=>$myGroups,'att_total'=>(int)($att['total']??0),'att_present'=>(int)($att['present']??0),'paid'=>(int)($pay['paid_cnt']??0),'pay_total'=>(int)($pay['total']??0)]);
    }
    // Для учителей — их группы. Без g.price (полный запрет на финансовые
    // данные для teacher — раньше цена пряталась только на фронтенде, хотя
    // сырой ответ API всё равно её отдавал).
    if($cu['role']==='teacher'){
        $groups=db()->prepare('SELECT g.id,g.name,c.name as course_name,c.color as course_color,c.icon as course_icon,(SELECT COUNT(*) FROM group_students gs WHERE gs.group_id=g.id) as student_count FROM groups_tbl g LEFT JOIN courses c ON c.id=g.course_id WHERE g.teacher_id=? AND g.is_active=1');
        $groups->execute([$cu['id']]); $myGroups=$groups->fetchAll();
        $today=date('Y-m-d');
        // Расписание учителя на дашборде синхронизировано с handleMySchedule()
        // (см. п.3.1): раньше выбиралось строго по владельцу группы
        // (g.teacher_id=?), и заменяющий преподаватель, назначенный на
        // конкретный урок через s.teacher_id, не видел его на своём дашборде.
        $sched=db()->prepare('SELECT s.*,g.name as group_name FROM schedule s JOIN groups_tbl g ON g.id=s.group_id
            WHERE (s.teacher_id = ? OR (s.teacher_id IS NULL AND g.teacher_id = ?))
            ORDER BY s.day_of_week,s.start_time');
        $sched->execute([$cu['id'],$cu['id']]); $mySched=$sched->fetchAll();
        json_ok(['role'=>'teacher','groups'=>$myGroups,'schedule'=>$mySched]);
    }
    // Для admin — общая статистика
    $students=(int)db()->query("SELECT COUNT(*) FROM users WHERE role='student' AND is_graduated=0")->fetchColumn();
    $teachers=(int)db()->query("SELECT COUNT(*) FROM users WHERE role='teacher' AND is_graduated=0")->fetchColumn();
    $groups=(int)db()->query("SELECT COUNT(*) FROM groups_tbl WHERE is_active=1")->fetchColumn();
    $month=date('Y-m');
    // Выручка — точная целочисленная SUM по integer-колонке amount, без float.
    $rev=db()->prepare("SELECT COALESCE(SUM(amount),0) FROM payments WHERE month=? AND paid=1");
    $rev->execute([$month]); $revenue=(int)$rev->fetchColumn();
    // Сколько всего студентов сейчас зачислено в активные группы (а не только
    // оплативших) — это база и для "expected", и для среднего чека ниже.
    $enr=db()->query("SELECT COUNT(*) as cnt, COALESCE(SUM(g.price),0) as price_sum FROM group_students gs JOIN groups_tbl g ON g.id=gs.group_id JOIN users u ON u.id=gs.student_id WHERE u.is_graduated=0 AND g.is_active=1")->fetch();
    $totalEnrolled=(int)($enr['cnt']??0);
    $expected=(int)($enr['price_sum']??0);
    // Средний чек = ПОТЕНЦИАЛЬНЫЙ доход на студента в месяц: собранная за месяц
    // сумма (amount/months_count), делённая на ВСЕХ зачисленных студентов, а не
    // только на тех, кто оплатил. Если оплатило меньшинство, чек должен упасть
    // пропорционально — иначе показатель скрывает низкую собираемость.
    // amount явно приводится к DECIMAL перед делением (см. п.4.2) — на стороне
    // MySQL это и раньше была decimal-арифметика, но явный CAST убирает любую
    // зависимость от типа колонки amount и защищает от микропогрешностей;
    // финальное деление на totalEnrolled — единственная точка, где участвует
    // временный float, и то лишь для round() уже готового целого результата.
    $payRow=db()->prepare("SELECT COUNT(*) as cnt, COALESCE(ROUND(SUM(CAST(amount AS DECIMAL(10,2))/months_count)),0) as monthly_collected FROM payments WHERE month=? AND paid=1 AND months_count>0");
    $payRow->execute([$month]); $payData=$payRow->fetch();
    $pc=(int)($payData['cnt']??0);
    $monthlyCollected=(int)($payData['monthly_collected']??0);
    $avgCheck=$totalEnrolled>0?(int)round($monthlyCollected/$totalEnrolled):0;
    // Ближайшие окончания (следующие 30 дней)
    $ending=db()->query("SELECT id,fname,lname,end_date FROM users WHERE role='student' AND is_graduated=0 AND end_date IS NOT NULL AND end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 30 DAY) ORDER BY end_date LIMIT 5")->fetchAll();
    json_ok(['students'=>$students,'teachers'=>$teachers,'groups'=>$groups,'revenue'=>$revenue,'avg_check'=>$avgCheck,'expected'=>$expected,'paid_count'=>$pc,'ending_soon'=>$ending,'month'=>$month]);
}

// ════ MY SCHEDULE (для студента/учителя) ═════════
function handleMySchedule(){
    $cu=requireAuth();
    if($cu['role']==='student'){
        $st=db()->prepare('SELECT s.*,g.name as group_name,c.name as course_name,c.color as course_color,CONCAT(u.fname," ",u.lname) as teacher_name FROM schedule s JOIN groups_tbl g ON g.id=s.group_id LEFT JOIN courses c ON c.id=g.course_id LEFT JOIN users u ON u.id=g.teacher_id JOIN group_students gs ON gs.group_id=g.id WHERE gs.student_id=? ORDER BY s.day_of_week,s.start_time');
        $st->execute([$cu['id']]); json_ok($st->fetchAll());
    }
    if($cu['role']==='teacher'){
        $st=db()->prepare('SELECT s.*,g.name as group_name,c.name as course_name,c.color as course_color FROM schedule s JOIN groups_tbl g ON g.id=s.group_id LEFT JOIN courses c ON c.id=g.course_id WHERE (s.teacher_id=? OR g.teacher_id=?) ORDER BY s.day_of_week,s.start_time');
        $st->execute([$cu['id'],$cu['id']]); json_ok($st->fetchAll());
    }
    json_ok([]);
}

// ════ EXPORT STUDENTS ═════════════════════════════
function handleExportStudents(){
    $cu=requireAuth(); if($cu['role']!=='admin') json_err('Forbidden',403);
    $gid=$_GET['group_id']??'';
    if($gid){
        $st=db()->prepare('SELECT u.fname,u.lname,u.login,u.phone,u.guardian,u.guardian_phone,u.birth_date,u.end_date,gs.joined_at,g.name as group_name,g.price,COALESCE((SELECT p.paid FROM payments p WHERE p.student_id=u.id AND p.group_id=? AND p.month=DATE_FORMAT(CURDATE(),"%Y-%m") LIMIT 1),0) as paid_this_month FROM group_students gs JOIN users u ON u.id=gs.student_id JOIN groups_tbl g ON g.id=gs.group_id WHERE gs.group_id=? AND u.is_graduated=0 ORDER BY u.lname,u.fname');
        $st->execute([$gid,$gid]);
    } else {
        $st=db()->query('SELECT u.fname,u.lname,u.login,u.phone,u.guardian,u.birth_date,u.end_date FROM users u WHERE u.role="student" AND u.is_graduated=0 ORDER BY u.lname,u.fname');
    }
    $rows=$st->fetchAll();
    json_ok($rows);
}

// ════ ABOUT ══════════════════════════════════════════
function handleAbout($method,$id,$body){
    requireAuth();
    if($method==='GET'){
        $rows=db()->query('SELECT field_key,field_val FROM about ORDER BY id')->fetchAll();
        $data=[]; foreach($rows as $r) $data[$r['field_key']]=$r['field_val'];
        json_ok($data);
    }
    requireAdmin();
    if($method==='POST'){
        // Пакетный upsert нескольких полей — единая ACID-транзакция, чтобы
        // конфигурация не сохранилась "частично" при сбое посреди цикла.
        $pdo=db();
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        try{
            $pdo->beginTransaction();
            $stmt=$pdo->prepare('INSERT INTO about(field_key,field_val)VALUES(?,?) ON DUPLICATE KEY UPDATE field_val=VALUES(field_val)');
            foreach($body as $k=>$v){
                if(!is_string($k)||strlen($k)>50) continue;
                $vs=(string)$v;
                // Жёсткий лимит длины значения (см. п.2.3): без него можно
                // прислать строку на десятки МБ и вызвать DoS / упереться в
                // max_allowed_packet на стороне MySQL.
                if(strlen($vs)>5000){
                    $pdo->rollBack();
                    json_err("Значение поля '$k' превышает 5000 символов");
                }
                $stmt->execute([$k,$vs]);
            }
            $pdo->commit();
        } catch(\Throwable $e){
            if($pdo->inTransaction()) $pdo->rollBack();
            json_err('Не удалось сохранить настройки. Изменения отменены.',500);
        }
        json_ok();
    }
    json_err('Method not allowed',405);
}

// ════ SUBJECTS (глобальный справочник) ════════════════
function handleSubjects($method,$id,$body){
    requireAuth();
    if($method==='GET'){
        json_ok(db()->query('SELECT * FROM subjects_list ORDER BY sort_order,name')->fetchAll());
    }
    requireAdmin();
    if($method==='POST'){
        $name=trim($body['name']??''); if(!$name) json_err('Название обязательно');
        // Проверяем дубликат
        $chk=db()->prepare('SELECT id FROM subjects_list WHERE name=? LIMIT 1'); $chk->execute([$name]);
        if($chk->fetch()) json_err('Предмет уже существует');
        $sort=(int)db()->query('SELECT COALESCE(MAX(sort_order),0)+1 FROM subjects_list')->fetchColumn();
        $stmt=db()->prepare('INSERT INTO subjects_list(name,sort_order)VALUES(?,?)');
        $stmt->execute([$name,$sort]);
        json_ok(['id'=>db()->lastInsertId(),'name'=>$name]);
    }
    if($method==='DELETE'){
        if(!$id) json_err('ID required');
        db()->prepare('DELETE FROM subjects_list WHERE id=?')->execute([$id]);
        json_ok();
    }
    if($method==='PUT'){
        if(!$id) json_err('ID required');
        $name=trim($body['name']??''); if(!$name) json_err('Название обязательно');
        db()->prepare('UPDATE subjects_list SET name=? WHERE id=?')->execute([$name,$id]);
        json_ok();
    }
    json_err('Method not allowed',405);
}

// ════ RESET PASSWORD (admin only) ═══════════════════
function handleResetPass(){
    global $body;
    requireAdmin();
    $uid  = $body['user_id'] ?? '';
    $pass = $body['pass']    ?? '';
    if(!$uid || !$pass) json_err('user_id и pass обязательны');
    // Минимальная длина пароля (см. п.4.4): защита от случайного сохранения
    // пустого/пробельного пароля.
    if(strlen(trim($pass)) < 4) json_err('Пароль слишком короткий (минимум 4 символа)');
    $hash = password_hash($pass, PASSWORD_DEFAULT);
    db()->prepare('UPDATE users SET pass=? WHERE id=?')->execute([$hash, $uid]);
    json_ok(['message'=>'Пароль обновлён']);
}

// ════ AVATAR ══════════════════════════════════════
function handleAvatar(){
    $user=requireAuth();
    if($_SERVER['REQUEST_METHOD']!=='POST') json_err('POST only');
    if(empty($_FILES['avatar'])) json_err('Файл не загружен');
    $file=$_FILES['avatar'];
    if($file['error']!==UPLOAD_ERR_OK) json_err('Ошибка загрузки');
    // Безопасный дефолт для константы (см. п.3.3): отсутствие MAX_AVATAR_SIZE
    // в config.php раньше приводило к фатальной ошибке интерпретатора.
    $maxAvatarSize = defined('MAX_AVATAR_SIZE') ? MAX_AVATAR_SIZE : 5242880;
    if($file['size']>$maxAvatarSize) json_err('Файл больше 5MB');
    $mime=mime_content_type($file['tmp_name']);
    if(!in_array($mime,['image/jpeg','image/png','image/webp','image/gif'])) json_err('Только JPEG/PNG/WebP');
    // Доп. проверка структуры файла (см. п.3.2, защита от MIME-спуфинга):
    // mime_content_type() смотрит только на magic bytes и может быть обманут;
    // getimagesize() реально разбирает заголовок изображения и отбрасывает
    // файл, который не является валидной графической структурой.
    $imgInfo=@getimagesize($file['tmp_name']);
    if($imgInfo===false) json_err('Файл повреждён или не является изображением');
    $src="data:{$mime};base64,".base64_encode(file_get_contents($file['tmp_name']));
    db()->prepare('UPDATE users SET avatar=? WHERE id=?')->execute([$src,$user['id']]);
    json_ok(['avatar'=>$src]);
}
