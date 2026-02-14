import { useState, useEffect } from "react";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { useFolders, useCreateFolder, useDeleteFolder, useRenameFolder, useMoveFolder } from "@/hooks/use-folders";
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
import { queryClient } from "@/lib/queryClient";

export default function DrivePage() {
  const [location, setLocation] = useLocation();
  
  const searchParams = new URLSearchParams(window.location.search);
  const currentFolderId = searchParams.get("folder") ? parseInt(searchParams.get("folder")!) : null;

  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<number[]>([]);

  // Reset selection on navigation
  useEffect(() => {
    setSelectedFiles([]);
    setSelectedFolders([]);
  }, [currentFolderId]);

  const { data: currentFolders } = useFolders(currentFolderId);
  const { data: reports, isLoading: reportsLoading } = useReports(currentFolderId === null ? "root" : currentFolderId);
  
  const foldersLoading = !currentFolders;
  const isLoading = foldersLoading || reportsLoading;

  // Sync navigation on folder click
  const handleFolderClick = (id: number) => {
    navigate(`/drive?folder=${id}`);
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
    const targetParentId = !currentFolderId 
      ? (moveToFolderId === "root" ? null : parseInt(moveToFolderId)) 
      : currentFolderId;

    await createFolder.mutateAsync({
      name: newFolderName,
      parentId: targetParentId,
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

    const targetFolderId = !currentFolderId 
      ? (moveToFolderId === "root" ? null : parseInt(moveToFolderId)) 
      : currentFolderId;

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

  const handleMoveItems = async () => {
    if (selectedFiles.length === 0 && selectedFolders.length === 0) return;
    const targetFolderId = moveToFolderId === "root" ? null : parseInt(moveToFolderId);
    
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

  const navigate = (path: string) => {
    setLocation(path);
  };

  return (
    <LayoutWrapper>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary mb-2">My Drive</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <button onClick={() => navigate("/drive")} className={`hover:text-primary flex items-center gap-1 transition-colors ${!currentFolderId ? "font-medium text-foreground" : ""}`}>
              <Home className="w-4 h-4" /> Home
            </button>
            {breadcrumbs.map((crumb) => (
              <div key={crumb.id} className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4" />
                <button 
                  onClick={() => navigate(`/drive?folder=${crumb.id}`)}
                  className={`hover:text-primary transition-colors ${crumb.id === currentFolderId ? "font-medium text-foreground" : ""}`}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {(selectedFiles.length > 0 || selectedFolders.length > 0) && (
            <Button variant="outline" className="gap-2" onClick={() => setIsMoveOpen(true)}>
              <MoveHorizontal className="w-4 h-4" /> Move ({selectedFiles.length + selectedFolders.length})
            </Button>
          )}

          <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Plus className="w-4 h-4" /> New Folder
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create New Folder</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Folder Name</Label>
                  <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
                </div>
                {!currentFolderId && (
                  <div className="space-y-2">
                    <Label>Location</Label>
                    <Select 
                      value={moveToFolderId === "root" ? "root" : moveToFolderId} 
                      onValueChange={setMoveToFolderId}
                    >
                      <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="root">Home</SelectItem>
                        {allFoldersData?.map(f => (
                          <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
              <DialogHeader><DialogTitle>Upload Files</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {!currentFolderId && (
                  <div className="space-y-2">
                    <Label>Target Folder</Label>
                    <Select 
                      value={moveToFolderId === "root" ? "root" : moveToFolderId} 
                      onValueChange={setMoveToFolderId}
                    >
                      <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="root">Home</SelectItem>
                        {allFoldersData?.map(f => (
                          <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="py-8 text-center border-2 border-dashed rounded-xl">
                  <Input type="file" className="hidden" id="file-upload-multiple" multiple onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
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
          <DialogHeader><DialogTitle>Rename File</DialogTitle></DialogHeader>
          <Input value={renameFileName} onChange={(e) => setRenameFileName(e.target.value)} />
          <DialogFooter><Button onClick={handleRenameFile}>Rename</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename Folder</DialogTitle></DialogHeader>
          <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} />
          <DialogFooter><Button onClick={handleRenameFolder}>Rename</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMoveOpen} onOpenChange={setIsMoveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Move Items</DialogTitle></DialogHeader>
          <Select value={moveToFolderId} onValueChange={setMoveToFolderId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Home</SelectItem>
              {allFoldersData?.filter(f => f.id !== currentFolderId && !selectedFolders.includes(f.id)).map(f => (
                <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter><Button onClick={handleMoveItems}>Move</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-semibold mb-4">Folders</h2>
            {currentFolders && currentFolders.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {currentFolders.map(f => (
                  <div key={f.id} className={`relative p-4 rounded-xl border ${selectedFolders.includes(f.id) ? "border-primary" : "border-border"}`}>
                    <Checkbox className="absolute top-2 left-2" checked={selectedFolders.includes(f.id)} onCheckedChange={() => toggleFolderSelection(f.id)} />
                    <div onClick={() => handleFolderClick(f.id)} className="flex items-center gap-3 pt-4 cursor-pointer">
                      <FolderIcon className="w-10 h-10 text-secondary" />
                      <span className="truncate">{f.name}</span>
                    </div>
                    <div className="absolute top-2 right-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => {setRenameId(f.id); setRenameName(f.name); setIsRenameOpen(true);}}>Rename</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => deleteFolder.mutate(f.id)}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">No folders found</p>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-4">Files</h2>
            {reports && reports.length > 0 ? (
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-6 py-3 w-[40px]"><Checkbox checked={selectedFiles.length === reports.length} onCheckedChange={(c) => setSelectedFiles(c ? reports.map(r => r.id) : [])} /></th>
                      <th className="px-6 py-3">Name</th>
                      <th className="px-6 py-3 text-right">Size</th>
                      <th className="px-6 py-3 w-[50px]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {reports.map(r => (
                      <tr key={r.id} className="hover:bg-muted/20 group">
                        <td className="px-6 py-4"><Checkbox checked={selectedFiles.includes(r.id)} onCheckedChange={() => toggleFileSelection(r.id)} /></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4" />
                            <a href={r.fileData || undefined} target="_blank" rel="noopener noreferrer" download={r.fileName} className="hover:text-primary">{r.fileName}</a>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">{(r.fileSize / 1024).toFixed(1)} KB</td>
                        <td className="px-6 py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => {setRenameFileId(r.id); setRenameFileName(r.fileName); setIsRenameFileOpen(true);}}>Rename</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => deleteReport.mutate(r.id)}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">Empty</p>}
          </section>
        </div>
      )}
    </LayoutWrapper>
  );
}
