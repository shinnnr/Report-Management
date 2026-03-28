import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, useLogoutMutation } from "@/hooks/use-auth";
import { ThemeProvider } from "@/contexts/theme-context";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import AuthPage from "@/pages/auth-page";
import DashboardPage from "@/pages/dashboard-page";
import DrivePage from "@/pages/drive-page";
import CalendarPage from "@/pages/calendar-page";
import ArchivesPage from "@/pages/archives-page";
import SettingsPage from "@/pages/settings-page";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component, path }: { component: React.ComponentType<any>; path: string }) {
  const { user, isLoading } = useAuth();
  const [showDeactivatedModal, setShowDeactivatedModal] = useState(false);
  const [deactivatedMessage, setDeactivatedMessage] = useState("Your account has been deactivated by the administrator.");
  const logoutMutation = useLogoutMutation();

  // Check for deactivation on mount and when user changes
  useEffect(() => {
    const storedDeactivated = localStorage.getItem('userDeactivated');
    if (storedDeactivated === 'true') {
      const storedMessage = localStorage.getItem('deactivatedMessage') || "Your account has been deactivated by the administrator.";
      setDeactivatedMessage(storedMessage);
      setShowDeactivatedModal(true);
    }
  }, []);

  // Listen for deactivation events
  useEffect(() => {
    const handleUserDeactivated = (e: CustomEvent) => {
      const message = e.detail || "Your account has been deactivated by the administrator.";
      setDeactivatedMessage(message);
      setShowDeactivatedModal(true);
      localStorage.setItem('userDeactivated', 'true');
      localStorage.setItem('deactivatedMessage', message);
    };

    window.addEventListener('user-deactivated', handleUserDeactivated as EventListener);
    return () => {
      window.removeEventListener('user-deactivated', handleUserDeactivated as EventListener);
    };
  }, []);

  // Auto-logout after 5 seconds if deactivated
  useEffect(() => {
    if (showDeactivatedModal) {
      const timer = setTimeout(() => {
        setShowDeactivatedModal(false);
        localStorage.removeItem('userDeactivated');
        localStorage.removeItem('deactivatedMessage');
        logoutMutation.mutate();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showDeactivatedModal, logoutMutation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show deactivated modal first
  if (showDeactivatedModal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <AlertDialog open={showDeactivatedModal} onOpenChange={setShowDeactivatedModal}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Account Deactivated</AlertDialogTitle>
              <AlertDialogDescription>
                {deactivatedMessage}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => {
                setShowDeactivatedModal(false);
                localStorage.removeItem('userDeactivated');
                localStorage.removeItem('deactivatedMessage');
                logoutMutation.mutate();
              }}>
                Logout
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <Route path={path} component={Component} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={AuthPage} />
      <ProtectedRoute path="/dashboard" component={DashboardPage} />
      <ProtectedRoute path="/drive" component={DrivePage} />
      <ProtectedRoute path="/calendar" component={CalendarPage} />
      <ProtectedRoute path="/archives" component={ArchivesPage} />
      <ProtectedRoute path="/settings" component={SettingsPage} />
      
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <Router />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
