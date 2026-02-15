import { useRef } from "react";
import { useCreateReport } from "@/hooks/use-reports";
import { ModalWrapper } from "@/components/modal-wrapper";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UploadCloud, Loader2 } from "lucide-react";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFolderId: number | null;
  triggerRef?: React.RefObject<HTMLElement>;
}

export function UploadModal({ isOpen, onClose, currentFolderId, triggerRef }: UploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createReport = useCreateReport();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Process files asynchronously without blocking
    for (const file of Array.from(files)) {
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
      };
      reader.readAsDataURL(file);
    }

    // Reset input and close modal after a short delay to allow uploads to start
    setTimeout(() => {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onClose();
    }, 500);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <ModalWrapper open={isOpen} onOpenChange={onClose} triggerRef={triggerRef}>
      <DialogHeader>
        <DialogTitle>Upload Files</DialogTitle>
        <DialogDescription>Select and upload files to the current location.</DialogDescription>
      </DialogHeader>
      
      <div className="py-6">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif"
        />
        
        <div 
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
          onClick={handleUploadClick}
        >
          {createReport.isPending ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </div>
          ) : (
            <>
              <UploadCloud className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                Click to select files or drag and drop
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                PDF, Word, Excel, PowerPoint, Images up to 50MB
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleUploadClick} disabled={createReport.isPending}>
          Select Files
        </Button>
      </div>
    </ModalWrapper>
  );
}