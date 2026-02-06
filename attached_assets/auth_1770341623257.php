<?php
session_start();

if (!isset($_SESSION['user_id'])) {
    header("Location: index.php");
    exit;
}

function isAdmin() {
    return $_SESSION['role'] === 'admin';
}
