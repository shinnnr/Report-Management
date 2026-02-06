<?php
require '../config/db.php';
require '../config/auth.php';

$active_view = 'calendar';

$stmt = $pdo->prepare("SELECT * FROM activities WHERE user_id = ? ORDER BY start_date");
$stmt->execute([$_SESSION['user_id']]);
$activities = $stmt->fetchAll();

$show_activity_modal = isset($_SESSION['activity_added']);
if ($show_activity_modal) {
    unset($_SESSION['activity_added']);
}

$totalActivities = count($activities);
$completed = count(array_filter($activities, fn($a) => $a['status'] === 'completed'));
$inProgress = count(array_filter($activities, fn($a) => $a['status'] === 'in-progress'));
$pending = count(array_filter($activities, fn($a) => $a['status'] === 'pending'));

$pendingActivities = array_filter($activities, fn($a) => $a['status'] !== 'completed');
$completedActivities = array_filter($activities, fn($a) => $a['status'] === 'completed');

$per_page = 5;
$pending_page = isset($_GET['pending_page']) ? max(1, (int)$_GET['pending_page']) : 1;
$completed_page = isset($_GET['completed_page']) ? max(1, (int)$_GET['completed_page']) : 1;

$pending_total = count($pendingActivities);
$completed_total = count($completedActivities);

$pending_offset = ($pending_page - 1) * $per_page;
$completed_offset = ($completed_page - 1) * $per_page;

$pending_display = array_slice($pendingActivities, $pending_offset, $per_page);
$completed_display = array_slice($completedActivities, $completed_offset, $per_page);

$pending_total_pages = ceil($pending_total / $per_page);
$completed_total_pages = ceil($completed_total / $per_page);

$upcoming = array_filter($activities, fn($a) => strtotime($a['start_date']) >= time());
usort($upcoming, fn($a, $b) => strtotime($a['start_date']) - strtotime($b['start_date']));
$upcomingDeadlines = array_slice($upcoming, 0, 5);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Activity Calendar - Report Management</title>

    <link rel="stylesheet" href="../css/style.css">
    <link rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Poppins&display=swap" rel="stylesheet">
    <link rel="icon" href="../img/NEECO_banner.png">
</head>
<body>

