import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";

import AuthPage from "@/pages/auth-page";
import DashboardPage from "@/pages/dashboard-page";
import DrivePage from "@/pages/drive-page";
import CalendarPage from "@/pages/calendar-page";
import ArchivesPage from "@/pages/archives-page";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={AuthPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/drive" component={DrivePage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/archives" component={ArchivesPage} />
      
      {/* Root redirects to dashboard (auth guard will handle login redirect) */}
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
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
