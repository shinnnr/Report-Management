import { useState, useEffect, useRef, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { LogOut, AlertTriangle } from "lucide-react";
import { useLogoutMutation, useUser, useAuth } from "@/hooks/use-auth";

const COUNTDOWN_SECONDS = 5;

function useDeactivationKey() {
  const [key, setKey] = useState(0);
  const increment = useCallback(() => setKey(k => k + 1), []);
  return [key, increment] as const;
}

export function DeactivationAlert() {
  const [deactivationKey, forceDeactivationUpdate] = useDeactivationKey();
  const [isOpen, setIsOpen] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [message, setMessage] = useState("Your account has been deactivated by the administrator.");
  const [currentTimestamp, setCurrentTimestamp] = useState<number | null>(null);
  const logoutMutation = useLogoutMutation();
  const { data: currentUser, refetch: refetchUser } = useUser();
  const { user } = useAuth();
  const hasLoggedOutRef = useRef(false);
  const lastProcessedTimestampRef = useRef<number | null>(null);

  // Close modal when logout is successful
  useEffect(() => {
    if (logoutMutation.isSuccess) {
      hasLoggedOutRef.current = true;
      setIsOpen(false);
      // Clear localStorage on logout so subsequent deactivations work fresh
      localStorage.removeItem('userDeactivated');
    }
  }, [logoutMutation.isSuccess]);
  
  // Close modal when user is not authenticated (e.g., on page reload)
  useEffect(() => {
    if (!currentUser && isOpen) {
      setIsOpen(false);
    }
  }, [currentUser, isOpen]);
  
  // Handle showing the deactivation modal
  const showDeactivationModal = useCallback((deactivateMessage: string) => {
    if (logoutMutation.isPending) {
      return;
    }
    setCountdown(COUNTDOWN_SECONDS);
    setIsOpen(true);
    setMessage(deactivateMessage);
    setCurrentTimestamp(Date.now());
  }, [logoutMutation.isPending]);

  // Listen for deactivation events via custom event
  useEffect(() => {
    const handleDeactivation = (event: CustomEvent) => {
      // event.detail is the message string directly
      const deactivateMessage = event.detail as string || "Your account has been deactivated by the administrator.";
      showDeactivationModal(deactivateMessage);
    };

    window.addEventListener("user-deactivated", handleDeactivation as EventListener);
    return () => {
      window.removeEventListener("user-deactivated", handleDeactivation as EventListener);
    };
  }, [showDeactivationModal]);

  // Get session timestamp to compare deactivations across logins
  const sessionTimestamp = localStorage.getItem('userSessionTimestamp');
  
  // Don't check localStorage on mount - it causes flash on login page
  // The custom event from polling will handle showing modal when user is authenticated

  // When user logs in (after being logged out), check if they were reactivated but then deactivated again
  // Also refetch to detect if still active after login
  useEffect(() => {
    if (currentUser && hasLoggedOutRef.current) {
      // User logged back in after being logged out
      hasLoggedOutRef.current = false;
      setCurrentTimestamp(null);
      lastProcessedTimestampRef.current = null;
      
      // Refetch immediately to check deactivation status after login
      refetchUser();
    }
  }, [currentUser, refetchUser]);

  // Also refetch periodically to detect deactivations
  useEffect(() => {
    if (currentUser && !logoutMutation.isPending && !logoutMutation.isSuccess) {
      const interval = setInterval(() => {
        refetchUser();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [currentUser, refetchUser, logoutMutation.isPending, logoutMutation.isSuccess]);

  // Countdown timer using setInterval for consistent display
  useEffect(() => {
    if (!isOpen || countdown <= 0 || logoutMutation.isPending || logoutMutation.isSuccess) {
      return;
    }

    // Clear any existing interval
    let intervalId: ReturnType<typeof setInterval> | null = null;
    
    // Start the countdown interval
    intervalId = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Auto logout when countdown reaches 0
          if (!logoutMutation.isPending) {
            logoutMutation.mutate();
          }
          setIsOpen(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isOpen, logoutMutation.isPending, logoutMutation.isSuccess, logoutMutation.mutate]);

  // Handle manual logout button click
  const handleLogoutNow = () => {
    logoutMutation.mutate();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => {
      // Only allow manual close if logout is not in progress
      if (!open && !logoutMutation.isPending) {
        setIsOpen(false);
      }
    }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle className="text-xl">Account Deactivated</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base ml-13">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              You will be automatically logged out in
            </span>
            <div className="flex items-center gap-2">
              <LogOut className="h-4 w-4 text-muted-foreground animate-pulse" />
              <span className="text-2xl font-bold tabular-nums">
                {countdown}
              </span>
              <span className="text-sm text-muted-foreground">
                {countdown === 1 ? "second" : "seconds"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <AlertDialogAction 
            onClick={handleLogoutNow}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Log out now
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}