<?php
require '../config/db.php';
require '../config/auth.php';

header('Content-Type: application/json');

$id = $_GET['id'] ?? null;

if (!$id) {
    echo json_encode(['success' => false, 'message' => 'Invalid request.']);
    exit;
}

$stmt = $pdo->prepare("UPDATE reports SET status = 'active' WHERE report_id = ?");
$stmt->execute([$id]);

$log = $pdo->prepare("INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)");
$log->execute([$_SESSION['user_id'], 'RESTORE_REPORT', 'Restored report ID: ' . $id]);

echo json_encode(['success' => true, 'message' => 'Report restored successfully.']);
exit;
?>