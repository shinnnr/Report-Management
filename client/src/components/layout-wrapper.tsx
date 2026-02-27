import { ReactNode, useState, useEffect, useRef } from "react";
import { Sidebar } from "./layout-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Redirect } from "wouter";
import { Menu, X } from "lucide-react";
import neecoBanner from "@assets/NEECO_banner_1770341682188.png";

export function LayoutWrapper({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const isMobile = useIsMobile();
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
    <div 
      className="flex min-h-screen bg-background text-foreground"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Mobile Header - visible only on mobile */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 h-16 bg-primary dark:bg-[#022420] text-white flex items-center px-4 z-30 shadow-lg">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 ml-3">
            <img src={neecoBanner} alt="NEECO Banner" className="w-8 h-8 rounded-lg object-contain" />
            <span className="font-display font-bold text-sm">Report Management</span>
          </div>
        </div>
      )}

      {/* Sidebar overlay - visible only on mobile when sidebar is open */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        ${isMobile ? 
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
      <main className={`
        flex-1 overflow-y-auto h-screen p-8 relative
        ${isMobile ? 'pt-20' : ''}
      `}>
        <div className="max-w-7xl mx-auto pb-12">
          {children}
        </div>
      </main>
    </div>
  );
}
