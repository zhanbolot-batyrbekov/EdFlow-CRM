<?php
error_reporting(0);
ini_set('display_errors', '0');

define('DB_HOST', 'localhost');
define('DB_NAME', 'lyceum89');
define('DB_USER', 'root');       // ← замените
define('DB_PASS', '');           // ← замените
define('DB_CHARSET', 'utf8mb4');
define('MAX_AVATAR_SIZE', 5 * 1024 * 1024);

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset='.DB_CHARSET;
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            ob_clean();
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['ok'=>false,'error'=>'DB: '.$e->getMessage()], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    return $pdo;
}

function uid(): string {
    return bin2hex(random_bytes(5));
}

function getToken(): string {
    if (!empty($_SERVER['HTTP_X_TOKEN']))       return $_SERVER['HTTP_X_TOKEN'];
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $p = explode(' ', $_SERVER['HTTP_AUTHORIZATION']);
        if (count($p) === 2 && strtolower($p[0]) === 'bearer') return $p[1];
    }
    return $_GET['_token'] ?? $_COOKIE['crm_token'] ?? '';
}

// Генерация UID для студента: DDMMYYYY-XX
function generateStudentUid(string $birthDate): string {
    // birthDate = YYYY-MM-DD
    $parts = explode('-', $birthDate);
    if (count($parts) !== 3) return uid();
    $base = $parts[2] . $parts[1] . $parts[0]; // DDMMYYYY
    // Проверяем уникальность
    $i = 1;
    do {
        $login = $base . '-' . str_pad($i, 2, '0', STR_PAD_LEFT);
        $st = db()->prepare('SELECT id FROM users WHERE login=? LIMIT 1');
        $st->execute([$login]);
        if (!$st->fetch()) return $login;
        $i++;
    } while ($i < 100);
    return $base . '-' . uid();
}
