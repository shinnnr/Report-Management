import { LayoutWrapper } from "@/components/layout-wrapper";
import { StatCard } from "@/components/stat-card";
import { Folder, FileText, Clock, AlertCircle, Activity, File, Pencil, Archive, Trash2, RotateCcw, Plus, ArrowRightLeft, LogIn, LogOut, Key, Settings } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useFolders } from "@/hooks/use-folders";
import { useReports } from "@/hooks/use-reports";
import { useActivities, useLogs } from "@/hooks/use-activities";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications, useMarkNotificationRead } from "@/hooks/use-notifications";
import { formatDistanceToNow } from "date-fns";
import { NotificationModal } from "@/components/notification-modal";

export default function DashboardPage() {
    const { user } = useAuth();
    const { data: folders } = useFolders(null);
    const { data: reports } = useReports();
    const { data: activities } = useActivities();
    const { data: logs } = useLogs();
    const [, setLocation] = useLocation();
    const { data: notifications } = useNotifications();
    const markReadMutation = useMarkNotificationRead();

    const [hoverState, setHoverState] = useState<{
        visible: boolean;
        x: number;
        y: number;
        type: string;
        data: { items: any[]; total: number };
    } | null>(null);

    const [showNotifications, setShowNotifications] = useState(false);
    const [showNotificationModal, setShowNotificationModal] = useState(false);
    const notificationRef = useRef<HTMLDivElement>(null);

    // Close notifications when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
                setShowNotifications(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const overdueActivities = activities?.filter(a => a.status === 'overdue').length || 0;

    const handleMouseEnter = (type: string, event: React.MouseEvent) => {
        const data = getPreviewData(type);
        setHoverState({
            visible: true,
            x: event.clientX + 15,
            y: event.clientY + 15,
            type,
            data
        });
    };

    const handleMouseMove = (event: React.MouseEvent) => {
        if (hoverState) {
            setHoverState(prev => prev ? {
                ...prev,
                x: event.clientX + 15,
                y: event.clientY + 15
            } : null);
        }
    };

    const handleMouseLeave = () => {
        setHoverState(null);
    };

    const getPreviewData = (type: string) => {
        let data;
        switch (type) {
            case 'folders':
                data = folders?.map(folder => ({
                    name: folder.name,
                    createdAt: folder.createdAt,
                    fileCount: 0 // Would need to calculate
                })) || [];
                break;
            case 'reports':
                data = reports?.map(report => ({
                    title: report.title,
                    uploadedBy: report.uploadedBy,
                    createdAt: report.createdAt
                })) || [];
                break;
            case 'activities':
                data = activities?.map(activity => ({
                    title: activity.title,
                    deadlineDate: activity.deadlineDate,
                    status: activity.status
                })) || [];
                break;
            case 'overdue':
                data = activities?.filter(a => a.status === 'overdue').map(activity => ({
                    title: activity.title,
                    deadlineDate: activity.deadlineDate,
                    daysOverdue: Math.floor((new Date().getTime() - new Date(activity.deadlineDate).getTime()) / (1000 * 60 * 60 * 24))
                })) || [];
                break;
            default:
                data = [];
        }
        return {
            items: data.slice(0, 3),
            total: data.length
        };
    };

    const handleCardClick = (type: string) => {
        switch (type) {
            case 'folders':
                setLocation('/drive');
                break;
            case 'reports':
                setLocation('/drive');
                break;
            case 'activities':
                setLocation('/calendar');
                break;
            case 'overdue':
                setLocation('/calendar');
                break;
        }
    };

    const handleNotificationClick = (notification: any) => {
        // Mark as read
        markReadMutation.mutate({ userId: user?.id, notificationId: notification.id });
        // Redirect based on notification type
        if (notification.content.includes('activity')) {
            setLocation('/calendar');
        }
        setShowNotifications(false);
    };

    const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

    const getActivityIcon = (action: string) => {
        const lowerAction = action.toLowerCase();
        if (lowerAction.includes('create_report') || lowerAction.includes('upload_report')) return File;
        if (lowerAction.includes('update_report')) return FileText;
        if (lowerAction.includes('create_folder')) return Folder;
        if (lowerAction.includes('update_folder')) return Folder;
        if (lowerAction.includes('archive_report')) return Archive;
        if (lowerAction.includes('archive_folder')) return Archive;
        if (lowerAction.includes('restore_report')) return RotateCcw;
        if (lowerAction.includes('restore_folder')) return RotateCcw;
        if (lowerAction.includes('delete_report')) return Trash2;
        if (lowerAction.includes('delete_folder')) return Trash2;
        if (lowerAction.includes('create') || lowerAction.includes('upload')) return Plus;
        if (lowerAction.includes('update') || lowerAction.includes('update_profile')) return Pencil;
        if (lowerAction.includes('delete')) return Trash2;
        if (lowerAction.includes('move')) return ArrowRightLeft;
        if (lowerAction.includes('archive')) return Archive;
        if (lowerAction.includes('restore')) return RotateCcw;
        if (lowerAction.includes('login')) return LogIn;
        if (lowerAction.includes('logout')) return LogOut;
        if (lowerAction.includes('password')) return Key;
        if (lowerAction.includes('settings')) return Settings;
        if (lowerAction.includes('report')) return File;
        if (lowerAction.includes('folder')) return Folder;
        return Activity;
    };

   // Calculate real storage usage
  const totalStorageBytes = 10 * 1024 * 1024 * 1024; // 10GB in bytes
  const usedStorageBytes = reports?.reduce((total, report) => total + (report.fileSize || 0), 0) || 0;
  const usedStorageGB = usedStorageBytes / (1024 * 1024 * 1024);
  const storagePercentage = Math.min((usedStorageBytes / totalStorageBytes) * 100, 100);

  return (
    <LayoutWrapper>
      <header className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-display font-bold text-primary mb-2">
              Dashboard
            </h1>
            <p className="text-muted-foreground">
              Welcome back, {user?.fullName}. Here's what's happening today.
            </p>
          </div>
          <div className="relative" ref={notificationRef}>
            <Button
              variant="ghost"
              size="sm"
              className="relative"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                </div>
                <ScrollArea className="h-96">
                  <div className="p-4">
                    {notifications && notifications.length > 0 ? (
                      <div className="space-y-2">
                        {notifications.slice(0, 10).map((notification) => (
                          <div
                            key={notification.id}
                            className={`p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors ${
                              !notification.isRead ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'
                            }`}
                            onClick={() => handleNotificationClick(notification)}
                          >
                            <p className={`text-sm ${!notification.isRead ? 'font-semibold' : 'font-normal'} text-gray-900`}>
                              {notification.title}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              {notification.content}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                        ))}
                        {notifications.length > 10 && (
                          <div className="border-t border-gray-200 pt-3 mt-3">
                            <button
                              onClick={() => {
                                setShowNotifications(false);
                                setShowNotificationModal(true);
                              }}
                              className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                              View All Notifications
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No notifications</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
        <div
          onMouseEnter={(e) => handleMouseEnter('folders', e)}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={() => handleCardClick('folders')}
          className="cursor-pointer"
        >
          <StatCard
            title="Total Folders"
            value={folders?.length || 0}
            icon={Folder}
            color="primary"
            trend="Root directories"
          />
        </div>
        <div
          onMouseEnter={(e) => handleMouseEnter('reports', e)}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={() => handleCardClick('reports')}
          className="cursor-pointer"
        >
          <StatCard
            title="Total Reports"
            value={reports?.length || 0}
            icon={FileText}
            color="secondary"
            trend="Across all folders"
          />
        </div>
        <div
          onMouseEnter={(e) => handleMouseEnter('activities', e)}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={() => handleCardClick('activities')}
          className="cursor-pointer"
        >
          <StatCard
            title="Total Activities"
            value={activities?.length || 0}
            icon={Activity}
            color="accent"
            trend="All tasks"
          />
        </div>
        <div
          onMouseEnter={(e) => handleMouseEnter('overdue', e)}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={() => handleCardClick('overdue')}
          className="cursor-pointer"
        >
          <StatCard
            title="Overdue"
            value={overdueActivities}
            icon={AlertCircle}
            color="orange"
            trend="Action required"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
        {/* Recent Activity Logs */}
        <div className="lg:col-span-2">
          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Recent System Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {logs?.map((log) => {
                    const IconComponent = getActivityIcon(log.action);
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-muted/50">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <IconComponent className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="font-medium text-sm text-foreground truncate cursor-help">{log.description}</p>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{log.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {format(new Date(log.timestamp!), 'MMM d, h:mm a')}
                            </span>
                          </div>
                          <div className="ml-4 mt-1">
                            <p className="text-xs text-muted-foreground">
                              {log.userFullName || 'Unknown'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!logs?.length && (
                    <div className="text-center py-10 text-muted-foreground">
                      No recent system activity found.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions / Info */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-primary to-primary/90 rounded-2xl p-6 text-white shadow-xl shadow-primary/20">
            <h3 className="text-lg font-display font-bold mb-2">Need Help?</h3>
            <p className="text-primary-foreground/80 text-sm mb-4">
              Contact the system administrator if you encounter any issues with file permissions.
            </p>
            <div className="text-xs opacity-60">System Version 1.0.0</div>
          </div>

          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle>Storage Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Storage Used</span>
                  <span className="text-sm font-semibold text-foreground">{storagePercentage.toFixed(1)}%</span>
                </div>
                <div className="relative h-3 w-full bg-muted rounded-full overflow-hidden shadow-inner">
                  <div
                    className={`h-full transition-all duration-500 ease-out rounded-full ${
                      storagePercentage > 90 ? 'bg-red-500' :
                      storagePercentage > 70 ? 'bg-yellow-500' :
                      'bg-gradient-to-r from-primary to-primary/80'
                    }`}
                    style={{ width: `${storagePercentage}%` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{usedStorageGB.toFixed(2)} GB used</span>
                  <span>10.00 GB total</span>
                </div>
                {storagePercentage > 80 && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    ⚠️ Storage usage is high. Consider cleaning up old files.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Floating Hover Tooltip */}
      {hoverState?.visible && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-xs pointer-events-none transition-opacity duration-200"
          style={{
            left: hoverState.type === 'overdue' ? hoverState.x : Math.min(hoverState.x, window.innerWidth - 320),
            top: Math.min(hoverState.y, window.innerHeight - 200),
          }}
        >
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-900">
              {hoverState.type === 'folders' && 'Recent Folders'}
              {hoverState.type === 'reports' && 'Recent Reports'}
              {hoverState.type === 'activities' && 'Active Activities'}
              {hoverState.type === 'overdue' && 'Overdue Activities'}
            </h4>
            <div className="space-y-1">
              {hoverState.data.items.length > 0 ? (
                <>
                  {hoverState.data.items.map((item: any, index: number) => (
                    <div key={index} className="text-xs text-gray-600 border-b border-gray-100 pb-1 last:border-b-0">
                      {hoverState.type === 'folders' && (
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-gray-500">Created: {format(new Date(item.createdAt), 'MMM d, yyyy')}</div>
                        </div>
                      )}
                      {hoverState.type === 'reports' && (
                        <div>
                          <div className="font-medium">{item.title}</div>
                          <div className="text-gray-500">Uploaded: {format(new Date(item.createdAt), 'MMM d, yyyy')}</div>
                        </div>
                      )}
                      {hoverState.type === 'activities' && (
                        <div>
                          <div className="font-medium">{item.title}</div>
                          <div className="text-gray-500">Deadline: {format(new Date(item.deadlineDate), 'MMM d, yyyy')}</div>
                          <div className="text-gray-500 capitalize">Status: {item.status}</div>
                        </div>
                      )}
                      {hoverState.type === 'overdue' && (
                        <div>
                          <div className="font-medium">{item.title}</div>
                          <div className="text-gray-500">Deadline: {format(new Date(item.deadlineDate), 'MMM d, yyyy')}</div>
                          <div className="text-red-500">{item.daysOverdue} days overdue</div>
                        </div>
                      )}
                    </div>
                  ))}
                  {hoverState.data.total > 3 && (
                    <div className="text-xs text-gray-500 pt-1">
                      +{hoverState.data.total - 3} more...
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-gray-500">No records available.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <NotificationModal
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
      />
    </LayoutWrapper>
  );
}
