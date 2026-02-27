import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutWrapper, useSidebar } from "@/components/layout-wrapper";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFolders, useCreateFolder, useDeleteFolder, useRenameFolder, useMoveFolder, useUpdateFolder } from "@/hooks/use-folders";
import { useReports, useCreateReport, useDeleteReport, useMoveReports, useUpdateReport } from "@/hooks/use-reports";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
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
  ChevronDown,
  Filter,
  FolderOpen,
  Archive,
  Menu,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
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
import { format, formatDistanceToNow } from "date-fns";

// Helper function to convert MIME type to readable extension
const getFileExtension = (mimeType: string): string => {
  const mimeToExt: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/msword': 'DOC',
    'text/plain': 'TXT',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/vnd.ms-excel': 'XLS',
    'text/csv': 'CSV',
    'application/zip': 'ZIP',
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
    'image/gif': 'GIF',
  };
  return mimeToExt[mimeType.toLowerCase()] || mimeType.split('/').pop()?.toUpperCase() || mimeType;
};

export default function DrivePage() {
  return (
    <LayoutWrapper>
      <DriveContent />
    </LayoutWrapper>
  );
}

function DriveContent() {
  const { user } = useAuth();
  const { openSidebar } = useSidebar();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const search = useSearch();

  const searchParams = new URLSearchParams(search);
  const currentFolderId = searchParams.get("folder") ? parseInt(searchParams.get("folder")!) : null;

  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<number[]>([]);
  const [driveSearchQuery, setDriveSearchQuery] = useState("");
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name');

  // Mobile file dialog state
  const [selectedFileForDialog, setSelectedFileForDialog] = useState<any>(null);
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);

  // Filter states
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

  const { data: currentFolders, isInitialLoading: foldersLoading } = useFolders(currentFolderId, 'active', 5000);
  const { data: allFoldersData, isInitialLoading: allFoldersLoading } = useFolders('all', 'active', 5000); // For breadcrumbs and dropdowns
  const { data: reports, isInitialLoading: reportsLoading } = useReports(currentFolderId === null ? "root" : currentFolderId, 'active', 10000);

  // Get unique file types from reports
  const fileTypes = useMemo(() => {
    if (!reports) return [];
    const types = new Set<string>();
    reports.forEach(r => {
      const ext = r.fileType?.toLowerCase() || 'other';
      types.add(ext);
    });
    return Array.from(types).sort();
  }, [reports]);

  // Only show loading on initial load - use cached data after
  const isLoading = foldersLoading || allFoldersLoading || reportsLoading;

  // Memoize filtered folders to avoid recalculating on every render
  const filteredFolders = useMemo(() => {
    const folders = currentFolders?.filter(f => f.name.toLowerCase().includes(driveSearchQuery.toLowerCase())) || [];
    return folders.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'date':
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        case 'size':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }, [currentFolders, driveSearchQuery, sortBy]);

  // Memoize filtered reports to avoid recalculating on every render
  const filteredReports = useMemo(() => {
    const items = reports?.filter(r => {
      // Search query filter
      const matchesSearch = r.title.toLowerCase().includes(driveSearchQuery.toLowerCase()) || r.fileName.toLowerCase().includes(driveSearchQuery.toLowerCase());
      
      // Name filter
      const nameCategory = getNameCategory(r.fileName);
      const matchesName = nameFilter.length === 0 || nameFilter.includes(nameCategory);
      
      // Date filter
      const dateCategory = getDateCategory(r.createdAt);
      const matchesDate = dateFilter.length === 0 || dateFilter.includes(dateCategory);
      
      // Type filter
      const fileExt = r.fileType?.toLowerCase() || 'other';
      const matchesType = typeFilter.length === 0 || typeFilter.includes(fileExt);
      
      // Size filter
      const sizeCategory = getSizeCategory(r.fileSize);
      const matchesSize = sizeFilter.length === 0 || sizeFilter.includes(sizeCategory);
      
      return matchesSearch && matchesName && matchesDate && matchesType && matchesSize;
    }) || [];
    
    return items.sort((a, b) => {
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
  }, [reports, driveSearchQuery, nameFilter, dateFilter, typeFilter, sizeFilter, sortBy]);

  // Sync navigation on folder click
  const handleFolderClick = (id: number) => {
    setLocation(`/drive?folder=${id}`);
  };

  const createFolder = useCreateFolder(currentFolderId);
  const deleteFolder = useDeleteFolder();
  const renameFolder = useRenameFolder();
  const moveFolder = useMoveFolder();
  const updateFolder = useUpdateFolder();
  const createReport = useCreateReport();
  const deleteReport = useDeleteReport();
  const moveReports = useMoveReports();
  const updateReport = useUpdateReport();

  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
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
  const [isBulkArchiveOpen, setIsBulkArchiveOpen] = useState(false);
  const [archiveFolderId, setArchiveFolderId] = useState<number | null>(null);
  const [archiveFileId, setArchiveFileId] = useState<number | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRenameFile = async () => {
    if (!renameFileName.trim() || !renameFileId) return;
    
    try {
      // Wait for the mutation to complete - the hook's onSuccess will invalidate reports
      await updateReport.mutateAsync({ id: renameFileId, title: renameFileName, fileName: renameFileName });
      // Also invalidate activities to show the rename activity
      await queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      
      // Show success message only after mutation succeeds
      setRenameFileName("");
      setIsRenameFileOpen(false);
      toast({ title: "Updated", description: "File renamed successfully" });
    } catch (error: any) {
      // Handle error - show error message
      console.error("Failed to rename file:", error);
      toast({ title: "Error", description: error?.message || "A file named already exists in this location.", variant: "destructive" });
    }
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
    
    try {
      // Wait for the mutation to complete - the hook's onSuccess will invalidate folders
      await renameFolder.mutateAsync({ id: renameId, name: renameName });
      // Also invalidate activities to show the rename activity
      await queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      
      // Show success message only after mutation succeeds
      setRenameName("");
      setIsRenameOpen(false);
      toast({ title: "Updated", description: "Folder renamed successfully" });
    } catch (error: any) {
      // Handle error - show error message
      console.error("Failed to rename folder:", error);
      toast({ title: "Error", description: error?.message || "A folder named already exists in this location.", variant: "destructive" });
    }
  };

  const handleUpload = async () => {
    // Use files from state if available (from drag and drop), otherwise use file input
    let files: FileList | null = null;
    
    if (uploadFiles.length > 0) {
      // Create a FileList-like object from the state
      const dataTransfer = new DataTransfer();
      uploadFiles.forEach(file => dataTransfer.items.add(file));
      files = dataTransfer.files;
    } else {
      const fileInput = document.getElementById("file-upload-multiple") as HTMLInputElement | null;
      files = fileInput?.files;
    }
    
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
              _suppressToast: true, // Suppress individual toast for each file
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

    // Show success message based on number of files uploaded
    const fileCount = files.length;
    toast({
      title: "Success",
      description: fileCount === 1 
        ? "1 file uploaded successfully" 
        : `${fileCount} files uploaded successfully`
    });

    setUploadFiles([]);
    setIsUploadOpen(false);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      // Store all files and trigger upload modal
      setUploadFiles(Array.from(files));
      setIsUploadOpen(true);
    }
  };

  const handleMoveItems = async () => {
    if (selectedFiles.length === 0 && selectedFolders.length === 0) return;
    const targetFolderId = selectedDestination;
    const filesCount = selectedFiles.length;
    const foldersCount = selectedFolders.length;

    // Move items
    if (selectedFiles.length > 0) {
      await moveReports.mutateAsync({ reportIds: selectedFiles, folderId: targetFolderId, suppressToast: true });
    }
    if (selectedFolders.length > 0) {
      for (const id of selectedFolders) {
        await moveFolder.mutateAsync({ id, targetParentId: targetFolderId, suppressToast: true });
      }
    }
    queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    
    // Show success message based on number of items moved
    const totalCount = filesCount + foldersCount;
    const fileText = filesCount > 0 ? `${filesCount} file${filesCount > 1 ? 's' : ''}` : '';
    const folderText = foldersCount > 0 ? `${foldersCount} folder${foldersCount > 1 ? 's' : ''}` : '';
    const andText = filesCount > 0 && foldersCount > 0 ? ' and ' : '';
    
    toast({
      title: "Moved",
      description: `${fileText}${andText}${folderText} moved successfully`
    });
    
    setSelectedFiles([]);
    setSelectedFolders([]);
    setIsMoveOpen(false);
    setIsSelectMode(false); // Exit select mode after successful move
    if (targetFolderId !== null) {
      setLocation(`/drive?folder=${targetFolderId}`);
    } else {
      // When moving to Home, redirect to Home
      setLocation('/drive');
    }
  };

  const handleBulkDelete = async () => {
    const filesCount = selectedFiles.length;
    const foldersCount = selectedFolders.length;
    setIsDeleting(true);
    
    try {
      if (selectedFiles.length > 0) {
        for (const id of selectedFiles) {
          await deleteReport.mutateAsync({ id, suppressToast: true });
        }
      }
      if (selectedFolders.length > 0) {
        for (const id of selectedFolders) {
          await deleteFolder.mutateAsync({ id, suppressToast: true });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      
      // Show success message based on number of items deleted
      const totalCount = filesCount + foldersCount;
      const fileText = filesCount > 0 ? `${filesCount} file${filesCount > 1 ? 's' : ''}` : '';
      const folderText = foldersCount > 0 ? `${foldersCount} folder${foldersCount > 1 ? 's' : ''}` : '';
      const andText = filesCount > 0 && foldersCount > 0 ? ' and ' : '';
      
      toast({
        title: "Deleted",
        description: `${fileText}${andText}${folderText} deleted successfully`
      });
      
      setSelectedFiles([]);
      setSelectedFolders([]);
      setIsBulkDeleteOpen(false);
      setIsSelectMode(false); // Exit select mode after successful delete
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkArchive = async () => {
    const foldersCount = selectedFolders.length;
    const filesCount = selectedFiles.length;
    setIsArchiving(true);
    
    try {
      if (selectedFolders.length > 0) {
        for (const id of selectedFolders) {
          await updateFolder.mutateAsync({ id, status: 'archived', suppressToast: true });
        }
      }
      if (selectedFiles.length > 0) {
        for (const id of selectedFiles) {
          await updateReport.mutateAsync({ id, status: 'archived', suppressToast: true });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      
      // Show success message based on number of items archived
      const folderText = foldersCount > 0 ? `${foldersCount} folder${foldersCount > 1 ? 's' : ''}` : '';
      const fileText = filesCount > 0 ? `${filesCount} file${filesCount > 1 ? 's' : ''}` : '';
      const andText = foldersCount > 0 && filesCount > 0 ? ' and ' : '';
      
      toast({
        title: "Archived",
        description: `${folderText}${andText}${fileText} archived successfully`
      });
      
      setSelectedFiles([]);
      setSelectedFolders([]);
      setIsBulkArchiveOpen(false);
      setIsSelectMode(false);
    } finally {
      setIsArchiving(false);
    }
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

  const handleFileClick = (fileData: string, fileName: string, fileType?: string) => {
    const blobUrl = createBlobUrl(fileData);
    
    // Check if file type can be opened in browser
    const canOpenInBrowser = fileType && [
      'application/pdf',
      'image/',
      'text/',
    ].some(type => fileType.toLowerCase().startsWith(type));
    
    if (canOpenInBrowser) {
      // Try to open in new tab - browser will handle download with proper filename
      window.open(blobUrl, '_blank');
    } else {
      // For Office files and others, use download with original filename
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
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
    let current: number | null = folderId;
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
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-primary mb-2 flex items-center gap-2">
            {isMobile ? (
              <button 
                type="button" 
                onClick={(e) => {
                  e.stopPropagation();
                  openSidebar();
                }} 
                className="p-1 hover:bg-muted rounded-md transition-colors"
                aria-label="Open menu"
              >
                <Menu className="w-8 h-8" />
              </button>
            ) : (
              <FolderOpen className="w-8 h-8" />
            )}
            My Drive
          </h1>
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
              name="drive-search"
              placeholder="Search folders and files..."
              value={driveSearchQuery}
              onChange={(e) => setDriveSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {(selectedFiles.length > 0 || selectedFolders.length > 0) && (
            <>
              <Button variant="outline" className="gap-2" onClick={() => setIsMoveOpen(true)}>
                <MoveHorizontal className="w-4 h-4" /> Move ({selectedFiles.length + selectedFolders.length})
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setIsBulkArchiveOpen(true)}>
                <Archive className="w-4 h-4" /> Archive ({selectedFiles.length + selectedFolders.length})
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
                <Button onClick={handleCreateFolder} disabled={createFolder.isPending}>
                  {createFolder.isPending ? "Creating..." : "Create"}
                </Button>
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
                <div 
                  className={`py-8 text-center border-2 border-dashed rounded-xl transition-colors ${isDragging ? 'border-primary bg-primary/10' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <Input type="file" name="files" className="hidden" id="file-upload-multiple" multiple onChange={(e) => setUploadFiles(e.target.files ? Array.from(e.target.files) : [])} />
                  <Label htmlFor="file-upload-multiple" className="cursor-pointer">
                    <UploadCloud className="w-10 h-10 mx-auto mb-2" />
                    <span>{uploadFiles.length > 0 ? `${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''} selected` : "Click to select or drag and drop"}</span>
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleUpload} disabled={createReport.isPending || uploadFiles.length === 0}>
                  {createReport.isPending ? "Uploading..." : "Upload"}
                </Button>
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
          <DialogFooter><Button onClick={handleRenameFile} disabled={updateReport.isPending}>{updateReport.isPending ? 'Renaming...' : 'Rename'}</Button></DialogFooter>
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
          <DialogFooter><Button onClick={handleRenameFolder} disabled={renameFolder.isPending}>{renameFolder.isPending ? 'Renaming...' : 'Rename'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMoveOpen} onOpenChange={(open) => {
        setIsMoveOpen(open);
        if (open) {
          // Set initial navigation to current folder (or root if at home)
          setCurrentNavigationFolder(currentFolderId);
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
                  name="move-search"
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
                    <div className="mb-2 p-2 bg-muted/30 rounded text-sm flex items-center gap-2">
                      <button
                        onClick={() => selectDestination(null)}
                        className={`text-primary hover:underline ${selectedDestination === null ? 'font-bold' : ''}`}
                        title="Click to select Home as destination"
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
                (selectedDestination === null && !destinationSelected) || // No destination selected
                selectedDestination === currentFolderId || // Trying to move to the same folder
                (selectedDestination === null && currentFolderId === null && destinationSelected) || // Trying to move to Home when already at Home
                selectedFolders.includes(selectedDestination || 0) || // Selected destination is being moved
                selectedFolders.some(id => isDescendant(selectedDestination, id)) || // Selected destination is a descendant of moved folders
                (selectedFolders.length > 0 && selectedDestination === (allFoldersData?.find(f => f.id === selectedFolders[0])?.parentId ?? null)) || // Selected destination is the current parent
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
                  setIsDeleting(true);
                  deleteFolder.mutate({ id: deleteFolderId }, {
                    onSuccess: () => {
                      setDeleteFolderId(null);
                      setIsDeleting(false);
                    },
                    onError: () => setIsDeleting(false)
                  });
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
                  deleteReport.mutate({ id: deleteFileId }, {
                    onSuccess: () => {
                      setDeleteFileId(null);
                      setIsDeleting(false);
                    },
                    onError: () => setIsDeleting(false)
                  });
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

      {/* Bulk Archive Confirmation Dialog */}
      <AlertDialog open={isBulkArchiveOpen} onOpenChange={setIsBulkArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Items</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive {selectedFiles.length + selectedFolders.length} item{(selectedFiles.length + selectedFolders.length) > 1 ? 's' : ''}? They will be moved to the archives and can be restored later.
              {selectedFolders.length > 0 && " This will also archive all files and subfolders inside the selected folders."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkArchive} disabled={isArchiving}>
              {isArchiving ? "Archiving..." : "Archive"}
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
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!archiveFolderId} onOpenChange={() => setArchiveFolderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this folder? It will be moved to the archives and can be restored later.
              All files and subfolders inside will also be archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (archiveFolderId) {
                  setIsArchiving(true);
                  updateFolder.mutate({ id: archiveFolderId, status: 'archived' }, {
                    onSuccess: () => {
                      toast({ title: "Archived", description: "Folder archived successfully" });
                      setArchiveFolderId(null);
                      setIsArchiving(false);
                    },
                    onError: () => setIsArchiving(false)
                  });
                }
              }}
              disabled={isArchiving}
            >
              {isArchiving ? "Archiving..." : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!archiveFileId} onOpenChange={() => setArchiveFileId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this file? It will be moved to the archives and can be restored later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (archiveFileId) {
                  setIsArchiving(true);
                  updateReport.mutate({ id: archiveFileId, status: 'archived' }, {
                    onSuccess: () => {
                      toast({ title: "Archived", description: "File archived successfully" });
                      setArchiveFileId(null);
                      setIsArchiving(false);
                    },
                    onError: () => setIsArchiving(false)
                  });
                }
              }}
              disabled={isArchiving}
            >
              {isArchiving ? "Archiving..." : "Archive"}
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
              2. Inside a folder - only if there are subfolders
          */}
          {(currentFolderId === null || (filteredFolders && filteredFolders.length > 0)) && (
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
                    <div key={f.id} className={`relative p-4 rounded-xl border group ${selectedFolders.includes(f.id) ? "border-primary" : "border-border"}`}>
                      {isSelectMode && <Checkbox className="absolute top-2 left-2 z-10" checked={selectedFolders.includes(f.id)} onCheckedChange={() => toggleFolderSelection(f.id)} />}
                      <div onClick={() => isSelectMode ? toggleFolderSelection(f.id) : handleFolderClick(f.id)} className="flex items-center gap-3 pt-4 cursor-pointer">
                        <FolderIcon className="w-10 h-10 text-secondary flex-shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </div>
                      <div className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => {setRenameId(f.id); setRenameName(f.name); setIsRenameOpen(true);}}>Rename</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {setSelectedFolders([f.id]); setSelectedFiles([]); setIsSelectMode(true); setIsMoveOpen(true);}}>Move</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setArchiveFolderId(f.id)}>Archive</DropdownMenuItem>
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
          )}

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
            {reports && reports.length > 0 ? (
              <div className="bg-card rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      {isSelectMode && <th className="px-6 py-3 w-[40px]"><Checkbox checked={selectedFiles.length === filteredReports.length} onCheckedChange={(c) => setSelectedFiles(c ? filteredReports.map(r => r.id) : [])} /></th>}
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
                              <DropdownMenuCheckboxItem
                                checked={nameFilter.includes('0-9')}
                                onCheckedChange={() => {
                                  if (nameFilter.includes('0-9')) {
                                    setNameFilter(nameFilter.filter(f => f !== '0-9'));
                                  } else {
                                    setNameFilter([...nameFilter, '0-9']);
                                  }
                                }}
                              >
                                0-9
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                checked={nameFilter.includes('A-H')}
                                onCheckedChange={() => {
                                  if (nameFilter.includes('A-H')) {
                                    setNameFilter(nameFilter.filter(f => f !== 'A-H'));
                                  } else {
                                    setNameFilter([...nameFilter, 'A-H']);
                                  }
                                }}
                              >
                                A-H
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                checked={nameFilter.includes('I-P')}
                                onCheckedChange={() => {
                                  if (nameFilter.includes('I-P')) {
                                    setNameFilter(nameFilter.filter(f => f !== 'I-P'));
                                  } else {
                                    setNameFilter([...nameFilter, 'I-P']);
                                  }
                                }}
                              >
                                I-P
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                checked={nameFilter.includes('Q-Z')}
                                onCheckedChange={() => {
                                  if (nameFilter.includes('Q-Z')) {
                                    setNameFilter(nameFilter.filter(f => f !== 'Q-Z'));
                                  } else {
                                    setNameFilter([...nameFilter, 'Q-Z']);
                                  }
                                }}
                              >
                                Q-Z
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                checked={nameFilter.includes('Other')}
                                onCheckedChange={() => {
                                  if (nameFilter.includes('Other')) {
                                    setNameFilter(nameFilter.filter(f => f !== 'Other'));
                                  } else {
                                    setNameFilter([...nameFilter, 'Other']);
                                  }
                                }}
                              >
                                Other
                              </DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left w-[20%] hidden md:table-cell">
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
                              <DropdownMenuCheckboxItem
                                checked={dateFilter.includes('A long time ago')}
                                onCheckedChange={() => {
                                  if (dateFilter.includes('A long time ago')) {
                                    setDateFilter(dateFilter.filter(f => f !== 'A long time ago'));
                                  } else {
                                    setDateFilter([...dateFilter, 'A long time ago']);
                                  }
                                }}
                              >
                                A long time ago
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                checked={dateFilter.includes('Last month')}
                                onCheckedChange={() => {
                                  if (dateFilter.includes('Last month')) {
                                    setDateFilter(dateFilter.filter(f => f !== 'Last month'));
                                  } else {
                                    setDateFilter([...dateFilter, 'Last month']);
                                  }
                                }}
                              >
                                Last month
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                checked={dateFilter.includes('Earlier this month')}
                                onCheckedChange={() => {
                                  if (dateFilter.includes('Earlier this month')) {
                                    setDateFilter(dateFilter.filter(f => f !== 'Earlier this month'));
                                  } else {
                                    setDateFilter([...dateFilter, 'Earlier this month']);
                                  }
                                }}
                              >
                                Earlier this month
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                checked={dateFilter.includes('Last week')}
                                onCheckedChange={() => {
                                  if (dateFilter.includes('Last week')) {
                                    setDateFilter(dateFilter.filter(f => f !== 'Last week'));
                                  } else {
                                    setDateFilter([...dateFilter, 'Last week']);
                                  }
                                }}
                              >
                                Last week
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                checked={dateFilter.includes('Earlier this week')}
                                onCheckedChange={() => {
                                  if (dateFilter.includes('Earlier this week')) {
                                    setDateFilter(dateFilter.filter(f => f !== 'Earlier this week'));
                                  } else {
                                    setDateFilter([...dateFilter, 'Earlier this week']);
                                  }
                                }}
                              >
                                Earlier this week
                              </DropdownMenuCheckboxItem>
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
                                  onCheckedChange={() => {
                                    if (typeFilter.includes(type)) {
                                      setTypeFilter(typeFilter.filter(f => f !== type));
                                    } else {
                                      setTypeFilter([...typeFilter, type]);
                                    }
                                  }}
                                >
                                  {getFileExtension(type)}
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
                              <DropdownMenuCheckboxItem
                                checked={sizeFilter.includes('tiny')}
                                onCheckedChange={() => {
                                  if (sizeFilter.includes('tiny')) {
                                    setSizeFilter(sizeFilter.filter(f => f !== 'tiny'));
                                  } else {
                                    setSizeFilter([...sizeFilter, 'tiny']);
                                  }
                                }}
                              >
                                Tiny (&lt;10 KB)
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                checked={sizeFilter.includes('small')}
                                onCheckedChange={() => {
                                  if (sizeFilter.includes('small')) {
                                    setSizeFilter(sizeFilter.filter(f => f !== 'small'));
                                  } else {
                                    setSizeFilter([...sizeFilter, 'small']);
                                  }
                                }}
                              >
                                Small (10-100 KB)
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                checked={sizeFilter.includes('medium')}
                                onCheckedChange={() => {
                                  if (sizeFilter.includes('medium')) {
                                    setSizeFilter(sizeFilter.filter(f => f !== 'medium'));
                                  } else {
                                    setSizeFilter([...sizeFilter, 'medium']);
                                  }
                                }}
                              >
                                Medium (100 KB - 1 MB)
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                checked={sizeFilter.includes('large')}
                                onCheckedChange={() => {
                                  if (sizeFilter.includes('large')) {
                                    setSizeFilter(sizeFilter.filter(f => f !== 'large'));
                                  } else {
                                    setSizeFilter([...sizeFilter, 'large']);
                                  }
                                }}
                              >
                                Large (1-10 MB)
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                checked={sizeFilter.includes('huge')}
                                onCheckedChange={() => {
                                  if (sizeFilter.includes('huge')) {
                                    setSizeFilter(sizeFilter.filter(f => f !== 'huge'));
                                  } else {
                                    setSizeFilter([...sizeFilter, 'huge']);
                                  }
                                }}
                              >
                                Huge (&gt;10 MB)
                              </DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </th>
                      <th className="px-6 py-3 w-[50px]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredReports?.map(r => (
                        <tr 
                          key={r.id} 
                          className="hover:bg-muted/20 group cursor-pointer md:cursor-auto relative"
                          onClick={(e) => {
                            if (!isSelectMode) {
                              if (isMobile !== false) {
                                e.stopPropagation();
                                setSelectedFileForDialog(r);
                                setIsFileDialogOpen(true);
                              } else if (r.fileData) {
                                handleFileClick(r.fileData, r.fileName, r.fileType);
                              }
                            }
                          }}
                        >
                        {isSelectMode && <td className="px-6 py-4"><Checkbox checked={selectedFiles.includes(r.id)} onCheckedChange={() => toggleFileSelection(r.id)} /></td>}
                        <td className="px-6 py-4 w-[40%] min-w-0">
                          <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4 flex-shrink-0" />
                            {isSelectMode ? (
                              <span onClick={(e) => { e.stopPropagation(); toggleFileSelection(r.id); }} className="cursor-pointer hover:text-primary truncate">{r.fileName}</span>
                            ) : (
                              <span className="cursor-pointer hover:text-primary truncate">{r.fileName}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 w-[20%] text-muted-foreground hidden md:table-cell">
                          {r.createdAt ? format(new Date(r.createdAt), 'MMM d, yyyy') : '-'}
                        </td>
                        <td className="px-6 py-4 w-[20%] text-muted-foreground hidden md:table-cell">
                          {r.fileType ? getFileExtension(r.fileType) : '-'}
                        </td>
                        <td className="px-6 py-4 w-[20%] text-right text-muted-foreground hidden md:table-cell">{(r.fileSize / 1024).toFixed(1)} KB</td>
                        <td className="px-6 py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 md:relative"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRenameFileId(r.id); setRenameFileName(r.fileName); setIsRenameFileOpen(true);}}>Rename</DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedFiles([r.id]); setSelectedFolders([]); setIsSelectMode(true); setIsMoveOpen(true);}}>Move</DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setArchiveFileId(r.id);}}>Archive</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteFileId(r.id);}}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredReports && filteredReports.length === 0 && (
                  <div className="text-center py-12 border-t">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                      <FolderOpen className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No files found</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-20 border-2 border-dashed rounded-xl">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground">No files</h3>
                <p className="text-muted-foreground">Upload or create your first file to get started.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Mobile File Details Dialog - Only show on mobile */}
      <Dialog open={isFileDialogOpen && isMobile !== false} onOpenChange={setIsFileDialogOpen}>
        <DialogContent className="rounded-lg sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-start gap-2 pr-8 text-left">
              <FileText className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span className="break-all">{selectedFileForDialog?.fileName}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              File details and download option
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">{selectedFileForDialog?.fileType ? getFileExtension(selectedFileForDialog.fileType) : '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Size</span>
              <span className="font-medium">{selectedFileForDialog ? (selectedFileForDialog.fileSize / 1024).toFixed(1) : '-'} KB</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">{selectedFileForDialog?.createdAt ? format(new Date(selectedFileForDialog.createdAt), 'MMM d, yyyy') : '-'}</span>
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button 
              variant="default" 
              className="w-full sm:w-auto"
              onClick={() => {
                if (selectedFileForDialog?.fileData) {
                  handleFileClick(selectedFileForDialog.fileData, selectedFileForDialog.fileName, selectedFileForDialog.fileType);
                  setIsFileDialogOpen(false);
                }
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
