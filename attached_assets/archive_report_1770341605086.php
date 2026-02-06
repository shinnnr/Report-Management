<?php
require '../config/db.php';
require '../config/auth.php';

header('Content-Type: application/json');

if (!isAdmin()) {
    echo json_encode(['success' => false, 'message' => 'Access denied.']);
    exit;
}

$id = $_GET['id'] ?? null;

if ($id) {
    // Archive by ID
    $stmt = $pdo->prepare("UPDATE reports SET status = 'archived' WHERE report_id = ?");
    $stmt->execute([$id]);
    
    $log = $pdo->prepare("INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)");
    $log->execute([$_SESSION['user_id'], 'ARCHIVE', 'Archived report ID: ' . $id]);
    
    echo json_encode(['success' => true, 'message' => 'Report archived successfully.']);
} else {
    echo json_encode(['success' => false, 'message' => 'Invalid ID.']);
}
exit;
?>
