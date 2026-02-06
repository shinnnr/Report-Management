<?php
require 'config/db.php';
session_start();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ? AND status='active'");
    $stmt->execute([$_POST['username']]);
    $user = $stmt->fetch();

    if ($user && password_verify($_POST['password'], $user['password_hash'])) {
        $_SESSION['user_id'] = $user['user_id'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['name'] = $user['full_name'];
        header("Location: dashboard/dashboard.php");
        exit;
    }

    $error = "Invalid login credentials.";
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Report Management</title>

    <link rel="stylesheet" href="css/style.css">
    <link rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link rel="icon" href="img/NEECO_banner.png">
</head>

<body class="auth-page">

<div class="auth-container">
    <div class="auth-card">

        <div class="auth-header">

        <img src="img/NEECO_banner.png" alt="NEECO Logo" class="app-logo">

            <h1>Welcome Back!</h1>
            <p>Sign in to your account</p>
        </div>

       
        <?php if (isset($error)): ?>
            <div class="error"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>

        <form method="post">

            <div class="input-group floating">
                <input type="text" name="username" required>
                <label>Username</label>
                <i class="fas fa-user"></i>
            </div>

            <div class="input-group floating">
                <input type="password" name="password" required>
                <label>Password</label>
                <i class="fas fa-lock"></i>
            </div>

            <button type="submit" class="btn-primary">SIGN IN</button>
        </form>

        <div class="note">
            Admin credentials - Username: admin | Password: admin123
            Assistant credentials - Username: assistant | Password: assist123
            <br>
            For testing purposes only.

        </div>

    </div>
</div>

</body>
</html>