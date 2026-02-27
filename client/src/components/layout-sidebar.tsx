import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/contexts/theme-context";
import {
  LayoutDashboard,
  FolderOpen,
  CalendarDays,
  Archive,
  Settings,
  LogOut,
  Menu,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState, useEffect } from "react";

import neecoBanner from "@assets/NEECO_banner_1770341682188.png";

export type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { resetTheme } = useTheme();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: FolderOpen, label: "My Drive", href: "/drive" },
    { icon: CalendarDays, label: "Activities", href: "/calendar" },
    { icon: Archive, label: "Archives", href: "/archives" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ];

  // Close sidebar on route change (mobile)
  useEffect(() => {
    onClose();
  }, [location, onClose]);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar - slides in from left on mobile, fixed on desktop */}
      <div className={cn(
        "fixed lg:relative inset-y-0 left-0 z-40 h-screen w-64 bg-primary dark:bg-[#022420] text-white flex flex-col shadow-2xl transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <img src={neecoBanner} alt="NEECO Banner" className="w-10 h-10 rounded-lg object-contain" />
              <div>
                <h1 className="font-display font-bold text-lg tracking-tight leading-tight">Report Management</h1>
              </div>
            </div>
            {/* Close button for mobile */}
            <button 
              onClick={onClose}
              className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="space-y-2">
            {menuItems.map((item) => {
              const isActive = location === item.href || location.startsWith(item.href + '/');
              return (
                <Link key={item.href} href={item.href}>
                  <div className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all duration-200",
                    isActive 
                      ? "bg-white/10 text-white font-medium shadow-inner border border-white/5" 
                      : "text-primary-foreground/70 dark:text-gray-300 hover:bg-white/5 hover:text-white"
                  )}>
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-white/10 bg-black/10">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-primary font-bold text-sm">
              {user?.fullName?.charAt(0) || 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="font-medium text-sm truncate text-primary-foreground dark:text-white">{user?.fullName}</p>
              <p className="text-xs text-primary-foreground/60 dark:text-gray-400 capitalize">{user?.role}</p>
            </div>
          </div>
          
          <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start text-primary-foreground/70 dark:text-gray-300 hover:text-white hover:bg-white/5"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Log Out
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to log out? You will need to sign in again to access your account.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setIsLoggingOut(true);
                    resetTheme();
                    logoutMutation.mutate();
                  }}
                  disabled={isLoggingOut}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isLoggingOut ? "Logging out..." : "Log Out"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </>
  );
}
