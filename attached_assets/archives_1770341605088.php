<?php
require '../config/db.php';
require '../config/auth.php';

$active_view = 'archives';
$year = $_GET['year'] ?? null;
$month = $_GET['month'] ?? null;
$search = $_GET['search'] ?? '';
$page = $_GET['page'] ?? 1;
$limit = 10;
$offset = ($page - 1) * $limit;


$years = [];
$stmt = $pdo->query("SELECT DISTINCT report_year FROM reports WHERE status = 'archived' ORDER BY report_year DESC");
$yearRows = $stmt->fetchAll();
foreach ($yearRows as $row) {
    $y = $row['report_year'];
    $stmt = $pdo->prepare("SELECT COUNT(*) as count FROM reports WHERE status = 'archived' AND report_year = ?");
    $stmt->execute([$y]);
    $years[$y] = $stmt->fetch()['count'];
}

if ($year && !$month) {
    $months = [];
    for ($m = 1; $m <= 12; $m++) {
        $stmt = $pdo->prepare("SELECT COUNT(*) as count FROM reports WHERE status = 'archived' AND report_year = ? AND report_month = ?");
        $stmt->execute([$year, $m]);
        $count = $stmt->fetch()['count'];
        if ($count > 0) {
            $months[$m] = $count;
        }
    }
}

