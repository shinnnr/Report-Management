import { ReactNode, useState, useEffect, useRef, createContext, useContext } from "react";
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
}

const SidebarContext = createContext<SidebarContextType>({ 
  openSidebar: () => {},
  closeSidebar: () => {},
  toggleSidebar: () => {},
  isSidebarOpen: false
});

export const useSidebar = () => useContext(SidebarContext);

// Custom hook to check if sidebar should be toggleable (screens smaller than lg)
function useSidebarToggle() {
  const isMobile = useIsMobile();
  const [isToggleable, setIsToggleable] = useState(false);

  useEffect(() => {
    const checkToggleable = () => {
      setIsToggleable(window.innerWidth < 1024);
    };
    
    checkToggleable();
    
    const mql = window.matchMedia("(max-width: 1023px)");
    const onChange = () => checkToggleable();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile || isToggleable;
}

export function LayoutWrapper({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const isMobile = useIsMobile();
  const isSidebarToggleable = useSidebarToggle();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  // Close sidebar when switching to desktop
  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [sidebarOpen, isMobile]);

  // Handle swipe gestures for sidebar
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const swipeThreshold = 50;
    const diff = touchStartX.current - touchEndX.current;
    
    // Swipe right to open sidebar
    if (diff < -swipeThreshold && !sidebarOpen && isMobile) {
      setSidebarOpen(true);
    }
    // Swipe left to close sidebar
    else if (diff > swipeThreshold && sidebarOpen && isMobile) {
      setSidebarOpen(false);
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev);
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
      openSidebar: () => setSidebarOpen(true),
      closeSidebar: () => setSidebarOpen(false),
      toggleSidebar,
      isSidebarOpen: sidebarOpen 
    }}>
    <div 
      className="flex min-h-screen bg-background text-foreground"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
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
