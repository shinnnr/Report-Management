<?php
/**
 * Database Migration Script for Folders and Reports Enhancement
 * Creates folders table and updates reports table for hierarchical structure
 */

require 'config/db.php';

try {
    // Create folders table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS folders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            parent_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by INT NOT NULL,
            FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE,
            INDEX idx_parent_id (parent_id),
            INDEX idx_created_by (created_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
    ");
    echo "Created folders table successfully.\n";

    // Add folder_id column to reports table if it doesn't exist
    $stmt = $pdo->query("SHOW COLUMNS FROM reports LIKE 'folder_id'");
    $folderIdExists = $stmt->fetch();

    if (!$folderIdExists) {
        $pdo->exec("ALTER TABLE reports ADD COLUMN folder_id INT NULL AFTER report_year");
        $pdo->exec("ALTER TABLE reports ADD CONSTRAINT fk_reports_folder_id FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL");
        echo "Added folder_id column to reports table successfully.\n";
    } else {
        echo "folder_id column already exists in reports table.\n";
    }

    // Remove old folder_path column if it exists
    $stmt = $pdo->query("SHOW COLUMNS FROM reports LIKE 'folder_path'");
    $folderPathExists = $stmt->fetch();

    if ($folderPathExists) {
        $pdo->exec("ALTER TABLE reports DROP COLUMN folder_path");
        echo "Removed folder_path column from reports table successfully.\n";
    } else {
        echo "folder_path column does not exist in reports table.\n";
    }

    // Create root folder if it doesn't exist
    $stmt = $pdo->prepare("SELECT id FROM folders WHERE parent_id IS NULL LIMIT 1");
    $stmt->execute();
    $rootFolder = $stmt->fetch();

    if (!$rootFolder) {
        // Assume admin user exists, get first admin
        $stmt = $pdo->prepare("SELECT user_id FROM users WHERE role = 'admin' LIMIT 1");
        $stmt->execute();
        $admin = $stmt->fetch();

        if ($admin) {
            $pdo->prepare("INSERT INTO folders (name, parent_id, created_by) VALUES ('Root', NULL, ?)")
                 ->execute([$admin['user_id']]);
            echo "Created root folder successfully.\n";
        } else {
            echo "Warning: No admin user found to create root folder.\n";
        }
    } else {
        echo "Root folder already exists.\n";
    }

    echo "Migration completed successfully.\n";
} catch (PDOException $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
?>