import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/contexts/theme-context";
import * as React from "react";
import { createPortal } from "react-dom";
import {
  LayoutDashboard,
  FolderOpen,
  CalendarDays,
  Archive,
  Settings,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import neecoBanner from "@assets/NEECO_banner_1770341682188.png";

export function Sidebar() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { resetTheme } = useTheme();
  const [showLogoutDialog, setShowLogoutDialog] = React.useState(false);
  const [isClosing, setIsClosing] = React.useState(false);
  const [buttonPosition, setButtonPosition] = React.useState({ x: 0, y: 0 });
  const logoutButtonRef = React.useRef<HTMLButtonElement>(null);

  // Handle body scroll lock
  React.useEffect(() => {
    if (showLogoutDialog) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [showLogoutDialog]);

  // Track button position and open modal
  const handleLogoutClick = () => {
    if (logoutButtonRef.current) {
      const rect = logoutButtonRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      setButtonPosition({ x: centerX, y: centerY });
    }
    setIsClosing(false);
    setShowLogoutDialog(true);
  };

  // Handle modal close with animation
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowLogoutDialog(false);
      setIsClosing(false);
    }, 250);
  };

  // Handle confirm logout
  const handleConfirmLogout = () => {
    handleClose();
    resetTheme();
    logoutMutation.mutate();
  };

  // Calculate transform translate delta for stretching effect
  // Delta is the offset from center to button position
  const viewportCenterX = typeof window !== 'undefined' ? window.innerWidth / 2 : 0;
  const viewportCenterY = typeof window !== 'undefined' ? window.innerHeight / 2 : 0;
  const swooshDeltaX = buttonPosition.x > 0 ? `${buttonPosition.x - viewportCenterX}px` : '0px';
  const swooshDeltaY = buttonPosition.y > 0 ? `${buttonPosition.y - viewportCenterY}px` : '0px';

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: FolderOpen, label: "My Drive", href: "/drive" },
    { icon: CalendarDays, label: "Activities", href: "/calendar" },
    { icon: Archive, label: "Archives", href: "/archives" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ];

  return (
    <div className="h-screen w-64 bg-primary dark:bg-[#022420] text-white flex flex-col shadow-2xl z-20">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <img src={neecoBanner} alt="NEECO Banner" className="w-10 h-10 rounded-lg object-contain" />
          <div>
            <h1 className="font-display font-bold text-lg tracking-tight leading-tight">Report Management</h1>
          </div>
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
        
        {/* Custom Logout Button */}
        <Button
          ref={logoutButtonRef}
          variant="ghost"
          className="w-full justify-start text-primary-foreground/70 dark:text-gray-300 hover:text-white hover:bg-white/5"
          onClick={handleLogoutClick}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Log Out
        </Button>

        {/* Custom Swoosh Modal - Rendered via Portal */}
        {showLogoutDialog && typeof document !== 'undefined' && createPortal(
          <>
            {/* Custom Overlay */}
            <div
              className={cn(
                "fixed inset-0 z-50 bg-black/80",
                isClosing ? "swoosh-modal-overlay closing" : "swoosh-modal-overlay"
              )}
              onClick={handleClose}
            />
            {/* Custom Content */}
            <div
              className={cn(
                "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg",
                isClosing ? "swoosh-modal-content closing" : "swoosh-modal-content"
              )}
              style={{
                '--swoosh-delta-x': swooshDeltaX,
                '--swoosh-delta-y': swooshDeltaY,
              } as React.CSSProperties}
            >
              <div className="flex flex-col space-y-2 text-center sm:text-left">
                <h2 className="text-lg font-semibold">Confirm Logout</h2>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to log out? You will need to sign in again to access your account.
                </p>
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  className="mt-2 sm:mt-0"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmLogout}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Log Out
                </Button>
              </div>
            </div>
          </>,
          document.body
        )}
      </div>
    </div>
  );
}
