import { useState, useEffect } from "react";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { useFolders, useCreateFolder, useDeleteFolder, useRenameFolder, useMoveFolder } from "@/hooks/use-folders";
import { useReports, useCreateReport, useDeleteReport, useMoveReports } from "@/hooks/use-reports";
import { useAuth } from "@/hooks/use-auth";
import { 
  Folder as FolderIcon,
  FileText,
  MoreVertical,
  Plus,
  Trash2,
  ChevronRight,
  Home,
  UploadCloud,
  Loader2,
  ArrowLeft,
  Edit2,
  MoveHorizontal,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Link, useLocation, useSearch } from "wouter";
import { queryClient } from "@/lib/queryClient";

export default function DrivePage() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const search = useSearch();

  const searchParams = new URLSearchParams(search);
  const currentFolderId = searchParams.get("folder") ? parseInt(searchParams.get("folder")!) : null;

  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<number[]>([]);
  const [driveSearchQuery, setDriveSearchQuery] = useState("");
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name');

  // Reset selection on navigation
  useEffect(() => {
    setSelectedFiles([]);
    setSelectedFolders([]);
  }, [currentFolderId]);

  // Reset selection when exiting select mode
  useEffect(() => {
    if (!isSelectMode) {
      setSelectedFiles([]);
      setSelectedFolders([]);
    }
  }, [isSelectMode]);

  const { data: currentFolders } = useFolders(currentFolderId);
  const { data: allFoldersData } = useFolders('all'); // For breadcrumbs and dropdowns
  const { data: reports, isLoading: reportsLoading } = useReports(currentFolderId === null ? "root" : currentFolderId);

  const foldersLoading = !currentFolders;
  const isLoading = foldersLoading || reportsLoading;

  const filteredFolders = (currentFolders?.filter(f => f.name.toLowerCase().includes(driveSearchQuery.toLowerCase())) || []).sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'date':
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      case 'size':
        // Folders don't have size, so sort by name for folders
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });
  const filteredReports = (reports?.filter(r => r.title.toLowerCase().includes(driveSearchQuery.toLowerCase()) || r.fileName.toLowerCase().includes(driveSearchQuery.toLowerCase())) || []).sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.fileName.localeCompare(b.fileName);
      case 'date':
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      case 'size':
        return b.fileSize - a.fileSize;
      default:
        return 0;
    }
  });

  // Sync navigation on folder click
  const handleFolderClick = (id: number) => {
    setLocation(`/drive?folder=${id}`);
  };

  const createFolder = useCreateFolder(currentFolderId);
  const deleteFolder = useDeleteFolder();
  const renameFolder = useRenameFolder();
  const moveFolder = useMoveFolder();
  const createReport = useCreateReport();
  const deleteReport = useDeleteReport();
  const moveReports = useMoveReports();

  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameName, setRenameName] = useState("");

  const [isRenameFileOpen, setIsRenameFileOpen] = useState(false);
  const [renameFileId, setRenameFileId] = useState<number | null>(null);
  const [renameFileName, setRenameFileName] = useState("");

  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<number | null>(null);
  const [destinationSelected, setDestinationSelected] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [currentNavigationFolder, setCurrentNavigationFolder] = useState<number | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [moveNewFolderName, setMoveNewFolderName] = useState("");

  const [deleteFolderId, setDeleteFolderId] = useState<number | null>(null);
  const [deleteFileId, setDeleteFileId] = useState<number | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);

  const handleRenameFile = async () => {
    if (!renameFileName.trim() || !renameFileId) return;
    const { apiRequest } = await import("@/lib/queryClient");
    await apiRequest("PATCH", `/api/reports/${renameFileId}`, { title: renameFileName, fileName: renameFileName });
    queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    setRenameFileName("");
    setIsRenameFileOpen(false);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    await createFolder.mutateAsync({
      name: newFolderName,
      parentId: currentFolderId,
    });
    queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
    setNewFolderName("");
    setIsNewFolderOpen(false);
  };

  const handleRenameFolder = async () => {
    if (!renameName.trim() || !renameId) return;
    await renameFolder.mutateAsync({ id: renameId, name: renameName });
    setRenameName("");
    setIsRenameOpen(false);
  };

  const handleUpload = async () => {
    const fileInput = document.getElementById("file-upload-multiple") as HTMLInputElement | null;
    const files = fileInput?.files;
    if (!files || files.length === 0) return;

    // Process files asynchronously without blocking
    const uploadPromises = Array.from(files).map(async (file) => {
      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;
          try {
            await createReport.mutateAsync({
              title: file.name,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              fileData: base64,
              folderId: currentFolderId,
              description: "Uploaded file",
              year: new Date().getFullYear(),
              month: new Date().getMonth() + 1,
            });
          } catch (error) {
            console.error("Upload failed:", error);
          }
          resolve();
        };
        reader.readAsDataURL(file);
      });
    });

    // Wait for all uploads to complete
    await Promise.all(uploadPromises);

    setUploadFile(null);
    setIsUploadOpen(false);
  };

  const handleMoveItems = async () => {
    if (selectedFiles.length === 0 && selectedFolders.length === 0) return;
    const targetFolderId = selectedDestination;

    if (selectedFiles.length > 0) {
      await moveReports.mutateAsync({ reportIds: selectedFiles, folderId: targetFolderId });
    }
    if (selectedFolders.length > 0) {
      for (const id of selectedFolders) {
        await moveFolder.mutateAsync({ id, targetParentId: targetFolderId });
      }
    }
    queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    setSelectedFiles([]);
    setSelectedFolders([]);
    setIsMoveOpen(false);
    setIsSelectMode(false); // Exit select mode after successful move
    if (targetFolderId !== null) {
      setLocation(`/drive?folder=${targetFolderId}`); // Navigate to destination folder
    }
  };

  const handleBulkDelete = async () => {
    if (selectedFiles.length > 0) {
      for (const id of selectedFiles) {
        await deleteReport.mutateAsync(id);
      }
    }
    if (selectedFolders.length > 0) {
      for (const id of selectedFolders) {
        await deleteFolder.mutateAsync(id);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    setSelectedFiles([]);
    setSelectedFolders([]);
    setIsBulkDeleteOpen(false);
    setIsSelectMode(false); // Exit select mode after successful delete
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

  const toggleFolderSelection = (id: number) => {
    setSelectedFolders(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleFileSelection = (id: number) => {
    setSelectedFiles(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const breadcrumbs = [];
  let tempId = currentFolderId;
  while (tempId && allFoldersData) {
    const folder = allFoldersData.find(f => f.id === tempId);
    if (folder) {
      breadcrumbs.unshift(folder);
      tempId = folder.parentId;
    } else break;
  }

  // Helper functions for move modal
  const toggleFolderExpansion = (folderId: number) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const selectDestination = (folderId: number | null) => {
    setSelectedDestination(folderId);
    setDestinationSelected(true);
    setCurrentNavigationFolder(folderId); // Selected folder becomes current for new folder creation
  };

  const isDescendant = (folderId: number | null, ancestorId: number): boolean => {
    if (folderId === null) return false;
    let current = folderId;
    while (current !== null) {
      const folder = allFoldersData?.find(f => f.id === current);
      if (!folder) break;
      if (folder.parentId === ancestorId) return true;
      current = folder.parentId;
    }
    return false;
  };

  const navigateToFolder = (folderId: number | null) => {
    setCurrentNavigationFolder(folderId);
    // Reset search when navigating
    setSearchQuery("");
  };

  const handleCreateFolderInMove = async () => {
    if (!moveNewFolderName.trim() || !user) return;

    try {
      await createFolder.mutateAsync({
        name: moveNewFolderName,
        parentId: currentNavigationFolder,
        createdBy: user?.id
      });

      setMoveNewFolderName("");
      setIsCreatingFolder(false);
      // Refresh folders data
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
    } catch (error: any) {
      console.error("Error creating folder:", error);
      // Show error to user
      alert(`Failed to create folder: ${error?.message || 'Unknown error'}`);
    }
  };

  const getFilteredFolders = () => {
    if (!searchQuery) return allFoldersData || [];
    return (allFoldersData || []).filter(folder =>
      folder.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const renderFolderTree = (parentId: number | null = null, level = 0) => {
    const folders = getFilteredFolders().filter(f => f.parentId === parentId);
    const filteredFolders = searchQuery ? folders : folders.filter(f => {
      // Don't show folders being moved
      if (selectedFolders.includes(f.id)) return false;

      return true;
    });

    return filteredFolders.map(folder => {
      const hasChildren = getFilteredFolders().some(f => f.parentId === folder.id);
      const isExpanded = expandedFolders.has(folder.id);
      const isSelected = selectedDestination === folder.id;
      const isCurrentNav = currentNavigationFolder === folder.id;

      return (
        <div key={folder.id}>
          <div
            className={`flex items-center gap-2 p-2 hover:bg-muted/50 cursor-pointer rounded-md ${
              isSelected ? 'bg-primary/10 border border-primary/20' : ''
            }`}
            style={{ paddingLeft: `${level * 20 + 8}px` }}
            onClick={() => selectDestination(folder.id)}
            onDoubleClick={() => navigateToFolder(folder.id)}
            title="Single-click to select as destination, double-click to navigate"
          >
            <FolderIcon className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm truncate flex-1">{folder.name}</span>
          </div>
          {isExpanded && hasChildren && renderFolderTree(folder.id, level + 1)}
        </div>
      );
    });
  };


  return (
    <LayoutWrapper>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary mb-2">My Drive</h1>
          <p className="text-muted-foreground mb-4">All your files and folders are stored here</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <button onClick={() => setLocation("/drive")} className={`hover:text-primary flex items-center gap-1 transition-colors ${!currentFolderId ? "font-medium text-foreground" : ""}`}>
              <Home className="w-4 h-4" /> Home
            </button>
            {breadcrumbs.map((crumb) => (
              <div key={crumb.id} className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4" />
                <button
                  onClick={() => setLocation(`/drive?folder=${crumb.id}`)}
                  className={`hover:text-primary transition-colors ${crumb.id === currentFolderId ? "font-medium text-foreground" : ""}`}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Input
              placeholder="Search folders and files..."
              value={driveSearchQuery}
              onChange={(e) => setDriveSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {(selectedFiles.length > 0 || selectedFolders.length > 0) && (
            <>
              <Button variant="outline" className="gap-2" onClick={() => setIsMoveOpen(true)}>
                <MoveHorizontal className="w-4 h-4" /> Move ({selectedFiles.length + selectedFolders.length})
              </Button>
              <Button variant="destructive" className="gap-2" onClick={() => setIsBulkDeleteOpen(true)}>
                <Trash2 className="w-4 h-4" /> Delete ({selectedFiles.length + selectedFolders.length})
              </Button>
            </>
          )}

          <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Plus className="w-4 h-4" /> New Folder
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Folder</DialogTitle>
                <DialogDescription>Create a new folder in the current location.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="new-folder-name">Folder Name</Label>
                  <Input id="new-folder-name" name="folderName" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateFolder} disabled={createFolder.isPending}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-primary">
                <UploadCloud className="w-4 h-4" /> Upload
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Files</DialogTitle>
                <DialogDescription>Select and upload files to the current location.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="py-8 text-center border-2 border-dashed rounded-xl">
                  <Input type="file" name="files" className="hidden" id="file-upload-multiple" multiple onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                  <Label htmlFor="file-upload-multiple" className="cursor-pointer">
                    <UploadCloud className="w-10 h-10 mx-auto mb-2" />
                    <span>{uploadFile ? "Files Selected" : "Click to select"}</span>
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleUpload} disabled={createReport.isPending}>Upload</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={isRenameFileOpen} onOpenChange={setIsRenameFileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
            <DialogDescription>Enter a new name for the file.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-file-input">File Name</Label>
            <Input id="rename-file-input" name="fileName" value={renameFileName} onChange={(e) => setRenameFileName(e.target.value)} />
          </div>
          <DialogFooter><Button onClick={handleRenameFile}>Rename</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>Enter a new name for the folder.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-folder-input">Folder Name</Label>
            <Input id="rename-folder-input" name="folderName" value={renameName} onChange={(e) => setRenameName(e.target.value)} />
          </div>
          <DialogFooter><Button onClick={handleRenameFolder}>Rename</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMoveOpen} onOpenChange={(open) => {
        setIsMoveOpen(open);
        if (open) {
          // Set initial navigation to root to show all folders
          setCurrentNavigationFolder(null);
        } else {
          setSelectedDestination(null);
          setDestinationSelected(false);
          setExpandedFolders(new Set());
          setSearchQuery("");
          setCurrentNavigationFolder(null);
          setIsCreatingFolder(false);
          setMoveNewFolderName("");
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Move Items</DialogTitle>
            <DialogDescription>
              Select a destination folder for {selectedFiles.length + selectedFolders.length} item{selectedFiles.length + selectedFolders.length > 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current Location */}
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Current location:</span> {currentFolderId ? breadcrumbs.map(b => b.name).join(' / ') : 'Home'}
            </div>

            {/* Search and New Folder */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search folders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreatingFolder(!isCreatingFolder)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                New Folder
              </Button>
            </div>

            {/* New Folder Input */}
            {isCreatingFolder && (
              <div className="flex gap-2">
                <Input
                  placeholder="Enter folder name"
                  value={moveNewFolderName}
                  onChange={(e) => setMoveNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateFolderInMove();
                    } else if (e.key === 'Escape') {
                      setIsCreatingFolder(false);
                      setMoveNewFolderName("");
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleCreateFolderInMove}
                  disabled={!moveNewFolderName.trim() || createFolder.isPending}
                >
                  {createFolder.isPending ? "Creating..." : "Create"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsCreatingFolder(false);
                    setMoveNewFolderName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Folder Tree */}
            <div className="border rounded-lg">
              <ScrollArea className="h-64">
                <div className="p-2">
                  {/* Root/Home option - only show when not navigated */}
                  {currentNavigationFolder === null && (
                    <div
                      className={`flex items-center gap-2 p-2 rounded-md ${
                        selectedDestination === null ? 'bg-primary/10 border border-primary/20' : ''
                      } hover:bg-muted/50 cursor-pointer`}
                      onClick={() => selectDestination(null)}
                      title="Click to select as destination"
                    >
                      <Home className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">Home</span>
                    </div>
                  )}

                  {/* Navigation breadcrumb */}
                  {currentNavigationFolder !== null && (
                    <div className="mb-2 p-2 bg-muted/30 rounded text-sm">
                      <button
                        onClick={() => navigateToFolder(null)}
                        className="text-primary hover:underline"
                      >
                        Home
                      </button>
                      <span className="mx-2">/</span>
                      <span className="font-medium">
                        {allFoldersData?.find(f => f.id === currentNavigationFolder)?.name || 'Unknown'}
                      </span>
                    </div>
                  )}

                  {/* Folder tree - start from current navigation */}
                  {renderFolderTree(currentNavigationFolder)}
                </div>
              </ScrollArea>
            </div>

            {/* Selected destination display */}
            {selectedDestination !== null && (
              <div className="text-sm">
                <span className="font-medium">Selected:</span> {allFoldersData?.find(f => f.id === selectedDestination)?.name || 'Unknown'}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMoveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedDestination !== null || (selectedDestination === null && destinationSelected)) {
                  handleMoveItems();
                }
              }}
              disabled={
                selectedDestination === null && !destinationSelected || // No destination selected
                selectedFolders.includes(selectedDestination || 0) || // Selected destination is being moved
                selectedFolders.some(id => isDescendant(selectedDestination, id)) || // Selected destination is a descendant of moved folders
                selectedDestination === (allFoldersData?.find(f => f.id === selectedFolders[0])?.parentId ?? null) || // Selected destination is the current parent
                (selectedDestination === null && destinationSelected && // Trying to move to Home
                 selectedFolders.length > 0 && selectedFolders.every(id => // All selected folders are already at root
                   (allFoldersData?.find(f => f.id === id)?.parentId ?? null) === null
                 ))
              }
            >
              Move Here
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  deleteFolder.mutate(deleteFolderId);
                  setDeleteFolderId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
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
                  deleteReport.mutate(deleteFileId);
                  setDeleteFileId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Items</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedFiles.length + selectedFolders.length} item{selectedFiles.length + selectedFolders.length > 1 ? 's' : ''}?
              {selectedFolders.length > 0 && " This will also delete all files and subfolders inside the selected folders."}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Folders</h2>
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
            {filteredFolders && filteredFolders.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredFolders.map(f => (
                  <div key={f.id} className={`relative p-4 rounded-xl border ${selectedFolders.includes(f.id) ? "border-primary" : "border-border"}`}>
                    {isSelectMode && <Checkbox className="absolute top-2 left-2" checked={selectedFolders.includes(f.id)} onCheckedChange={() => toggleFolderSelection(f.id)} />}
                    <div onClick={() => isSelectMode ? toggleFolderSelection(f.id) : handleFolderClick(f.id)} className="flex items-center gap-3 pt-4 cursor-pointer">
                      <FolderIcon className="w-10 h-10 text-secondary" />
                      <span className="truncate">{f.name}</span>
                    </div>
                    <div className="absolute top-2 right-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => {setRenameId(f.id); setRenameName(f.name); setIsRenameOpen(true);}}>Rename</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteFolderId(f.id)}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 border-2 border-dashed rounded-xl">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <FolderIcon className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground">No folders found</h3>
                <p className="text-muted-foreground">Create your first folder to get started.</p>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Files</h2>
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
            {filteredReports && filteredReports.length > 0 ? (
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      {isSelectMode && <th className="px-6 py-3 w-[40px]"><Checkbox checked={selectedFiles.length === filteredReports.length} onCheckedChange={(c) => setSelectedFiles(c ? filteredReports.map(r => r.id) : [])} /></th>}
                      <th className="px-6 py-3">Name</th>
                      <th className="px-6 py-3 text-right">Size</th>
                      <th className="px-6 py-3 w-[50px]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredReports.map(r => (
                      <tr key={r.id} className="hover:bg-muted/20 group">
                        {isSelectMode && <td className="px-6 py-4"><Checkbox checked={selectedFiles.includes(r.id)} onCheckedChange={() => toggleFileSelection(r.id)} /></td>}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4" />
                            {isSelectMode ? (
                              <span onClick={() => toggleFileSelection(r.id)} className="cursor-pointer hover:text-primary">{r.fileName}</span>
                            ) : (
                              <span onClick={() => handleFileClick(r.fileData, r.fileName)} className="cursor-pointer hover:text-primary">{r.fileName}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">{(r.fileSize / 1024).toFixed(1)} KB</td>
                        <td className="px-6 py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => {setRenameFileId(r.id); setRenameFileName(r.fileName); setIsRenameFileOpen(true);}}>Rename</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteFileId(r.id)}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-20 border-2 border-dashed rounded-xl">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground">No files found</h3>
                <p className="text-muted-foreground">Upload your first file to get started.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </LayoutWrapper>
  );
}
