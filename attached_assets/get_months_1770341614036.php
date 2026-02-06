<?php
require '../config/db.php';
require '../config/auth.php';

$year = $_GET['year'] ?? null;
$status = $_GET['status'] ?? 'active';

if (!$year) {
    echo json_encode([]);
    exit;
}

$months = [];
for ($m = 1; $m <= 12; $m++) {
    $stmt = $pdo->prepare("SELECT COUNT(*) as count FROM reports WHERE status = ? AND report_year = ? AND report_month = ?");
    $stmt->execute([$status, $year, $m]);
    $count = $stmt->fetch()['count'];
    if ($count > 0) {
        $months[$m] = $count;
    }
}

echo json_encode($months);
?>