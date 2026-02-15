import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
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
import { useState, useRef } from "react";
import { LogoutModal } from "@/components/logout-modal";

import neecoBanner from "@assets/NEECO_banner_1770341682188.png";

export function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const logoutButtonRef = useRef<HTMLButtonElement>(null);

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: FolderOpen, label: "My Drive", href: "/drive" },
    { icon: CalendarDays, label: "Activities", href: "/calendar" },
    { icon: Archive, label: "Archives", href: "/archives" },
  ];

  return (
    <div className="h-screen w-64 bg-primary text-primary-foreground flex flex-col shadow-2xl z-20">
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
                    : "text-primary-foreground/70 hover:bg-white/5 hover:text-white"
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
            <p className="font-medium text-sm truncate">{user?.fullName}</p>
            <p className="text-xs text-primary-foreground/60 capitalize">{user?.role}</p>
          </div>
        </div>
        
        <Button
          ref={logoutButtonRef}
          variant="ghost"
          className="w-full justify-start text-primary-foreground/70 hover:text-white hover:bg-white/5"
          onClick={() => setShowLogoutDialog(true)}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Log Out
        </Button>

        <LogoutModal
          isOpen={showLogoutDialog}
          onClose={() => setShowLogoutDialog(false)}
          triggerRef={logoutButtonRef}
        />
      </div>
    </div>
  );
}
