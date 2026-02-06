import { useState } from "react";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { useFolders, useCreateFolder, useDeleteFolder } from "@/hooks/use-folders";
import { useReports, useCreateReport, useDeleteReport } from "@/hooks/use-reports";
import { 
  Folder as FolderIcon, 
  FileText, 
  MoreVertical, 
  Plus, 
  Trash2, 
  ChevronRight, 
  Home,
  UploadCloud,
  Loader2
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation } from "wouter";
import { InsertReport } from "@shared/schema";

export default function DrivePage() {
  const [location, setLocation] = useLocation();
  
  // Parse parentId from query param: /drive?folder=123
  const searchParams = new URLSearchParams(window.location.search);
  const currentFolderId = searchParams.get("folder") ? parseInt(searchParams.get("folder")!) : null;

  const { data: folders, isLoading: foldersLoading } = useFolders(currentFolderId);
  const { data: reports, isLoading: reportsLoading } = useReports(currentFolderId || undefined);
  
  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();
  const createReport = useCreateReport();
  const deleteReport = useDeleteReport();

  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder.mutateAsync({
      name: newFolderName,
      parentId: currentFolderId,
    });
    setNewFolderName("");
    setIsNewFolderOpen(false);
  };

  const handleUpload = async () => {
    if (!uploadFile) return;

    // Convert file to Base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      await createReport.mutateAsync({
        title: uploadFile.name,
        fileName: uploadFile.name,
        fileType: uploadFile.type,
        fileSize: uploadFile.size,
        fileData: base64,
        folderId: currentFolderId,
        description: "Uploaded file",
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
      });
      setUploadFile(null);
      setIsUploadOpen(false);
    };
    reader.readAsDataURL(uploadFile);
  };

  const isLoading = foldersLoading || reportsLoading;

  return (
    <LayoutWrapper>
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary mb-2">My Drive</h1>
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/drive" className="hover:text-primary flex items-center gap-1 transition-colors">
              <Home className="w-4 h-4" /> Home
            </Link>
            {currentFolderId && (
              <>
                <ChevronRight className="w-4 h-4" />
                <span className="font-medium text-foreground">Current Folder</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
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
                <UploadCloud className="w-4 h-4" /> Upload File
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload File</DialogTitle>
              </DialogHeader>
              <div className="py-8 text-center border-2 border-dashed border-muted-foreground/20 rounded-xl hover:bg-muted/50 transition-colors">
                <Input 
                  type="file" 
                  className="hidden" 
                  id="file-upload"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
                <Label htmlFor="file-upload" className="cursor-pointer block w-full h-full">
                  <div className="flex flex-col items-center gap-2">
                    <UploadCloud className="w-10 h-10 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {uploadFile ? uploadFile.name : "Click to select file"}
                    </span>
                  </div>
                </Label>
              </div>
              <DialogFooter>
                <Button onClick={handleUpload} disabled={!uploadFile || createReport.isPending}>
                  {createReport.isPending ? "Uploading..." : "Upload"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-500">
          
          {/* Folders Section */}
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

          {/* Files Section */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Files</h2>
            {reports && reports.length > 0 ? (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                    <tr>
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