<div class="main-layout">

    <?php include '../dashboard/sidebar.php'; ?>

    <main class="main-content">
        <?php $page_title = 'Activity Calendar'; include '../dashboard/header.php'; ?>
        <div class="calendar-section">
            <div class="calendar">
                <div class="activity-summary">
                    <div class="stats">
                        <div class="stat-card">
                            <i class="fas fa-tasks total-icon"></i>
                            <h3>Total Activities</h3>
                            <p><?= $totalActivities ?></p>
                        </div>
                        <div class="stat-card">
                            <i class="fas fa-check-circle completed-icon"></i>
                            <h3>Completed</h3>
                            <p><?= $completed ?></p>
                        </div>
                        <div class="stat-card">
                            <i class="fas fa-clock in-progress-icon"></i>
                            <h3>In Progress</h3>
                            <p><?= $inProgress ?></p>
                        </div>
                        <div class="stat-card">
                            <i class="fas fa-exclamation-triangle pending-icon"></i>
                            <h3>Pending</h3>
                            <p><?= $pending ?></p>
                        </div>
                    </div>
                </div>
                <div class="upcoming-deadlines">
                    <h3>Upcoming Deadlines</h3>
                    <div class="deadline-list">
                        <?php if (empty($upcomingDeadlines)): ?>
                            <p>No upcoming deadlines.</p>
                        <?php else: ?>
                            <?php foreach ($upcomingDeadlines as $act): ?>
                                <div class="deadline-item">
                                    <div class="deadline-content">
                                        <h4><?= htmlspecialchars($act['title']) ?></h4>
                                        <p><?= htmlspecialchars($act['description']) ?> - Due: <?= $act['start_date'] ?></p>
                                    </div>
                                    <button class="upload-report-btn" data-id="<?= $act['id'] ?>" data-title="<?= htmlspecialchars($act['title']) ?>" data-description="<?= htmlspecialchars($act['description']) ?>" data-date="<?= $act['start_date'] ?>"><i class="fas fa-upload"></i> Upload Report</button>
                                </div>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </div>
                </div>
                <div class="activities-wrapper">
                    <div class="activity-details">
                        <div class="activity-header">
                            <h3>List of Activities To Do</h3>
                            <button id="addActivityBtn" class="add-activity-btn"><i class="fas fa-plus"></i> Add Activity</button>
                        </div>
                        <div class="activity-list">
                            <?php if (empty($pending_display)): ?>
                                <p>No pending activities.</p>
                            <?php else: ?>
                                <?php foreach ($pending_display as $act): ?>
                                    <div class="activity-item">
                                        <span class="status-dot <?= $act['status'] === 'in-progress' ? 'yellow' : 'red' ?>"></span>
                                        <div class="activity-info">
                                            <h4><?= htmlspecialchars($act['title']) ?></h4>
                                            <p>Date: <?= $act['start_date'] ?></p>
                                            <p><?= htmlspecialchars($act['description']) ?></p>
                                        </div>
                                        <button class="check-btn" data-id="<?= $act['id'] ?>" data-status="completed" data-title="<?= htmlspecialchars($act['title']) ?>"><i class="fas fa-check"></i></button>
                                    </div>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </div>
                        <?php if ($pending_total_pages > 1): ?>
                            <div class="pagination">
                                <?php for ($i = 1; $i <= $pending_total_pages; $i++): ?>
                                    <a href="?pending_page=<?= $i ?>&completed_page=<?= $completed_page ?>" class="page-btn <?= $i == $pending_page ? 'active' : '' ?>"><?= $i ?></a>
                                <?php endfor; ?>
                            </div>
                        <?php endif; ?>
                    </div>
                    <div class="completed-activities">
                        <div class="activity-header">
                            <h3>Completed Activities</h3>
                        </div>
                        <div class="activity-list">
                            <?php if (empty($completed_display)): ?>
                                <p>No completed activities.</p>
                            <?php else: ?>
                                <?php foreach ($completed_display as $act): ?>
                                    <div class="activity-item">
                                        <span class="status-dot green"></span>
                                        <div class="activity-info">
                                            <h4><?= htmlspecialchars($act['title']) ?></h4>
                                            <p>Date: <?= $act['start_date'] ?></p>
                                            <p><?= htmlspecialchars($act['description']) ?></p>
                                        </div>
                                        <button class="check-btn completed" data-id="<?= $act['id'] ?>" data-status="in-progress" data-title="<?= htmlspecialchars($act['title']) ?>"><i class="fas fa-check"></i></button>
                                    </div>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </div>
                        <?php if ($completed_total_pages > 1): ?>
                            <div class="pagination">
                                <?php for ($i = 1; $i <= $completed_total_pages; $i++): ?>
                                    <a href="?pending_page=<?= $pending_page ?>&completed_page=<?= $i ?>" class="page-btn <?= $i == $completed_page ? 'active' : '' ?>"><?= $i ?></a>
                                <?php endfor; ?>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>
        </div>

        </div>
    </main>
</div>

<div id="addActivityModal">
    <div class="modal-box large">
        <div class="modal-header">
            <h2>Add Activity</h2>
            <button class="close-btn" id="closeAddActivityModal">&times;</button>
        </div>
        <div class="modal-content">
            <form method="POST" action="../calendar/add_activity.php">
                <input type="text" name="title" placeholder="Name of Activity" required>
                <textarea name="description" placeholder="Description"></textarea>
                <input type="date" name="start_date" required>
                <button type="submit" class="btn-primary">Add</button>
            </form>
        </div>
    </div>
</div>

<div id="activitySuccessModal" class="<?= $show_activity_modal ? 'active' : '' ?>">
    <div class="modal-box">
        <h2>Success!</h2>
        <p>Activity added successfully to the calendar!</p>
        <button class="btn-primary" id="closeActivityModal">OK</button>
    </div>
</div>

<div id="selectDateModal">
    <div class="modal-box">
        <h2>Notice</h2>
        <p>Please select a date first.</p>
        <button class="btn-primary" id="closeSelectDateModal">OK</button>
    </div>
</div>

<div id="confirmStatusModal">
    <div class="modal-box">
        <h2>Confirm Action</h2>
        <p id="confirmMessage">Mark as Done?</p>
        <div style="text-align: center; margin-top: 20px;">
            <button id="confirmStatus" class="btn-primary" style="width: 100px;">Mark as Done</button>
            <button id="cancelStatus" class="btn-primary" style="width: 100px; margin-left: 10px; background: #ccc; color: #333;">Cancel</button>
        </div>
    </div>
</div>

