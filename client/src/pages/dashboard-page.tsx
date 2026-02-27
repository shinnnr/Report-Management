import { LayoutWrapper, useSidebar } from "@/components/layout-wrapper";
import { useIsMobile } from "@/hooks/use-mobile";
import { StatCard } from "@/components/stat-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Folder, FileText, Clock, AlertCircle, Activity, File, Pencil, Archive, Trash2, RotateCcw, Plus, ArrowRightLeft, LogIn, LogOut, Key, Settings, LayoutDashboard, Menu, Eye, Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useFolders } from "@/hooks/use-folders";
import { useReports, useReportsCount } from "@/hooks/use-reports";
import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useActivities, useLogs, useDeleteAllLogs, useDeleteLog } from "@/hooks/use-activities";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications, useMarkNotificationRead, useDeleteNotification } from "@/hooks/use-notifications";
import { formatDistanceToNow } from "date-fns";
import { NotificationModal } from "@/components/notification-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

export default function DashboardPage() {
  return (
    <LayoutWrapper>
      <DashboardContent />
    </LayoutWrapper>
  );
}

function DashboardContent() {
    const { user } = useAuth();
    const { openSidebar } = useSidebar();
    const isMobile = useIsMobile();
    const { data: folders } = useFolders('all', 'active', 5000);
    const { data: reportsCount } = useReportsCount(undefined, 'active');
    const { data: reports } = useReports(undefined, 'active', 5000);
    const { data: activities } = useActivities();
    const { data: logs } = useLogs();
    const [, setLocation] = useLocation();
    const { data: notifications } = useNotifications();
    const markReadMutation = useMarkNotificationRead();
    const deleteNotificationMutation = useDeleteNotification();

    const [hoverState, setHoverState] = useState<{
        visible: boolean;
        x: number;
        y: number;
        type: string;
        data: { items: any[]; total: number };
    } | null>(null);

    const [showNotifications, setShowNotifications] = useState(false);
    const [showNotificationModal, setShowNotificationModal] = useState(false);
    const [showDeleteLogsConfirm, setShowDeleteLogsConfirm] = useState(false);
    const [showViewAllLogs, setShowViewAllLogs] = useState(false);
    const [selectedLogIds, setSelectedLogIds] = useState<number[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const logsPerPage = 10;
    const deleteAllLogsMutation = useDeleteAllLogs();
    const deleteLogMutation = useDeleteLog();
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
    const subFoldersCount = folders?.filter(f => f.parentId !== null && f.parentId !== undefined).length || 0;
    const rootFoldersCount = folders?.filter(f => f.parentId === null || f.parentId === undefined).length || 0;
    const pendingActivities = activities?.filter(a => a.status === 'pending').length || 0;

    const handleMouseEnter = (type: string, event: React.MouseEvent) => {
        const data: { items: any[]; total: number } = getPreviewData(type);
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
        if (user?.id) {
            markReadMutation.mutate({ userId: user.id, notificationId: notification.id });
        }
        // Redirect based on notification type with activityId if available
        if (notification.content.includes('activity') || notification.activityId) {
            const activityId = notification.activityId;
            if (activityId) {
                setLocation(`/calendar?activityId=${activityId}`);
            } else {
                setLocation('/calendar');
            }
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
    <>
      <header className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-primary mb-2 flex items-center gap-2">
              {isMobile ? (
                <button 
                  type="button" 
                  onClick={(e) => {
                    e.stopPropagation();
                    openSidebar();
                  }} 
                  className="p-1 hover:bg-muted rounded-md transition-colors cursor-pointer"
                  aria-label="Open menu"
                >
                  <Menu className="w-8 h-8" />
                </button>
              ) : (
                <LayoutDashboard className="w-8 h-8" />
              )}
              Dashboard
            </h1>
            <p className="text-muted-foreground">
              Welcome back, <span className="font-medium truncate max-w-[150px]">{user?.fullName}</span>. Here's what's happening today.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
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
              <div className="absolute right-0 top-full mt-2 w-80 bg-popover border rounded-lg shadow-lg z-50">
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                </div>
                <ScrollArea className="h-72">
                  <div className="p-4">
                    {notifications && notifications.length > 0 ? (
                      <div className="space-y-2">
                        {notifications.slice(0, 10).map((notification) => (
                          <div
                            key={notification.id}
                            className={`p-3 rounded-lg border cursor-pointer hover:bg-muted transition-colors group relative ${
                              !notification.isRead ? 'bg-primary/10 border-primary/20' : 'bg-card border-border'
                            }`}
                            onClick={() => handleNotificationClick(notification)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className={`text-sm ${!notification.isRead ? 'font-semibold' : 'font-normal'} text-foreground`}>
                                  {notification.title}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {notification.content}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {notification.createdAt ? formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true }) : 'Unknown time'}
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteNotificationMutation.mutate(notification.id);
                                }}
                                className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/20 rounded"
                                title="Delete notification"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No notifications</p>
                    )}
                  </div>
                </ScrollArea>
                {notifications && notifications.length > 0 && (
                  <div className="p-3 bg-muted/30">
                    <button
                      onClick={() => {
                        setShowNotifications(false);
                        setShowNotificationModal(true);
                      }}
                      className="w-full text-sm text-primary hover:text-primary/80 font-medium"
                    >
                      View All Notifications
                    </button>
                  </div>
                )}
              </div>
            )}
            </div>
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
            title="Total Root Folders"
            value={rootFoldersCount || 0}
            icon={Folder}
            color="primary"
            trend={`${subFoldersCount} sub folders`}
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
            value={reportsCount || 0}
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
            color="secondary"
            trend={`${pendingActivities} pending activities`}
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
          <Card className="border border-gray-200 dark:border-gray-800 shadow-lg relative group overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Recent System Activity
              </CardTitle>
              {user?.role === 'admin' && (
                <div className={`absolute top-4 right-4 flex gap-1 ${isMobile ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                  <button
                    onClick={() => setShowViewAllLogs(true)}
                    className="p-1 hover:bg-primary/20 rounded"
                    title="View all logs"
                  >
                    <Eye className="h-4 w-4 text-primary" />
                  </button>
                  <button
                    onClick={() => setShowDeleteLogsConfirm(true)}
                    className="p-1 hover:bg-destructive/20 rounded"
                    title="Delete all logs"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {logs?.slice(0, 10).map((log) => {
                    const IconComponent = getActivityIcon(log.action);
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg md:rounded-xl bg-muted/30 border border-muted/50">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <IconComponent className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
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
                            <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                              {log.userFullName || 'Unknown'}{log.userRole && ` | ${log.userRole === 'admin' ? 'Admin' : 'Assistant'}`}
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
          <div className="bg-gradient-to-br from-primary to-primary/90 rounded-2xl p-6 text-primary-foreground shadow-xl shadow-primary/20 dark:from-[#022420] dark:to-[#023020] dark:text-white">
            <h3 className="text-lg font-display font-bold mb-2">Need Help?</h3>
            <p className="text-sm mb-4 text-primary-foreground/80 dark:text-gray-200">
              Contact the system administrator if you encounter any issues with file permissions.
            </p>
            <div className="text-xs text-primary-foreground/60 dark:text-gray-400">System Version 1.0.0</div>
          </div>

          <Card className="border border-gray-200 dark:border-gray-800 shadow-lg">
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
          className="fixed z-50 bg-popover border rounded-lg shadow-lg p-4 max-w-xs pointer-events-none transition-opacity duration-200"
          style={{
            left: hoverState.type === 'overdue' ? hoverState.x : Math.min(hoverState.x, window.innerWidth - 320),
            top: Math.min(hoverState.y, window.innerHeight - 200),
          }}
        >
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">
              {hoverState.type === 'folders' && 'Recent Folders'}
              {hoverState.type === 'reports' && 'Recent Reports'}
              {hoverState.type === 'activities' && 'Active Activities'}
              {hoverState.type === 'overdue' && 'Overdue Activities'}
            </h4>
            <div className="space-y-1">
              {hoverState.data.items.length > 0 ? (
                <>
                  {hoverState.data.items.map((item: any, index: number) => (
                    <div key={index} className="text-xs text-muted-foreground border-b border-border pb-1 last:border-b-0">
                      {hoverState.type === 'folders' && (
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-muted-foreground">Created: {format(new Date(item.createdAt), 'MMM d, yyyy')}</div>
                        </div>
                      )}
                      {hoverState.type === 'reports' && (
                        <div>
                          <div className="font-medium">{item.title}</div>
                          <div className="text-muted-foreground">Uploaded: {format(new Date(item.createdAt), 'MMM d, yyyy')}</div>
                        </div>
                      )}
                      {hoverState.type === 'activities' && (
                        <div>
                          <div className="font-medium">{item.title}</div>
                          <div className="text-muted-foreground">Deadline: {format(new Date(item.deadlineDate), 'MMM d, yyyy')}</div>
                          <div className="text-muted-foreground capitalize">Status: {item.status}</div>
                        </div>
                      )}
                      {hoverState.type === 'overdue' && (
                        <div>
                          <div className="font-medium">{item.title}</div>
                          <div className="text-muted-foreground">Deadline: {format(new Date(item.deadlineDate), 'MMM d, yyyy')}</div>
                          <div className="text-destructive">{item.daysOverdue} days overdue</div>
                        </div>
                      )}
                    </div>
                  ))}
                  {hoverState.data.total > 3 && (
                    <div className="text-xs text-muted-foreground pt-1">
                      +{hoverState.data.total - 3} more...
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-muted-foreground">No records available.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <NotificationModal
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
      />

      <AlertDialog open={showDeleteLogsConfirm} onOpenChange={setShowDeleteLogsConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Activity Logs</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete all activity logs? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAllLogsMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View All Activity Logs Dialog */}
      <Dialog open={showViewAllLogs} onOpenChange={(open) => {
        setShowViewAllLogs(open);
        if (!open) {
          setSelectedLogIds([]);
          setCurrentPage(1);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>All Activity Logs</DialogTitle>
            <DialogDescription>
              View all your recent activity logs here. You can select multiple logs to archive or delete them.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[400px]">
            <div className="space-y-2 pr-4 pb-4">
              {logs && logs.length > 0 ? (
              logs
                .slice((currentPage - 1) * logsPerPage, currentPage * logsPerPage)
                .map((log) => {
                  const IconComponent = getActivityIcon(log.action);
                  return (
                    <div 
                      key={log.id} 
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-muted/50 group hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={selectedLogIds.includes(log.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedLogIds([...selectedLogIds, log.id]);
                          } else {
                            setSelectedLogIds(selectedLogIds.filter(id => id !== log.id));
                          }
                        }}
                        className="flex-shrink-0"
                      />
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <IconComponent className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{log.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {log.userFullName || 'Unknown'}{log.userRole && ` | ${log.userRole === 'admin' ? 'Admin' : 'Assistant'}`}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(log.timestamp!), 'MMM d, h:mm a')}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteLogMutation.mutate(log.id)}
                        className={`p-1 hover:bg-destructive/20 rounded transition-all flex-shrink-0 ${isMobile ? '' : 'opacity-0 group-hover:opacity-100'}`}
                        title="Delete log"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  );
                })
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                No activity logs found.
              </div>
            )}
          </div>
          </ScrollArea>

          {/* Pagination Controls and Delete Selected - fixed at bottom */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              {logs && logs.length >= logsPerPage && (
                <>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {Math.ceil(logs.length / logsPerPage)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(logs.length / logsPerPage), p + 1))}
                    disabled={currentPage >= Math.ceil(logs.length / logsPerPage)}
                  >
                    Next
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-4">
              {selectedLogIds.length > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">
                    {selectedLogIds.length} selected
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      selectedLogIds.forEach(id => deleteLogMutation.mutate(id));
                      setSelectedLogIds([]);
                    }}
                    disabled={deleteLogMutation.isPending}
                  >
                    Delete Selected
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
