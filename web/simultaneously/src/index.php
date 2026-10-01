<?php

declare(strict_types=1);

const DATABASE_PASSWORD = 'simultaneously';
const MAX_INJECTION_LENGTH = 8192;
const FLAG_PREFIX = 'skbdg';
define('FLAG_SECRET', getenv('FLAG_SECRET') ?: 'asdf');

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function flag_for(int $score): string
{
    return FLAG_PREFIX . '{' . $score . '_' . hash_hmac('sha256', (string) $score, FLAG_SECRET) . '}';
}

function query_template_html(string $template): string
{
    return str_replace(
        '{{INPUT}}',
        '<span class="input-marker">&lt;input&gt;</span>',
        h($template),
    );
}

function contains_banned_string(string $injection): bool
{
    return preg_match('/processlist|pg_stat|time|uuid/i', $injection) === 1;
}

function connect_database(string $engine): PDO
{
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ];

    if ($engine === 'mysql') {
        $options[PDO::MYSQL_ATTR_MULTI_STATEMENTS] = false;
        $pdo = new PDO(
            'mysql:host=127.0.0.1;dbname=simultaneously;charset=utf8mb4',
            'simultaneously',
            DATABASE_PASSWORD,
            $options,
        );
        $pdo->exec('SET SESSION MAX_EXECUTION_TIME = 2000');
        return $pdo;
    }

    if ($engine === 'sqlite') {
        $pdo = new PDO(
            'sqlite:/var/lib/simultaneously/users.sqlite',
            null,
            null,
            $options,
        );
        $pdo->exec('PRAGMA query_only = ON');
        return $pdo;
    }

    if ($engine === 'postgres') {
        $pdo = new PDO(
            'pgsql:host=127.0.0.1;dbname=simultaneously',
            'simultaneously',
            DATABASE_PASSWORD,
            $options,
        );
        $pdo->exec("SET statement_timeout = '2s'");
        $pdo->exec('SET default_transaction_read_only = on');
        return $pdo;
    }

    throw new InvalidArgumentException('unknown database engine');
}

function targets(): array
{
    return [
        [
            'engine' => 'mysql',
            'expected' => 'mysql1',
            'template' => 'SELECT name FROM users WHERE id={{INPUT}}',
        ],
        [
            'engine' => 'mysql',
            'expected' => 'mysql2',
            'template' => "SELECT name FROM users WHERE name='{{INPUT}}'",
        ],
        [
            'engine' => 'mysql',
            'expected' => 'mysql3',
            'template' => 'SELECT name FROM users WHERE name="{{INPUT}}"',
        ],
        [
            'engine' => 'sqlite',
            'expected' => 'sqlite1',
            'template' => 'SELECT name FROM users WHERE id={{INPUT}}',
        ],
        [
            'engine' => 'sqlite',
            'expected' => 'sqlite2',
            'template' => "SELECT name FROM users WHERE name='{{INPUT}}'",
        ],
        [
            'engine' => 'sqlite',
            'expected' => 'sqlite3',
            'template' => 'SELECT name FROM users WHERE name="{{INPUT}}"',
        ],
        [
            'engine' => 'postgres',
            'expected' => 'postgres1',
            'template' => 'SELECT name FROM users WHERE id={{INPUT}}',
        ],
        [
            'engine' => 'postgres',
            'expected' => 'postgres2',
            'template' => "SELECT name FROM users WHERE name='{{INPUT}}'",
        ],
    ];
}

$targets = targets();
$submitted = $_SERVER['REQUEST_METHOD'] === 'POST' && array_key_exists('injection', $_POST);
$injection = $submitted && is_string($_POST['injection']) ? $_POST['injection'] : '';
$results = [];
$solved = 0;
$score = null;
$submissionError = null;

if ($submitted) {
    if (strlen($injection) > MAX_INJECTION_LENGTH) {
        $submissionError = 'Injection is too long.';
        $score = 0;
    } elseif (contains_banned_string($injection)) {
        $submissionError = "You can't submit a banned string.";
        $score = 0;
    } else {
        foreach ($targets as $target) {
            $query = str_replace('{{INPUT}}', $injection, $target['template']);
            $row = null;
            $error = null;

            try {
                $pdo = connect_database($target['engine']);
                $statement = $pdo->query($query);
                $value = $statement->fetchColumn();
                if ($value !== false) {
                    $row = (string) $value;
                }
            } catch (Throwable $exception) {
                $error = $exception->getMessage();
            }

            $passed = $row === $target['expected'];
            if ($passed) {
                $solved++;
            }

            $results[] = [
                'expected' => $target['expected'],
                'query' => $query,
                'row' => $row,
                'error' => $error,
                'passed' => $passed,
            ];
        }

        $score = max(0, 1000 * $solved - strlen($injection));
    }
}

