import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ThemeProvider } from "@/contexts/theme-context";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

import AuthPage from "@/pages/auth-page";
import DashboardPage from "@/pages/dashboard-page";
import DrivePage from "@/pages/drive-page";
import CalendarPage from "@/pages/calendar-page";
import ArchivesPage from "@/pages/archives-page";
import SettingsPage from "@/pages/settings-page";
import NotFound from "@/pages/not-found";
import { DeactivationAlert } from "@/components/deactivation-alert";

function ReplaceRedirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation(to, { replace: true });
  }, [setLocation, to]);

  return null;
}

function ProtectedRoute({ component: Component, path }: { component: React.ComponentType<any>; path: string }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <ReplaceRedirect to="/login" />;
  }

  return <Route path={path} component={Component} />;
}

function Router() {
  const { user } = useAuth();

  return (
    <Switch>
      <Route path="/login" component={AuthPage} />
      <ProtectedRoute path="/dashboard" component={DashboardPage} />
      <ProtectedRoute path="/drive" component={DrivePage} />
      <ProtectedRoute path="/calendar" component={CalendarPage} />
      <ProtectedRoute path="/archives" component={ArchivesPage} />
      <ProtectedRoute path="/settings" component={SettingsPage} />
      
      <Route path="/">
        <ReplaceRedirect to={user ? "/dashboard" : "/login"} />
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <>
      <Toaster />
      {/* Only show deactivation alert when user is authenticated */}
      {user && <DeactivationAlert />}
      <Router />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