if ($year && $month) {
    $stmt = $pdo->prepare("
        SELECT r.*, u.full_name
        FROM reports r
        JOIN users u ON r.uploaded_by = u.user_id
        WHERE r.status = 'archived' AND r.report_year = ? AND r.report_month = ? AND r.report_title LIKE ?
        ORDER BY r.report_id DESC
        LIMIT ? OFFSET ?
    ");
    $stmt->bindParam(1, $year);
    $stmt->bindParam(2, $month);
    $stmt->bindParam(3, $searchParam, PDO::PARAM_STR);
    $stmt->bindParam(4, $limit, PDO::PARAM_INT);
    $stmt->bindParam(5, $offset, PDO::PARAM_INT);
    $searchParam = "%$search%";
    $stmt->execute();
    $reports = $stmt->fetchAll();

    $countStmt = $pdo->prepare("
        SELECT COUNT(*) as total
        FROM reports r
        WHERE r.status = 'archived' AND r.report_year = ? AND r.report_month = ? AND r.report_title LIKE ?
    ");
    $countStmt->bindParam(1, $year);
    $countStmt->bindParam(2, $month);
    $countStmt->bindParam(3, $searchParam, PDO::PARAM_STR);
    $searchParam = "%$search%";
    $countStmt->execute();
    $total = $countStmt->fetch()['total'];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Archives - Report Management</title>

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
        <?php $page_title = 'Archives'; include '../dashboard/header.php'; ?>
        <div class="content-section">
             <div class="folders-container" id="yearsContainer">
             <?php foreach ($years as $y => $count): ?>
                 <div class="folder-card" data-year="<?= $y ?>" onclick="toggleYear('<?= $y ?>')">
                     <i class="fas fa-folder"></i>
                     <h3><?= $y ?></h3>
                     <p><?= $count ?> reports</p>
                 </div>
             <?php endforeach; ?>
             <?php if (empty($years)): ?>
                 <div class="no-reports" style="grid-column: 1 / -1;">
                     <i class="fas fa-file-alt"></i>
                     <p>No reports found.</p>
                 </div>
             <?php endif; ?>
             </div>
             <div id="monthsPanel" style="display: none;">
                 <h3 id="monthsTitle"></h3>
                 <div class="folders-container" id="monthsContainer">
                 </div>
             </div>
         </div>

         <?php if ($year && $month): ?>
         <div id="monthModal" class="active">
             <div class="modal-box large">
                 <div class="modal-header">
                     <h2>Archived Reports for <?= $month ? date('F Y', mktime(0,0,0,$month,1,$year)) : '' ?></h2>
                     <div class="search-box">
                         <i class="fas fa-search"></i>
                         <input type="text" id="searchInput" placeholder="Search reports..." value="<?= htmlspecialchars($_GET['search'] ?? '') ?>">
                     </div>
                     <button class="close-btn" id="closeMonthModal" onclick="window.location.href='?year=<?= $year ?>'">&times;</button>
                 </div>
                 <div class="modal-content">
                     <div class="reports" id="reportsList">
                         <?php if (empty($reports)): ?>
                             <div class="no-reports">
                                 <i class="fas fa-file-alt"></i>
                                 <p>No reports found for this month.</p>
                             </div>
                         <?php else: ?>
                             <?php foreach ($reports as $r): ?>
                                 <div class="report-card">
                                     <div class="report-info">
                                         <i class="fas fa-file-alt"></i>
                                         <span><?= htmlspecialchars($r['report_title']) ?></span>
                                     </div>
                                     <div class="report-actions">
                                         <button class="view-btn" data-id="<?= $r['report_id'] ?>" data-title="<?= htmlspecialchars($r['report_title']) ?>" title="View">
                                             <i class="fas fa-eye"></i>
                                         </button>
                                         <?php if (isAdmin()): ?>
                                              <button class="restore-btn" data-id="<?= $r['report_id'] ?>" title="Restore">
                                                  <i class="fas fa-undo"></i>
                                              </button>
                                              <button class="delete-btn danger" data-id="<?= $r['report_id'] ?>" title="Delete">
                                                 <i class="fas fa-trash"></i>
                                             </button>
                                         <?php endif; ?>
                                     </div>
                                 </div>
                             <?php endforeach; ?>
                         <?php endif; ?>
                     </div>
                     <?php if ($total > 10): ?>
                     <div class="pagination">
                         <?php
                         $totalPages = ceil($total / $limit);
                         $currentPage = $page;
                         if ($currentPage > 1): ?>
                             <a href="?year=<?= $year ?>&month=<?= $month ?>&search=<?= urlencode($search) ?>&page=<?= $currentPage - 1 ?>" class="page-btn">&laquo; Previous</a>
                         <?php endif; ?>
                         <?php for ($i = 1; $i <= $totalPages; $i++): ?>
                             <a href="?year=<?= $year ?>&month=<?= $month ?>&search=<?= urlencode($search) ?>&page=<?= $i ?>" class="page-btn <?= $i == $currentPage ? 'active' : '' ?>"><?= $i ?></a>
                         <?php endfor; ?>
                         <?php if ($currentPage < $totalPages): ?>
                             <a href="?year=<?= $year ?>&month=<?= $month ?>&search=<?= urlencode($search) ?>&page=<?= $currentPage + 1 ?>" class="page-btn">Next &raquo;</a>
                         <?php endif; ?>
                     </div>
                     <?php endif; ?>
                 </div>
             </div>
         </div>
         

         <div id="restoreModal">
             <div class="modal-box">
                 <h2>Confirm Restore</h2>
                 <p>Are you sure you want to restore this report to active status?</p>
                 <div style="text-align: center; margin-top: 20px;">
                     <button id="confirmRestore" class="btn-primary" style="width: 100px;">Restore</button>
                     <button id="cancelRestore" class="btn-primary" style="width: 100px; margin-left: 10px; background: #ccc; color: #333;">Cancel</button>
                 </div>
             </div>
         </div>

         <div id="deleteModal">
             <div class="modal-box">
                 <h2>Confirm Delete</h2>
                 <p>Are you sure you want to delete this report? This action cannot be undone.</p>
                 <div style="text-align: center; margin-top: 20px;">
                     <button id="confirmDelete" class="btn-primary" style="width: 100px; background: #c0392b;">Delete</button>
                     <button id="cancelDelete" class="btn-primary" style="width: 100px; margin-left: 10px; background: #ccc; color: #333;">Cancel</button>
                 </div>
             </div>
         </div>

         <div id="successNotification">
             <div class="modal-box">
                 <p id="successMessage"></p>
             </div>
         </div>
         
         <div id="previewModal">
             <div class="modal-box large">
                 <div class="modal-header">
                     <h2>Preview Document</h2>
                     <button class="close-btn" id="closePreviewModal">&times;</button>
                 </div>
                 <div class="modal-content">
                     <iframe id="documentPreview" src="" width="100%" height="500px" style="border: none;"></iframe>
                     <div id="previewMessage" style="display: none; text-align: center; padding: 20px;">Preview not available for this file type. Please use the download button.</div>
                     <div style="text-align: center; margin-top: 10px;">
                         <a id="downloadLink" href="" download><button class="btn-primary">Download</button></a>
                     </div>
                 </div>
             </div>
         </div>

     </main>
</div>
<?php endif; ?>
<script>
let selectedYear = null;

function toggleYear(year) {
    if (selectedYear === year) {
        
        selectedYear = null;
        document.getElementById('monthsPanel').style.display = 'none';
        document.querySelectorAll('.folder-card[data-year]').forEach(c => c.classList.remove('selected'));
    } else {
       
        selectedYear = year;
        document.querySelectorAll('.folder-card[data-year]').forEach(c => c.classList.remove('selected'));
        event.currentTarget.classList.add('selected');
        document.getElementById('monthsTitle').textContent = `Months for ${year}`;
        fetchMonths(year, 'archived');
    }
}

function fetchMonths(year, status) {
    
    fetch(`get_months.php?year=${year}&status=${status}`)
        .then(response => response.json())
        .then(data => {
            const container = document.getElementById('monthsContainer');
            container.innerHTML = '';
            for (const [m, count] of Object.entries(data.months || {})) {
                const card = document.createElement('div');
                card.className = 'folder-card';
                card.innerHTML = `
                    <a href="?year=${year}&month=${m}">
                        <i class="fas fa-folder"></i>
                        <h3>${new Date(year, m-1, 1).toLocaleString('default', { month: 'long' })}</h3>
                        <p>${count} reports</p>
                    </a>
                `;
                container.appendChild(card);
            }
            document.getElementById('monthsPanel').style.display = 'block';
        });
}


const urlParams = new URLSearchParams(window.location.search);
const yearParam = urlParams.get('year');
if (yearParam) {
    selectedYear = yearParam;
    const yearCard = document.querySelector(`.folder-card[data-year="${yearParam}"]`);
    if (yearCard) {
        yearCard.classList.add('selected');
        fetchMonths(yearParam, 'archived');
    }
}

const monthModal = document.getElementById('monthModal');
if (monthModal) {
    const closeMonthModal = document.getElementById('closeMonthModal');
    closeMonthModal.addEventListener('click', () => {
        window.location.href = '?year=<?= $year ?>';
    });

    monthModal.addEventListener('click', (e) => {
        if(e.target === monthModal){
            window.location.href = '?year=<?= $year ?>';
        }
    });
}

const restoreModal = document.getElementById('restoreModal');
const confirmRestore = document.getElementById('confirmRestore');
const cancelRestore = document.getElementById('cancelRestore');
const deleteModal = document.getElementById('deleteModal');
const confirmDelete = document.getElementById('confirmDelete');
const cancelDelete = document.getElementById('cancelDelete');
const successNotification = document.getElementById('successNotification');
const successMessage = document.getElementById('successMessage');

let restoreId = null;
let deleteId = null;

document.addEventListener('click', (e) => {
    if (e.target.closest('.restore-btn')) {
        const btn = e.target.closest('.restore-btn');
        restoreId = btn.dataset.id;
        restoreModal.classList.add('active');
    }
    if (e.target.closest('.delete-btn')) {
        const btn = e.target.closest('.delete-btn');
        deleteId = btn.dataset.id;
        deleteModal.classList.add('active');
    }
});

confirmRestore.addEventListener('click', () => {
    if (restoreId) {
        fetch(`../archives/restore_report.php?id=${restoreId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    successMessage.textContent = data.message;
                    successNotification.classList.add('active');
                    restoreModal.classList.remove('active');
                   
                    const card = document.querySelector(`.restore-btn[data-id="${restoreId}"]`).closest('.report-card');
                    if (card) card.remove();
                    
                    loadReports('', 1);
                    
                    setTimeout(() => {
                        successNotification.classList.remove('active');
                    }, 3000);
                } else {
                    alert(data.message);
                }
            })
            .catch(() => alert('Error restoring report.'));
    }
});

cancelRestore.addEventListener('click', () => {
    restoreModal.classList.remove('active');
    restoreId = null;
});

restoreModal.addEventListener('click', (e) => {
    if (e.target === restoreModal) {
        restoreModal.classList.remove('active');
        restoreId = null;
    }
});

confirmDelete.addEventListener('click', () => {
    if (deleteId) {
        fetch(`../archives/delete_report.php?id=${deleteId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    successMessage.textContent = data.message;
                    successNotification.classList.add('active');
                    deleteModal.classList.remove('active');
                    
                    const card = document.querySelector(`.delete-btn[data-id="${deleteId}"]`).closest('.report-card');
                    if (card) card.remove();
                   
                    loadReports('', 1);
                    setTimeout(() => {
                        successNotification.classList.remove('active');
                    }, 3000);
                } else {
                    alert(data.message);
                }
            })
            .catch(() => alert('Error deleting report.'));
    }
});

cancelDelete.addEventListener('click', () => {
    deleteModal.classList.remove('active');
    deleteId = null;
});

deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
        deleteModal.classList.remove('active');
        deleteId = null;
    }
});


