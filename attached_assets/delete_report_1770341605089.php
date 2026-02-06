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
    // Delete by ID - removes file data from database
    $stmt = $pdo->prepare("DELETE FROM reports WHERE report_id=?");
    $stmt->execute([$id]);
    
    $log = $pdo->prepare("
        INSERT INTO activity_logs (user_id, action, description)
        VALUES (?,?,?)
    ")->execute([
        $_SESSION['user_id'],
        'DELETE',
        'Deleted report ID ' . $id
    ]);
    
    echo json_encode(['success' => true, 'message' => 'Report deleted successfully.']);
} else {
    echo json_encode(['success' => false, 'message' => 'Invalid ID.']);
}
exit;
?>
