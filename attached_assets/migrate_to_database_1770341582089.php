<?php
/**
 * Database Migration Script
 * Adds file_data BLOB column to store files in database
 */

require 'config/db.php';

try {
    // Check if file_data column exists
    $stmt = $pdo->query("SHOW COLUMNS FROM reports LIKE 'file_data'");
    $columnExists = $stmt->fetch();

    if (!$columnExists) {
        // Add file_data BLOB column
        $pdo->exec("ALTER TABLE reports ADD COLUMN file_data LONGBLOB NULL AFTER local_path");
        echo "Added file_data column successfully.\n";
    } else {
        echo "file_data column already exists.\n";
    }

    // Check if folder_path column exists (for storing subfolder structure)
    $stmt = $pdo->query("SHOW COLUMNS FROM reports LIKE 'folder_path'");
    $folderColumnExists = $stmt->fetch();

    if (!$folderColumnExists) {
        // Add folder_path column
        $pdo->exec("ALTER TABLE reports ADD COLUMN folder_path VARCHAR(255) NULL AFTER report_month");
        echo "Added folder_path column successfully.\n";
    } else {
        echo "folder_path column already exists.\n";
    }

    echo "Migration completed successfully.\n";
} catch (PDOException $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
