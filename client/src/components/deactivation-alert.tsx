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
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Close modal when logout is successful
  useEffect(() => {
    if (logoutMutation.isSuccess) {
      hasLoggedOutRef.current = true;
      setIsOpen(false);
      // Clear any running interval
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      // Clear localStorage on logout so subsequent deactivations work fresh
      localStorage.removeItem('userDeactivated');
    }
  }, [logoutMutation.isSuccess]);

  // Function to start countdown timer
  const startCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Auto logout when countdown reaches 0
          if (logoutMutation.isPending) {
            return 0;
          }
          logoutMutation.mutate();
          setIsOpen(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [logoutMutation.isPending, logoutMutation.mutate]);
  
  // Handle showing the deactivation modal - always show it when called
  const showDeactivationModal = useCallback((deactivateMessage: string) => {
    // Prevent showing modal if logout is in progress
    if (logoutMutation.isPending) {
      return;
    }
    // ALWAYS reset countdown - force it to start
    setCountdown(COUNTDOWN_SECONDS);
    setIsOpen(true);
    setMessage(deactivateMessage);
    setCurrentTimestamp(Date.now());
    // Start countdown immediately
    startCountdown();
  }, [logoutMutation.isPending, startCountdown]);

  // Debug: reset countdown when modal opens
  useEffect(() => {
    if (isOpen && countdown === COUNTDOWN_SECONDS) {
      // Countdown was just reset, timer should start in the countdown effect
    }
  }, [isOpen, countdown]);

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
  
  // Check localStorage on mount and after user logs in - to handle refresh and re-login scenarios
  useEffect(() => {
    try {
      const stored = localStorage.getItem("userDeactivated");
      if (stored) {
        const data = JSON.parse(stored);
        // Only show modal if there's a deactivation stored
        // and it belongs to the current session (or no session was set)
        const storedSession = data.sessionTimestamp;
        if (!storedSession || storedSession === sessionTimestamp) {
          showDeactivationModal(data.message || "Your account has been deactivated by the administrator.");
          // Also force update to ensure timer starts
          forceUpdate();
        }
      }
    } catch (e) {
      // Invalid JSON, ignore
    }
  }, [currentUser, showDeactivationModal, sessionTimestamp, forceDeactivationUpdate]);

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

  // Countdown logic - depends on deactivationKey to force re-run
  useEffect(() => {
    deactivationKey; // dependency
    
    // Run when modal is open and countdown > 0 and not logged out
    if (isOpen && countdown > 0 && !logoutMutation.isSuccess && !logoutMutation.isPending) {
      const timerId = setTimeout(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            // Auto logout when countdown reaches 0
            logoutMutation.mutate();
            setIsOpen(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearTimeout(timerId);
    }
  }, [isOpen, countdown, logoutMutation.isSuccess, logoutMutation.isPending, logoutMutation.mutate]);

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