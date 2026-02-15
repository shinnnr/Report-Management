import { useState, useEffect } from "react";
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
  Search,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Link, useLocation, useSearch } from "wouter";
import { queryClient } from "@/lib/queryClient";

export default function ArchivesPage() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const search = useSearch();

  const searchParams = new URLSearchParams(search);
  const currentFolderId = searchParams.get("folder") ? parseInt(searchParams.get("folder")!) : null;

  const [archivesSearchQuery, setArchivesSearchQuery] = useState("");

  const { data: currentArchivedFolders } = useFolders(currentFolderId, 'archived');
  const { data: allArchivedFolders } = useFolders('all', 'archived');
  const { data: archivedReports, isLoading: reportsLoading } = useReports(currentFolderId === null ? "root" : currentFolderId, 'archived');
  const { toast } = useToast();

  const foldersLoading = !currentArchivedFolders;
  const isLoading = foldersLoading || reportsLoading;

  const filteredArchivedFolders = currentArchivedFolders?.filter(f => f.name.toLowerCase().includes(archivesSearchQuery.toLowerCase())) || [];
  const filteredArchivedReports = archivedReports?.filter(r => r.title.toLowerCase().includes(archivesSearchQuery.toLowerCase()) || r.fileName.toLowerCase().includes(archivesSearchQuery.toLowerCase())) || [];

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

  const handleRestoreFolder = (id: number) => {
    updateFolder.mutate({ id, status: 'active' }, {
      onSuccess: () => {
        toast({ title: "Restored", description: "Folder restored successfully" });
      }
    });
  };

  const handleRestoreFile = (id: number) => {
    updateReport.mutate({ id, status: 'active' }, {
      onSuccess: () => {
        toast({ title: "Restored", description: "File restored successfully" });
      }
    });
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
              placeholder="Search archived folders and files..."
              value={archivesSearchQuery}
              onChange={(e) => setArchivesSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </div>

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

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
          <section>
            <h2 className="text-sm font-semibold mb-4">Archived Folders</h2>
            {filteredArchivedFolders && filteredArchivedFolders.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredArchivedFolders.map(f => (
                  <div key={f.id} className="relative p-4 rounded-xl border border-border">
                    <div onClick={() => handleFolderClick(f.id)} className="flex items-center gap-3 pt-4 cursor-pointer">
                      <FolderIcon className="w-10 h-10 text-secondary" />
                      <span className="truncate">{f.name}</span>
                    </div>
                    <div className="absolute top-2 right-2">
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
              <div className="text-center py-20 border-2 border-dashed rounded-xl">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <FolderIcon className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground">No archived folders</h3>
                <p className="text-muted-foreground">Archived folders will appear here.</p>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-4">Archived Files</h2>
            {filteredArchivedReports && filteredArchivedReports.length > 0 ? (
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-6 py-3">Name</th>
                      <th className="px-6 py-3 text-right">Size</th>
                      <th className="px-6 py-3 w-[50px]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredArchivedReports.map(r => (
                      <tr key={r.id} className="hover:bg-muted/20 group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4" />
                            <span onClick={() => r.fileData && handleFileClick(r.fileData, r.fileName)} className="cursor-pointer hover:text-primary">{r.fileName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">{(r.fileSize / 1024).toFixed(1)} KB</td>
                        <td className="px-6 py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
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
