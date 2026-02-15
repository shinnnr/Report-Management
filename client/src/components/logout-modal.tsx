import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { ModalWrapper } from "@/components/modal-wrapper";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

export function LogoutModal({ isOpen, onClose, triggerRef }: LogoutModalProps) {
  const { logoutMutation } = useAuth();

  const handleLogout = () => {
    logoutMutation.mutate();
    onClose();
  };

  return (
    <ModalWrapper open={isOpen} onOpenChange={onClose} triggerRef={triggerRef}>
      <DialogHeader>
        <DialogTitle>Confirm Logout</DialogTitle>
        <DialogDescription>
          Are you sure you want to log out? You will need to sign in again to access your account.
        </DialogDescription>
      </DialogHeader>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending ? "Logging out..." : "Log Out"}
        </Button>
      </div>
    </ModalWrapper>
  );
}