const searchInput = document.getElementById('searchInput');
const reportsList = document.getElementById('reportsList');
const isAdmin = <?= isAdmin() ? 'true' : 'false' ?>;
let currentPage = 1;

function loadReports(query, page = 1) {
    const year = <?= json_encode($year) ?>;
    const month = <?= json_encode($month) ?>;
    fetch(`search_reports.php?search=${encodeURIComponent(query)}&year=${year}&month=${month}&status=archived&page=${page}`)
        .then(response => response.json())
        .then(data => {
            reportsList.innerHTML = '';
            if (data.reports.length === 0) {
                reportsList.innerHTML = '<div class="no-reports"><i class="fas fa-file-alt"></i><p>No reports found for this month.</p></div>';
            } else {
                data.reports.forEach(r => {
                    let actions = `
                        <button class="view-btn" data-id="${r.report_id}" data-title="${r.report_title}" title="View">
                            <i class="fas fa-eye"></i>
                        </button>
                    `;
                    if (isAdmin) {
                        actions += `
                            <a href="#" class="restore-btn" data-id="${r.report_id}" title="Restore" onclick="return false;">
                                <i class="fas fa-undo"></i>
                            </a>
                            <a href="#" class="delete-btn danger" data-id="${r.report_id}" title="Delete" onclick="return false;">
                                <i class="fas fa-trash"></i>
                            </a>
                        `;
                    }
                    const card = `
                        <div class="report-card">
                            <div class="report-info">
                                <i class="fas fa-file-alt"></i>
                                <span>${r.report_title}</span>
                            </div>
                            <div class="report-actions">
                                ${actions}
                            </div>
                        </div>
                    `;
                    reportsList.innerHTML += card;
                });
            }
            const paginationContainer = document.querySelector('.pagination');
            if (paginationContainer) {
                paginationContainer.remove();
            }
            if (data.total > 10) {
                const totalPages = Math.ceil(data.total / 10);
                let paginationHTML = '<div class="pagination">';
                if (page > 1) {
                    paginationHTML += `<button class="page-btn" onclick="loadReports('${query}', ${page - 1})">&laquo; Previous</button>`;
                }
                for (let i = 1; i <= totalPages; i++) {
                    paginationHTML += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="loadReports('${query}', ${i})">${i}</button>`;
                }
                if (page < totalPages) {
                    paginationHTML += `<button class="page-btn" onclick="loadReports('${query}', ${page + 1})">Next &raquo;</button>`;
                }
                paginationHTML += '</div>';
                reportsList.insertAdjacentHTML('afterend', paginationHTML);
            }
        });
}

if (searchInput && reportsList) {
    searchInput.addEventListener('input', function() {
        const query = this.value;
        currentPage = 1;
        loadReports(query, currentPage);
    });
}

const previewModal = document.getElementById('previewModal');
const closePreviewModal = document.getElementById('closePreviewModal');
const documentPreview = document.getElementById('documentPreview');
const downloadLink = document.getElementById('downloadLink');
const previewMessage = document.getElementById('previewMessage');

closePreviewModal.addEventListener('click', () => {
    previewModal.classList.remove('active');
});

previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
        previewModal.classList.remove('active');
    }
});

document.addEventListener('click', (e) => {
    if (e.target.closest('.view-btn')) {
        const btn = e.target.closest('.view-btn');
        const id = btn.dataset.id;
        const title = btn.dataset.title;
        const ext = title.split('.').pop().toLowerCase();
        
        // Use download endpoint from reports folder
        const fileUrl = `../reports/download_file.php?id=${id}`;
        
        if (['pdf', 'jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
            documentPreview.src = fileUrl;
            documentPreview.style.display = 'block';
            previewMessage.style.display = 'none';
            downloadLink.href = fileUrl + '&download=1';
            downloadLink.download = title;
            previewModal.classList.add('active');
        } else if (ext === 'docx') {
            // For docx, convert to PDF first
            fetch(`../reports/convert_to_pdf.php?id=${id}`)
                .then(response => response.blob())
                .then(blob => {
                    const url = URL.createObjectURL(blob);
                    documentPreview.src = url;
                    documentPreview.style.display = 'block';
                    previewMessage.style.display = 'none';
                    downloadLink.href = fileUrl + '&download=1';
                    downloadLink.download = title;
                    previewModal.classList.add('active');
                })
                .catch(() => {
                    documentPreview.style.display = 'none';
                    previewMessage.style.display = 'block';
                    downloadLink.href = fileUrl + '&download=1';
                    downloadLink.download = title;
                    previewModal.classList.add('active');
                });
        } else {
            documentPreview.style.display = 'none';
            previewMessage.style.display = 'block';
            downloadLink.href = fileUrl + '&download=1';
            downloadLink.download = title;
            previewModal.classList.add('active');
        }
    }
});
</script>
</body>
</html>
