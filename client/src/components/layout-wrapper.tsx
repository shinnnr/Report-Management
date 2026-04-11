import { ReactNode, useState, useEffect, createContext, useContext } from "react";
import { Sidebar } from "./layout-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Redirect } from "wouter";

// Create context for sidebar
interface SidebarContextType {
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  isSidebarOpen: boolean;
  isSidebarToggleable: boolean;
}

const SidebarContext = createContext<SidebarContextType>({ 
  openSidebar: () => {},
  closeSidebar: () => {},
  toggleSidebar: () => {},
  isSidebarOpen: false,
  isSidebarToggleable: false
});

export const useSidebar = () => useContext(SidebarContext);

export function LayoutWrapper({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const isMobile = useIsMobile();
  const isSidebarToggleable = isMobile === true; // Only true when explicitly true
  const [sidebarOpen, setSidebarOpen] = useState(!isSidebarToggleable);

  // Handle sidebar state based on mobile/toggleable status
  useEffect(() => {
    if (isSidebarToggleable) {
      setSidebarOpen(false);
      return;
    }

    setSidebarOpen(true);
  }, [isSidebarToggleable]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [sidebarOpen, isMobile]);

  const toggleSidebar = () => {
    if (!isSidebarToggleable) {
      setSidebarOpen(true);
      return;
    }
    setSidebarOpen(prev => !prev);
  };

  const openSidebar = () => {
    if (!isSidebarToggleable) {
      setSidebarOpen(true);
      return;
    }

    setSidebarOpen(true);
  };

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
    <SidebarContext.Provider value={{ 
      openSidebar,
      closeSidebar: () => {
        if (!isSidebarToggleable) {
          setSidebarOpen(true);
          return;
        }

        setSidebarOpen(false);
      },
      toggleSidebar,
      isSidebarOpen: sidebarOpen,
      isSidebarToggleable
    }}>
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar overlay - visible when sidebar is open on toggleable screens */}
      {isSidebarToggleable && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        ${isSidebarToggleable ? 
          `fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }` 
          : 'relative'
        }
      `}>
        <Sidebar 
          onClose={() => setSidebarOpen(false)}
          isMobile={isMobile}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto h-screen p-8 relative">
        <div className="max-w-7xl mx-auto pb-12">
          {children}
        </div>
      </main>
    </div>
    </SidebarContext.Provider>
  );
}
