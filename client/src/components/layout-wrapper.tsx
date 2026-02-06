import { ReactNode } from "react";
import { Sidebar } from "./layout-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";

export function LayoutWrapper({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto h-screen p-8 relative">
        <div className="max-w-7xl mx-auto pb-12">
          {children}
        </div>
      </main>
    </div>
  );
}
