import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { useFolders, useUpdateFolder, useDeleteFolder } from "@/hooks/use-folders";
import { useReports, useUpdateReport, useDeleteReport } from "@/hooks/use-reports";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Folder as FolderIcon,
  FileText,
  MoreVertical,
  RotateCcw,
  Trash2,
  Archive,
  Home,
  ChevronRight,
  ChevronDown,
  Search,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useLocation, useSearch } from "wouter";
import { queryClient } from "@/lib/queryClient";

export default function ArchivesPage() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const search = useSearch();

  const searchParams = new URLSearchParams(search);
  const currentFolderId = searchParams.get("folder") ? parseInt(searchParams.get("folder")!) : null;

  const [archivesSearchQuery, setArchivesSearchQuery] = useState("");

  const { data: currentArchivedFolders } = useFolders(currentFolderId, 'archived', 5000);
  const { data: allArchivedFolders } = useFolders('all', 'archived', 5000);
  const { data: archivedReports, isLoading: reportsLoading } = useReports(currentFolderId === null ? "root" : currentFolderId, 'archived', 5000);
  const { toast } = useToast();

  const foldersLoading = !currentArchivedFolders;
  const isLoading = foldersLoading || reportsLoading;

  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name');

  // Get unique file types from archived reports
  const fileTypes = useMemo(() => {
    if (!archivedReports) return [];
    const types = new Set<string>();
    archivedReports.forEach(r => {
      const ext = r.fileType?.toLowerCase() || 'other';
      types.add(ext);
    });
    return Array.from(types).sort();
  }, [archivedReports]);

  // Filter states for archived files
  const [nameFilter, setNameFilter] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [sizeFilter, setSizeFilter] = useState<string[]>([]);

  // Helper function to categorize file name
  const getNameCategory = (fileName: string): string => {
    const firstChar = fileName.charAt(0).toUpperCase();
    if (firstChar >= '0' && firstChar <= '9') return '0-9';
    if (firstChar >= 'A' && firstChar <= 'H') return 'A-H';
    if (firstChar >= 'I' && firstChar <= 'P') return 'I-P';
    if (firstChar >= 'Q' && firstChar <= 'Z') return 'Q-Z';
    return 'Other';
  };

  // Helper function to categorize date
  const getDateCategory = (dateValue: Date | string | null): string => {
    if (!dateValue) return 'A long time ago';
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 7) return 'Earlier this week';
    if (diffDays <= 14) return 'Last week';
    if (diffDays <= 30) return 'Earlier this month';
    if (diffDays <= 60) return 'Last month';
    return 'A long time ago';
  };

  // Helper function to categorize size
  const getSizeCategory = (fileSize: number): string => {
    const kb = fileSize / 1024;
    if (kb < 10) return 'tiny';
    if (kb < 100) return 'small';
    if (kb < 1000) return 'medium';
    if (kb < 10000) return 'large';
    return 'huge';
  };

  // Memoize filtered folders to avoid recalculating on every render
  const filteredArchivedFolders = useMemo(() => {
    const folders = currentArchivedFolders ? currentArchivedFolders.filter(f => f.name.toLowerCase().includes(archivesSearchQuery.toLowerCase())) : [];
    return [...folders].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });
  }, [currentArchivedFolders, archivesSearchQuery, sortBy]);

  // Memoize filtered reports to avoid recalculating on every render
  const filteredArchivedReports = useMemo(() => {
    let items = archivedReports ? archivedReports.filter(r => r.title.toLowerCase().includes(archivesSearchQuery.toLowerCase()) || r.fileName.toLowerCase().includes(archivesSearchQuery.toLowerCase())) : [];
    
    // Apply filters
    if (nameFilter.length > 0) {
      items = items.filter(r => nameFilter.includes(getNameCategory(r.fileName)));
    }
    if (dateFilter.length > 0) {
      items = items.filter(r => dateFilter.includes(getDateCategory(r.createdAt)));
    }
    if (typeFilter.length > 0) {
      items = items.filter(r => typeFilter.includes(r.fileType?.toLowerCase() || 'other'));
    }
    if (sizeFilter.length > 0) {
      items = items.filter(r => sizeFilter.includes(getSizeCategory(r.fileSize)));
    }
    
    return [...items].sort((a, b) => {
      if (sortBy === 'name') {
        return a.fileName.localeCompare(b.fileName);
      }
      if (sortBy === 'date') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'size') {
        return b.fileSize - a.fileSize;
      }
      return 0;
    });
  }, [archivedReports, archivesSearchQuery, sortBy, nameFilter, dateFilter, typeFilter, sizeFilter]);

  // Sync navigation on folder click
  const handleFolderClick = (id: number) => {
    setLocation(`/archives?folder=${id}`);
  };

  const breadcrumbs = [];
  let tempId = currentFolderId;
  while (tempId && allArchivedFolders) {
    const folder = allArchivedFolders.find(f => f.id === tempId);
    if (folder) {
      breadcrumbs.unshift(folder);
      tempId = folder.parentId;
    } else break;
  }

  const updateFolder = useUpdateFolder();
  const updateReport = useUpdateReport();
  const deleteFolder = useDeleteFolder();
  const deleteReport = useDeleteReport();

  const [deleteFolderId, setDeleteFolderId] = useState<number | null>(null);
  const [deleteFileId, setDeleteFileId] = useState<number | null>(null);
  const [restoreFolderId, setRestoreFolderId] = useState<number | null>(null);
  const [restoreFileId, setRestoreFileId] = useState<number | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkRestoreOpen, setIsBulkRestoreOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedFolders, setSelectedFolders] = useState<number[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);

  // Handle ESC key to exit select mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSelectMode) {
        setIsSelectMode(false);
        setSelectedFolders([]);
        setSelectedFiles([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelectMode]);

  const toggleFolderSelection = (id: number) => {
    setSelectedFolders(prev => 
      prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
    );
  };

  const toggleFileSelection = (id: number) => {
    setSelectedFiles(prev => 
      prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
    );
  };

  const handleRestoreFolder = (id: number) => {
    setRestoreFolderId(id);
  };

  const handleRestoreFile = (id: number) => {
    setRestoreFileId(id);
  };

  const createBlobUrl = (dataUrl: string) => {
    if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;

    try {
      const [mimeType, base64Data] = dataUrl.split(',');
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);

      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }

      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType.split(':')[1].split(';')[0] });
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Error creating blob URL:', error);
      return dataUrl;
    }
  };

  const handleFileClick = (fileData: string, fileName: string) => {
    const blobUrl = createBlobUrl(fileData);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the blob URL after a delay to allow the tab to open
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 1000);
  };

  const handleBulkRestore = async () => {
    const foldersCount = selectedFolders.length;
    const filesCount = selectedFiles.length;
    let hasError = false;
    let errorMessage = "";
    let restoredFolders = 0;
    let restoredFiles = 0;
    setIsRestoring(true);
    
    if (selectedFolders.length > 0) {
      for (const id of selectedFolders) {
        try {
          await updateFolder.mutateAsync({ id, status: 'active', suppressToast: true });
          restoredFolders++;
        } catch (error: any) {
          hasError = true;
          if (!errorMessage) {
            errorMessage = error?.message || "A folder named already exists in this location.";
          }
        }
      }
    }
    if (selectedFiles.length > 0) {
      for (const id of selectedFiles) {
        try {
          await updateReport.mutateAsync({ id, status: 'active', suppressToast: true });
          restoredFiles++;
        } catch (error: any) {
          hasError = true;
          if (!errorMessage) {
            errorMessage = error?.message || "A file named already exists in this location.";
          }
        }
      }
    }
    
    if (hasError) {
      // Show partial success if some items were restored
      if (restoredFolders > 0 || restoredFiles > 0) {
        const successParts: string[] = [];
        if (restoredFolders > 0) {
          successParts.push(`${restoredFolders} folder${restoredFolders > 1 ? 's' : ''} restored successfully`);
        }
        if (restoredFiles > 0) {
          successParts.push(`${restoredFiles} file${restoredFiles > 1 ? 's' : ''} restored successfully`);
        }
        toast({ title: "Partially Restored", description: successParts.join(" and ") + ". " + errorMessage, variant: "destructive" });
      } else {
        // All items failed
        toast({ title: "Error", description: errorMessage, variant: "destructive" });
      }
    } else {
      // Show success message based on number of items restored
      const totalCount = foldersCount + filesCount;
      const folderText = foldersCount > 0 ? `${foldersCount} folder${foldersCount > 1 ? 's' : ''}` : '';
      const fileText = filesCount > 0 ? `${filesCount} file${filesCount > 1 ? 's' : ''}` : '';
      const andText = foldersCount > 0 && filesCount > 0 ? ' and ' : '';
      
      toast({
        title: "Restored",
        description: `${folderText}${andText}${fileText} restored successfully`
      });
    }
    
    setSelectedFolders([]);
    setSelectedFiles([]);
    setIsBulkRestoreOpen(false);
    setIsSelectMode(false);
    setIsRestoring(false);
  };

  const handleBulkDelete = async () => {
    const foldersCount = selectedFolders.length;
    const filesCount = selectedFiles.length;
    setIsDeleting(true);
    
    if (selectedFolders.length > 0) {
      for (const id of selectedFolders) {
        await deleteFolder.mutateAsync({ id, suppressToast: true });
      }
    }
    if (selectedFiles.length > 0) {
      for (const id of selectedFiles) {
        await deleteReport.mutateAsync({ id, suppressToast: true });
      }
    }
    
    // Show success message based on number of items deleted
    const totalCount = foldersCount + filesCount;
    const folderText = foldersCount > 0 ? `${foldersCount} folder${foldersCount > 1 ? 's' : ''}` : '';
    const fileText = filesCount > 0 ? `${filesCount} file${filesCount > 1 ? 's' : ''}` : '';
    const andText = foldersCount > 0 && filesCount > 0 ? ' and ' : '';
    
    toast({
      title: "Deleted",
      description: `${folderText}${andText}${fileText} deleted successfully`
    });
    
    setSelectedFolders([]);
    setSelectedFiles([]);
    setIsBulkDeleteOpen(false);
    setIsSelectMode(false);
    setIsDeleting(false);
  };

  return (
    <LayoutWrapper>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary mb-2 flex items-center gap-2">
            <Archive className="w-8 h-8" /> Archives
          </h1>
          <p className="text-muted-foreground mb-4">View and manage archived documents.</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <button onClick={() => setLocation("/archives")} className={`hover:text-primary flex items-center gap-1 transition-colors ${!currentFolderId ? "font-medium text-foreground" : ""}`}>
              <Home className="w-4 h-4" /> Home
            </button>
            {breadcrumbs.map((crumb) => (
              <div key={crumb.id} className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4" />
                <button
                  onClick={() => setLocation(`/archives?folder=${crumb.id}`)}
                  className={`hover:text-primary transition-colors ${crumb.id === currentFolderId ? "font-medium text-foreground" : ""}`}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Input
              name="archives-search"
              placeholder="Search archived folders and files..."
              value={archivesSearchQuery}
              onChange={(e) => setArchivesSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </div>
        {/* Bulk actions in header - shown when items are selected */}
        {(isSelectMode && (selectedFolders.length > 0 || selectedFiles.length > 0)) && (
          <div className="flex items-center gap-3">
            {(selectedFolders.length > 0 || selectedFiles.length > 0) && (
              <>
                <Button variant="outline" className="gap-2" onClick={() => setIsBulkRestoreOpen(true)}>
                  <RotateCcw className="w-4 h-4" /> Restore ({selectedFolders.length + selectedFiles.length})
                </Button>
                <Button variant="destructive" className="gap-2" onClick={() => setIsBulkDeleteOpen(true)}>
                  <Trash2 className="w-4 h-4" /> Delete ({selectedFolders.length + selectedFiles.length})
                </Button>
              </>
            )}
          </div>
        )}

      </div>

      <AlertDialog open={!!deleteFolderId} onOpenChange={() => setDeleteFolderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this folder? This action cannot be undone and will also delete all files and subfolders inside it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteFolderId) {
                  setIsDeleting(true);
                  deleteFolder.mutate({ id: deleteFolderId });
                  setDeleteFolderId(null);
                  setTimeout(() => setIsDeleting(false), 1000);
                }
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteFileId} onOpenChange={() => setDeleteFileId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteFileId) {
                  setIsDeleting(true);
                  deleteReport.mutate({ id: deleteFileId });
                  setDeleteFileId(null);
                  setTimeout(() => setIsDeleting(false), 1000);
                }
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!restoreFolderId} onOpenChange={() => setRestoreFolderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore this folder? It will be moved back to the drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (restoreFolderId) {
                  setIsRestoring(true);
                  try {
                    await updateFolder.mutateAsync({ id: restoreFolderId, status: 'active' });
                    toast({ title: "Restored", description: "Folder restored successfully" });
                  } catch (error: any) {
                    toast({ title: "Error", description: error?.message || "A folder named already exists in this location.", variant: "destructive" });
                  }
                  setRestoreFolderId(null);
                  setIsRestoring(false);
                }
              }}
              disabled={isRestoring}
            >
              {isRestoring ? "Restoring..." : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!restoreFileId} onOpenChange={() => setRestoreFileId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore this file? It will be moved back to the drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (restoreFileId) {
                  setIsRestoring(true);
                  try {
                    await updateReport.mutateAsync({ id: restoreFileId, status: 'active' });
                    toast({ title: "Restored", description: "File restored successfully" });
                  } catch (error: any) {
                    toast({ title: "Error", description: error?.message || "A file named already exists in this location.", variant: "destructive" });
                  }
                  setRestoreFileId(null);
                  setIsRestoring(false);
                }
              }}
              disabled={isRestoring}
            >
              {isRestoring ? "Restoring..." : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Restore Confirmation Dialog */}
      <AlertDialog open={isBulkRestoreOpen} onOpenChange={setIsBulkRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Items</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore {selectedFolders.length + selectedFiles.length} item{(selectedFolders.length + selectedFiles.length) > 1 ? 's' : ''}? They will be moved back to the drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkRestore} disabled={isRestoring}>
              {isRestoring ? "Restoring..." : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Items</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedFolders.length + selectedFiles.length} item{(selectedFolders.length + selectedFiles.length) > 1 ? 's' : ''}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
          {/* Only show Folders section if:
              1. At Home (root) - always show
              2. Inside a folder with subfolders - show
          */}
          {(currentFolderId === null || (filteredArchivedFolders && filteredArchivedFolders.length > 0)) && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">Archived Folders</h2>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setIsSelectMode(!isSelectMode)}>
                      {isSelectMode ? 'Exit Select' : 'Select'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy('name')}>
                      Sort by Name
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy('date')}>
                      Sort by Date
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy('size')}>
                      Sort by Size
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {filteredArchivedFolders && filteredArchivedFolders.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {filteredArchivedFolders.map(f => (
                    <div key={f.id} className={`relative p-4 rounded-xl border group ${isSelectMode && selectedFolders.includes(f.id) ? "border-primary" : "border-border"}`}>
                      {isSelectMode && (
                        <Checkbox 
                          className="absolute top-2 left-2" 
                          checked={selectedFolders.includes(f.id)} 
                          onCheckedChange={() => toggleFolderSelection(f.id)} 
                        />
                      )}
                      <div onClick={() => isSelectMode ? toggleFolderSelection(f.id) : handleFolderClick(f.id)} className="flex items-center gap-3 pt-4 cursor-pointer">
                        <FolderIcon className="w-10 h-10 text-secondary" />
                        <span className="truncate">{f.name}</span>
                      </div>
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => handleRestoreFolder(f.id)}>
                              <RotateCcw className="w-4 h-4 mr-2" /> Restore
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteFolderId(f.id)}>
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                currentFolderId === null && (
                  <div className="text-center py-20 border-2 border-dashed rounded-xl">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                      <FolderIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground">No archived folders</h3>
                    <p className="text-muted-foreground">Archived folders will appear here.</p>
                  </div>
                )
              )}
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Archived Files</h2>
              <div className="flex items-center gap-2">
                {/* Sort Dropdown */}
                <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsSelectMode(!isSelectMode)}>
                    {isSelectMode ? 'Exit Select' : 'Select'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy('name')}>
                    Sort by Name
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy('date')}>
                    Sort by Date
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy('size')}>
                    Sort by Size
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>
            {archivedReports && archivedReports.length > 0 ? (
              <div className="bg-card rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      {isSelectMode && <th className="px-6 py-3 w-[40px]"><Checkbox checked={selectedFiles.length === filteredArchivedReports.length} onCheckedChange={(c) => setSelectedFiles(c === true ? filteredArchivedReports.map(r => r.id) : [])} /></th>}
                      <th className="px-6 py-3 text-left w-[40%]">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold">Name</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-muted/50">
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Filter by Name</div>
                              <DropdownMenuCheckboxItem checked={nameFilter.includes('0-9')} onCheckedChange={() => setNameFilter(nameFilter.includes('0-9') ? nameFilter.filter(f => f !== '0-9') : [...nameFilter, '0-9'])}>0-9</DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem checked={nameFilter.includes('A-H')} onCheckedChange={() => setNameFilter(nameFilter.includes('A-H') ? nameFilter.filter(f => f !== 'A-H') : [...nameFilter, 'A-H'])}>A-H</DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem checked={nameFilter.includes('I-P')} onCheckedChange={() => setNameFilter(nameFilter.includes('I-P') ? nameFilter.filter(f => f !== 'I-P') : [...nameFilter, 'I-P'])}>I-P</DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem checked={nameFilter.includes('Q-Z')} onCheckedChange={() => setNameFilter(nameFilter.includes('Q-Z') ? nameFilter.filter(f => f !== 'Q-Z') : [...nameFilter, 'Q-Z'])}>Q-Z</DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem checked={nameFilter.includes('Other')} onCheckedChange={() => setNameFilter(nameFilter.includes('Other') ? nameFilter.filter(f => f !== 'Other') : [...nameFilter, 'Other'])}>Other</DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left w-[20%]">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold">Date</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-muted/50">
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Filter by Date</div>
                              <DropdownMenuCheckboxItem checked={dateFilter.includes('A long time ago')} onCheckedChange={() => setDateFilter(dateFilter.includes('A long time ago') ? dateFilter.filter(f => f !== 'A long time ago') : [...dateFilter, 'A long time ago'])}>A long time ago</DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem checked={dateFilter.includes('Last month')} onCheckedChange={() => setDateFilter(dateFilter.includes('Last month') ? dateFilter.filter(f => f !== 'Last month') : [...dateFilter, 'Last month'])}>Last month</DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem checked={dateFilter.includes('Earlier this month')} onCheckedChange={() => setDateFilter(dateFilter.includes('Earlier this month') ? dateFilter.filter(f => f !== 'Earlier this month') : [...dateFilter, 'Earlier this month'])}>Earlier this month</DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem checked={dateFilter.includes('Last week')} onCheckedChange={() => setDateFilter(dateFilter.includes('Last week') ? dateFilter.filter(f => f !== 'Last week') : [...dateFilter, 'Last week'])}>Last week</DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem checked={dateFilter.includes('Earlier this week')} onCheckedChange={() => setDateFilter(dateFilter.includes('Earlier this week') ? dateFilter.filter(f => f !== 'Earlier this week') : [...dateFilter, 'Earlier this week'])}>Earlier this week</DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left w-[20%]">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold">Type</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-muted/50">
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48 max-h-64 overflow-y-auto">
                              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Filter by Type</div>
                              {fileTypes.map(type => (
                                <DropdownMenuCheckboxItem
                                  key={type}
                                  checked={typeFilter.includes(type)}
                                  onCheckedChange={() => setTypeFilter(typeFilter.includes(type) ? typeFilter.filter(f => f !== type) : [...typeFilter, type])}
                                >
                                  {type.toUpperCase()}
                                </DropdownMenuCheckboxItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </th>
                      <th className="px-6 py-3 text-right w-[20%]">
                        <div className="flex items-center justify-end gap-1">
                          <span className="font-semibold">Size</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-muted/50">
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Filter by Size</div>
                              <DropdownMenuCheckboxItem checked={sizeFilter.includes('tiny')} onCheckedChange={() => setSizeFilter(sizeFilter.includes('tiny') ? sizeFilter.filter(f => f !== 'tiny') : [...sizeFilter, 'tiny'])}>Tiny (&lt;10 KB)</DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem checked={sizeFilter.includes('small')} onCheckedChange={() => setSizeFilter(sizeFilter.includes('small') ? sizeFilter.filter(f => f !== 'small') : [...sizeFilter, 'small'])}>Small (10-100 KB)</DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem checked={sizeFilter.includes('medium')} onCheckedChange={() => setSizeFilter(sizeFilter.includes('medium') ? sizeFilter.filter(f => f !== 'medium') : [...sizeFilter, 'medium'])}>Medium (100 KB - 1 MB)</DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem checked={sizeFilter.includes('large')} onCheckedChange={() => setSizeFilter(sizeFilter.includes('large') ? sizeFilter.filter(f => f !== 'large') : [...sizeFilter, 'large'])}>Large (1-10 MB)</DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem checked={sizeFilter.includes('huge')} onCheckedChange={() => setSizeFilter(sizeFilter.includes('huge') ? sizeFilter.filter(f => f !== 'huge') : [...sizeFilter, 'huge'])}>Huge (&gt;10 MB)</DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </th>
                      <th className="px-6 py-3 w-[50px]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredArchivedReports.map(r => (
                      <tr key={r.id} className="hover:bg-muted/20 group">
                        {isSelectMode && (
                          <td className="px-6 py-4">
                            <Checkbox 
                              checked={selectedFiles.includes(r.id)} 
                              onCheckedChange={() => toggleFileSelection(r.id)} 
                            />
                          </td>
                        )}
                        <td className="px-6 py-4 w-[40%]">
                          <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4" />
                            <span onClick={() => r.fileData && handleFileClick(r.fileData, r.fileName)} className="cursor-pointer hover:text-primary">{r.fileName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 w-[20%] text-muted-foreground">{r.createdAt ? format(new Date(r.createdAt), 'MMM d, yyyy') : '-'}</td>
                        <td className="px-6 py-4 w-[20%] text-muted-foreground">{r.fileType || '-'}</td>
                        <td className="px-6 py-4 w-[20%] text-right">{(r.fileSize / 1024).toFixed(1)} KB</td>
                        <td className="px-6 py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => handleRestoreFile(r.id)}>
                                <RotateCcw className="w-4 h-4 mr-2" /> Restore
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteFileId(r.id)}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                    {filteredArchivedReports.length === 0 && (
                      <tr>
                        <td colSpan={isSelectMode ? 6 : 5} className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <FileText className="w-8 h-8 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">No archived files found</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-20 border-2 border-dashed rounded-xl">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground">No archived files</h3>
                <p className="text-muted-foreground">Archived files will appear here.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </LayoutWrapper>
  );
}
