import { useState } from "react";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { useFolders, useCreateFolder, useDeleteFolder, useRenameFolder } from "@/hooks/use-folders";
import { useReports, useCreateReport, useDeleteReport, useMoveReports } from "@/hooks/use-reports";
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
  MoveHorizontal
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useLocation } from "wouter";
import { InsertReport } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

export default function DrivePage() {
  const [location, setLocation] = useLocation();
  
  const searchParams = new URLSearchParams(window.location.search);
  const currentFolderId = searchParams.get("folder") ? parseInt(searchParams.get("folder")!) : null;

  const { data: allFoldersData } = useFolders(); 
  const { data: currentFolder } = useFolders(currentFolderId);
  const folders = currentFolderId ? allFoldersData?.filter(f => f.parentId === currentFolderId) : allFoldersData?.filter(f => !f.parentId);
  const { data: reports, isLoading: reportsLoading } = useReports(currentFolderId || "root");
  
  const foldersLoading = !allFoldersData;
  
  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();
  const renameFolder = useRenameFolder();
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
  const [renameType, setRenameType] = useState<"folder" | "file">("folder");

  const [isRenameFileOpen, setIsRenameFileOpen] = useState(false);
  const [renameFileId, setRenameFileId] = useState<number | null>(null);
  const [renameFileName, setRenameFileName] = useState("");

  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [moveToFolderId, setMoveToFolderId] = useState<string>("root");

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
    const fileInput = document.getElementById("file-upload-multiple") as HTMLInputElement;
    const files = fileInput?.files;
    if (!files || files.length === 0) return;

    const targetFolderId = moveToFolderId === "root" ? null : parseInt(moveToFolderId);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      await new Promise((resolve) => {
        reader.onload = async () => {
          const base64 = reader.result as string;
          await createReport.mutateAsync({
            title: file.name,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            fileData: base64,
            folderId: targetFolderId,
            description: "Uploaded file",
            year: new Date().getFullYear(),
            month: new Date().getMonth() + 1,
          });
          resolve(null);
        };
        reader.readAsDataURL(file);
      });
    }
    setUploadFile(null);
    setIsUploadOpen(false);
  };

  const handleMoveFiles = async () => {
    if (selectedFiles.length === 0) return;
    await moveReports.mutateAsync({
      reportIds: selectedFiles,
      folderId: moveToFolderId === "root" ? null : parseInt(moveToFolderId)
    });
    setSelectedFiles([]);
    setIsMoveOpen(false);
  };

  const toggleFileSelection = (fileId: number) => {
    setSelectedFiles(prev => 
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
  };

  const isLoading = foldersLoading || reportsLoading;

  return (
    <LayoutWrapper>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => {
                if (currentFolderId) {
                  const parent = allFoldersData?.find(f => f.id === currentFolderId)?.parentId;
                  setLocation(parent ? `/drive?folder=${parent}` : "/drive");
                } else {
                  window.history.back();
                }
              }}
              className="h-8 w-8"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-3xl font-display font-bold text-primary">My Drive</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/drive" className={`hover:text-primary flex items-center gap-1 transition-colors ${!currentFolderId ? "font-medium text-foreground underline" : ""}`}>
              <Home className="w-4 h-4" /> Home
            </Link>
            {currentFolderId && (
              <>
                <ChevronRight className="w-4 h-4" />
                <span className="font-medium text-foreground">
                  {allFoldersData?.find(f => f.id === currentFolderId)?.name || "Current Folder"}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {selectedFiles.length > 0 && (
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => setIsMoveOpen(true)}
            >
              <MoveHorizontal className="w-4 h-4" /> Move ({selectedFiles.length})
            </Button>
          )}

          <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 border-primary/20 text-primary hover:bg-primary/5">
                <Plus className="w-4 h-4" /> New Folder
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Folder</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="name" className="mb-2 block">Folder Name</Label>
                <Input 
                  id="name" 
                  value={newFolderName} 
                  onChange={(e) => setNewFolderName(e.target.value)} 
                  placeholder="e.g. Monthly Reports"
                />
              </div>
              <DialogFooter>
                <Button onClick={handleCreateFolder} disabled={createFolder.isPending}>
                  {createFolder.isPending ? "Creating..." : "Create Folder"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90">
                <UploadCloud className="w-4 h-4" /> Upload Files
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Files</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="py-8 text-center border-2 border-dashed border-muted-foreground/20 rounded-xl hover:bg-muted/50 transition-colors">
                  <Input 
                    type="file" 
                    className="hidden" 
                    id="file-upload-multiple"
                    multiple
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  />
                  <Label htmlFor="file-upload-multiple" className="cursor-pointer block w-full h-full">
                    <div className="flex flex-col items-center gap-2">
                      <UploadCloud className="w-10 h-10 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {uploadFile ? `Selected ${document.getElementById("file-upload-multiple")?.files?.length} files` : "Click to select files"}
                      </span>
                    </div>
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label>Destination Folder (Optional)</Label>
                  <Select value={moveToFolderId} onValueChange={setMoveToFolderId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="root">Home / Root</SelectItem>
                      {allFoldersData?.map(folder => (
                        <SelectItem key={folder.id} value={folder.id.toString()}>
                          {folder.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleUpload} disabled={createReport.isPending}>
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
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="rename-file-name" className="mb-2 block">New Name</Label>
            <Input 
              id="rename-file-name" 
              value={renameFileName} 
              onChange={(e) => setRenameFileName(e.target.value)} 
            />
          </div>
          <DialogFooter>
            <Button onClick={handleRenameFile}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="rename-name" className="mb-2 block">New Name</Label>
            <Input 
              id="rename-name" 
              value={renameName} 
              onChange={(e) => setRenameName(e.target.value)} 
            />
          </div>
          <DialogFooter>
            <Button onClick={handleRenameFolder} disabled={renameFolder.isPending}>
              {renameFolder.isPending ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMoveOpen} onOpenChange={setIsMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Files</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label className="mb-2 block">Select Destination Folder</Label>
            <Select value={moveToFolderId} onValueChange={setMoveToFolderId}>
              <SelectTrigger>
                <SelectValue placeholder="Select folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Home / Root</SelectItem>
                {allFoldersData?.filter(f => f.id !== currentFolderId).map(folder => (
                  <SelectItem key={folder.id} value={folder.id.toString()}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button onClick={handleMoveFiles} disabled={moveReports.isPending}>
              {moveReports.isPending ? "Moving..." : "Move Files"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-500">
          {folders && folders.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Folders</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {folders.map((folder) => (
                  <div 
                    key={folder.id}
                    className="group relative bg-white p-4 rounded-xl border border-border hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer"
                  >
                    <div 
                      className="flex items-center gap-3 mb-2"
                      onClick={() => setLocation(`/drive?folder=${folder.id}`)}
                    >
                      <FolderIcon className="w-10 h-10 text-secondary fill-secondary/20" />
                      <span className="font-medium truncate flex-1">{folder.name}</span>
                    </div>
                    
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setRenameId(folder.id);
                            setRenameName(folder.name);
                            setIsRenameOpen(true);
                          }}>
                            <Edit2 className="w-4 h-4 mr-2" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteFolder.mutate(folder.id)}>
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Files</h2>
            {reports && reports.length > 0 ? (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                    <tr>
                      <th className="px-6 py-3 w-[40px]">
                        <Checkbox 
                          checked={selectedFiles.length === (reports?.length || 0)}
                          onCheckedChange={(checked) => {
                            setSelectedFiles(checked ? (reports?.map(r => r.id) || []) : []);
                          }}
                        />
                      </th>
                      <th className="px-6 py-3">Name</th>
                      <th className="px-6 py-3 hidden md:table-cell">Uploaded By</th>
                      <th className="px-6 py-3 hidden md:table-cell">Date</th>
                      <th className="px-6 py-3 text-right">Size</th>
                      <th className="px-6 py-3 w-[50px]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {reports.map((file) => (
                      <tr key={file.id} className="hover:bg-muted/20 transition-colors group">
                        <td className="px-6 py-4">
                          <Checkbox 
                            checked={selectedFiles.includes(file.id)}
                            onCheckedChange={() => toggleFileSelection(file.id)}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                              <FileText className="w-4 h-4" />
                            </div>
                            <span className="font-medium">{file.fileName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell text-muted-foreground">User #{file.uploadedBy}</td>
                        <td className="px-6 py-4 hidden md:table-cell text-muted-foreground">
                          {file.createdAt ? new Date(file.createdAt).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-6 py-4 text-right text-muted-foreground">
                          {(file.fileSize / 1024).toFixed(1)} KB
                        </td>
                        <td className="px-6 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                setRenameFileId(file.id);
                                setRenameFileName(file.fileName);
                                setIsRenameFileOpen(true);
                              }}>
                                <Edit2 className="w-4 h-4 mr-2" /> Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteReport.mutate(file.id)}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed rounded-xl">
                <p className="text-muted-foreground">No files in this folder.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </LayoutWrapper>
  );
}
