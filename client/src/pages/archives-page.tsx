import { LayoutWrapper } from "@/components/layout-wrapper";
import { useReports, useUpdateReport, useDeleteReport } from "@/hooks/use-reports";
import { FileText, RotateCcw, Trash2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function ArchivesPage() {
  const { data: archivedFiles, isLoading } = useReports(undefined, 'archived');
  const restoreReport = useUpdateReport();
  const deleteReport = useDeleteReport();
  const { toast } = useToast();

  const handleRestore = (id: number) => {
    restoreReport.mutate({ id, status: 'active' });
    toast({ title: "Restored", description: "File moved back to drive" });
  };

  return (
    <LayoutWrapper>
      <header className="mb-8">
        <h1 className="text-3xl font-display font-bold text-primary mb-2 flex items-center gap-2">
          <Archive className="w-8 h-8" /> Archives
        </h1>
        <p className="text-muted-foreground">View and manage archived documents.</p>
      </header>

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-muted rounded-lg" />
          <div className="h-12 bg-muted rounded-lg" />
          <div className="h-12 bg-muted rounded-lg" />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {archivedFiles && archivedFiles.length > 0 ? (
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                <tr>
                  <th className="px-6 py-3">File Name</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Size</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {archivedFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 font-medium flex items-center gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      {file.fileName}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground uppercase text-xs">{file.fileType.split('/')[1] || 'FILE'}</td>
                    <td className="px-6 py-4 text-muted-foreground">{(file.fileSize / 1024).toFixed(1)} KB</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 gap-2 border-primary/20 text-primary hover:bg-primary/5"
                          onClick={() => handleRestore(file.id)}
                        >
                          <RotateCcw className="w-3 h-3" /> Restore
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          className="h-8 gap-2"
                          onClick={() => deleteReport.mutate(file.id)}
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Archive className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground">No archived files</h3>
              <p className="text-muted-foreground">Archived documents will appear here.</p>
            </div>
          )}
        </div>
      )}
    </LayoutWrapper>
  );
}
