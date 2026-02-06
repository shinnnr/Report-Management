<?php
require '../config/db.php';
require '../config/auth.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $stmt = $pdo->prepare("INSERT INTO activities (user_id, title, description, start_date, regulatory_agency, report_details, concern_department, deadline_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $_SESSION['user_id'],
        $_POST['title'],
        $_POST['description'],
        $_POST['start_date'],
        $_POST['regulatory_agency'],
        $_POST['report_details'],
        $_POST['concern_department'],
        $_POST['deadline_date']
    ]);
    $log = $pdo->prepare("INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)");
    $log->execute([$_SESSION['user_id'], 'ADD_ACTIVITY', 'Added activity: ' . $_POST['title']]);

    $_SESSION['activity_added'] = true;
    $_SESSION['selected_date'] = $_POST['start_date'];
    $activityMonth = date('m', strtotime($_POST['start_date']));
    $activityYear = date('Y', strtotime($_POST['start_date']));
    header("Location: ../dashboard/dashboard.php?month=$activityMonth&year=$activityYear");
    exit;
}
?>