<div id="uploadActivityReportModal">
    <div class="modal-box large">
        <div class="modal-header">
            <h2>Upload Report for Activity</h2>
            <button class="close-btn" id="closeUploadActivityReportModal">&times;</button>
        </div>
        <div class="modal-content">
            <form action="upload_report.php" method="POST" enctype="multipart/form-data">
                <label for="reportTitle">Report Title</label>
                <input type="text" id="reportTitle" name="title" placeholder="Enter report title" required>
                <label for="reportFile">Select File</label>
                <input type="file" id="reportFile" name="report" required>
                <label for="reportMonth">Month</label>
                <select id="reportMonth" name="month" required>
                    <?php for ($m=1; $m<=12; $m++): ?>
                        <option value="<?= $m ?>"><?= date('F', mktime(0,0,0,$m,1)) ?></option>
                    <?php endfor; ?>
                </select>
                <label for="reportDay">Day</label>
                <select id="reportDay" name="day" required>
                    <?php for ($d=1; $d<=31; $d++): ?>
                        <option value="<?= $d ?>"><?= $d ?></option>
                    <?php endfor; ?>
                </select>
                <label for="reportYear">Year</label>
                <input type="number" id="reportYear" name="year" value="<?= date('Y') ?>" required>
                <button type="submit" class="btn-primary">Upload</button>
            </form>
        </div>
    </div>
</div>

<script>
const addActivityModal = document.getElementById('addActivityModal');
const addActivityBtn = document.getElementById('addActivityBtn');
const closeAddActivityModal = document.getElementById('closeAddActivityModal');
const activitySuccessModal = document.getElementById('activitySuccessModal');
const closeActivityModal = document.getElementById('closeActivityModal');

addActivityBtn.addEventListener('click', () => {
    addActivityModal.classList.add('active');
});

closeAddActivityModal.addEventListener('click', () => {
    addActivityModal.classList.remove('active');
});

addActivityModal.addEventListener('click', (e) => {
    if(e.target === addActivityModal){
        addActivityModal.classList.remove('active');
    }
});

closeActivityModal.addEventListener('click', () => {
    activitySuccessModal.classList.remove('active');
});

activitySuccessModal.addEventListener('click', (e) => {
    if(e.target === activitySuccessModal){
        activitySuccessModal.classList.remove('active');
    }
});

const confirmStatusModal = document.getElementById('confirmStatusModal');
const cancelStatus = document.getElementById('cancelStatus');
const confirmStatus = document.getElementById('confirmStatus');
const confirmMessage = document.getElementById('confirmMessage');
let currentUpdateUrl = '';

document.addEventListener('click', (e) => {
    if (e.target.closest('.check-btn')) {
        const btn = e.target.closest('.check-btn');
        const id = btn.dataset.id;
        const status = btn.dataset.status;
        const title = btn.dataset.title;
        const action = status === 'completed' ? 'Mark as Done' : 'Mark as In Progress';
        confirmMessage.textContent = `Are you sure you want to ${action.toLowerCase()} "${title}"?`;
        document.getElementById('confirmStatus').textContent = action;
        currentUpdateUrl = `update_activity.php?id=${id}&status=${status}`;
        confirmStatusModal.classList.add('active');
    }
});

cancelStatus.addEventListener('click', () => {
    confirmStatusModal.classList.remove('active');
});

confirmStatus.addEventListener('click', () => {
    window.location.href = currentUpdateUrl;
});

confirmStatusModal.addEventListener('click', (e) => {
    if (e.target === confirmStatusModal) {
        confirmStatusModal.classList.remove('active');
    }
});

const uploadActivityReportModal = document.getElementById('uploadActivityReportModal');
const closeUploadActivityReportModal = document.getElementById('closeUploadActivityReportModal');

closeUploadActivityReportModal.addEventListener('click', () => {
    uploadActivityReportModal.classList.remove('active');
});

uploadActivityReportModal.addEventListener('click', (e) => {
    if (e.target === uploadActivityReportModal) {
        uploadActivityReportModal.classList.remove('active');
    }
});

document.addEventListener('click', (e) => {
    if (e.target.closest('.upload-report-btn')) {
        const btn = e.target.closest('.upload-report-btn');
        const title = btn.dataset.title;
        const date = btn.dataset.date;
        document.getElementById('reportTitle').value = title;
        const dateObj = new Date(date);
        document.getElementById('reportMonth').value = dateObj.getMonth() + 1;
        document.getElementById('reportDay').value = dateObj.getDate();
        document.getElementById('reportYear').value = dateObj.getFullYear();
        uploadActivityReportModal.classList.add('active');
    }
});
</script>

</body>
</html>