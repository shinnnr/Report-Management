<?php
require '../config/db.php';
require '../config/auth.php';

header('Content-Type: application/json');

$id = $_GET['id'];

$stmt = $pdo->prepare("DELETE FROM activity_logs WHERE log_id = ?");
$result = $stmt->execute([$id]);

if ($result) {
    echo json_encode(['success' => true, 'message' => 'Activity log deleted successfully.']);
} else {
    echo json_encode(['success' => false, 'message' => 'Failed to delete activity log.']);
}
exit;