?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>simultaneously</title>
  <style>
    * { box-sizing: border-box; }
    body { max-width: 960px; margin: 24px auto; padding: 0 18px; color: #000; background: #fff; font: 16px/1.45 sans-serif; }
    h1 { margin: 0 0 10px; line-height: 1.1; }
    h2 { margin: 18px 0 8px; line-height: 1.1; }
    p { margin: 8px 0; }
    form { margin-top: 18px; }
    label { display: block; margin-bottom: 4px; }
    textarea { width: 100%; min-height: 6em; padding: 10px; border: 1px solid #000; background: #fff; color: #000; font: 14px/1.4 monospace; }
    button { padding: 8px 16px; border: 1px solid #000; background: #000; color: #fff; font: inherit; cursor: pointer; }
    code, pre { font-family: monospace; overflow-wrap: anywhere; white-space: pre-wrap; }
    .target { position: relative; display: grid; grid-template-columns: 11ch 1ch minmax(0, 1fr) max-content; gap: 0.5ch; }
    .target-name { text-align: left; white-space: nowrap; overflow-wrap: normal; }
    .input-marker { color: #444; }
    .form-actions { display: flex; align-items: baseline; gap: 12px; margin-top: 8px; }
    .score { font-weight: bold; }
    .result-success { color: #087f23; }
    .result-fail { color: #d00000; }
    .result-error { color: #d00000; }
    .tooltip { cursor: help; text-decoration: underline; text-decoration-style: dotted; }
    .tooltip-detail { position: absolute; z-index: 1; top: 100%; left: 0; width: min(40rem, calc(100vw - 36px)); padding: 10px; border: 1px solid #000; color: #fff; background: #000; visibility: hidden; opacity: 0; }
    .tooltip:hover .tooltip-detail, .tooltip:focus .tooltip-detail { visibility: visible; opacity: 1; }
  </style>
</head>
<body>
  <main>
    <h1>simultaneously</h1>
    <p>Submit one SQL injection. It will be inserted into eight queries across MySQL, SQLite, and PostgreSQL.</p>
    <p>Each injection wants a different return value, such as <code>mysql1</code>.</p>
    <p>Score: <code>max(0, 1000 * (num solved) − (injection bytes))</code>.</p>

    <h2>targets</h2>
    <div class="targets">
      <?php foreach ($targets as $targetIndex => $target): ?>
        <?php
          $result = $results[$targetIndex] ?? null;
          $state = $result === null ? null : ($result['error'] !== null ? 'error' : ($result['passed'] ? 'success' : 'fail'));
        ?>
        <div class="target">
          <code class="target-name<?= $state === null ? '' : ' result-' . $state ?>"><?= h($target['expected']) ?></code>
          <span>:</span>
          <code><?= query_template_html($target['template']) ?></code>
          <?php if ($result !== null): ?>
            <span class="tooltip" tabindex="0" aria-label="<?= h($state) ?> details" aria-describedby="result-detail-<?= $targetIndex ?>">(?)
              <span class="tooltip-detail" id="result-detail-<?= $targetIndex ?>" role="tooltip">
                <strong>Query:</strong> <code><?= h($result['query']) ?></code><br>
                <strong>Expected:</strong> <code><?= h($result['expected']) ?></code><br>
                <?php if ($result['error'] !== null): ?>
                  <strong>Error:</strong> <code><?= h($result['error']) ?></code>
                <?php elseif ($result['row'] === null): ?>
                  <strong>Actual:</strong> <code>(no rows)</code>
                <?php else: ?>
                  <strong>Actual:</strong> <code><?= h($result['row']) ?></code>
                <?php endif; ?>
              </span>
            </span>
          <?php endif; ?>
        </div>
      <?php endforeach; ?>
    </div>

    <form id="submission-form" method="post">
      <label for="injection">Injection</label>
      <textarea id="injection" name="injection" maxlength="<?= MAX_INJECTION_LENGTH ?>" required><?= h($injection) ?></textarea>
      <div class="form-actions">
        <button type="submit">submit</button>
        <?php if ($submitted): ?>
          <?php if ($submissionError !== null): ?>
            <span class="result-error"><?= h($submissionError) ?></span>
          <?php else: ?>
            <span><span class="score">Score: <?= $score ?></span> &nbsp; <?= $solved ?> / 8 solved; <?= strlen($injection) ?> bytes<?php if ($score > 0): ?> <br/> Flag: <code><?= h(flag_for($score)) ?></code><?php endif; ?></span>
          <?php endif; ?>
        <?php endif; ?>
      </div>
    </form>
  </main>
  <script>
    (() => {
      const form = document.getElementById('submission-form');
      const injection = document.getElementById('injection');

      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const body = 'injection=' + encodeURIComponent(
          injection.value.replace(/\r\n?/g, '\n')
        );
        const response = await fetch(form.action || window.location.href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body,
        });
        const page = await response.text();

        document.open();
        document.write(page);
        document.close();
      });
    })();
  </script>
</body>
</html>
