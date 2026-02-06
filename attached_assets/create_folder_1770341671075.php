<?php
require '../config/db.php';
require '../config/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$name = trim($_POST['name'] ?? '');
$parent_id = $_POST['parent_id'] ?? null;

if (empty($name)) {
    echo json_encode(['success' => false, 'message' => 'Folder name is required']);
    exit;
}

if (strlen($name) > 255) {
    echo json_encode(['success' => false, 'message' => 'Folder name too long']);
    exit;
}

try {
    // Validate parent_id if provided
    if ($parent_id !== null) {
        $stmt = $pdo->prepare("SELECT id FROM folders WHERE id = ?");
        $stmt->execute([$parent_id]);
        if (!$stmt->fetch()) {
            echo json_encode(['success' => false, 'message' => 'Parent folder not found']);
            exit;
        }
    }

    // Check for duplicate folder name in the same parent
    $stmt = $pdo->prepare("SELECT id FROM folders WHERE name = ? AND (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))");
    $stmt->execute([$name, $parent_id, $parent_id]);
    if ($stmt->fetch()) {
        echo json_encode(['success' => false, 'message' => 'Folder with this name already exists in the selected location']);
        exit;
    }

    // Create folder
    $stmt = $pdo->prepare("INSERT INTO folders (name, parent_id, created_by) VALUES (?, ?, ?)");
    $stmt->execute([$name, $parent_id, $_SESSION['user_id']]);

    $folder_id = $pdo->lastInsertId();

    echo json_encode([
        'success' => true,
        'message' => 'Folder created successfully',
        'folder' => [
            'id' => $folder_id,
            'name' => $name,
            'parent_id' => $parent_id,
            'created_at' => date('Y-m-d H:i:s'),
            'created_by' => $_SESSION['user_id']
        ]
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
?>