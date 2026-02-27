import { ReactNode, useState } from "react";
import { Sidebar } from "./layout-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Menu, LayoutDashboard, FolderOpen, CalendarDays, Archive, Settings } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import neecoBanner from "@assets/NEECO_banner_1770341682188.png";

export function LayoutWrapper({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  // Get current page title and icon
  const getPageInfo = () => {
    const path = location;
    if (path.startsWith("/dashboard")) return { title: "Dashboard", icon: LayoutDashboard };
    if (path.startsWith("/drive")) return { title: "My Drive", icon: FolderOpen };
    if (path.startsWith("/calendar")) return { title: "Activities", icon: CalendarDays };
    if (path.startsWith("/archives")) return { title: "Archives", icon: Archive };
    if (path.startsWith("/settings")) return { title: "Settings", icon: Settings };
    return { title: "Dashboard", icon: LayoutDashboard };
  };

  const pageInfo = getPageInfo();
  const PageIcon = pageInfo.icon;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-10 bg-primary dark:bg-[#022420] text-white px-4 py-3 flex items-center gap-3 shadow-md">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          
          <img src={neecoBanner} alt="NEECO Banner" className="w-8 h-8 rounded-lg object-contain" />
          
          <div className="flex items-center gap-2">
            <PageIcon className="w-5 h-5" />
            <h1 className="font-display font-bold text-lg">{pageInfo.title}</h1>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 relative">
          <div className="max-w-7xl mx-auto pb-12">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
