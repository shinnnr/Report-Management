import { LayoutWrapper } from "@/components/layout-wrapper";
import { StatCard } from "@/components/stat-card";
import { Folder, FileText, Clock, AlertCircle, Activity, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useFolders } from "@/hooks/use-folders";
import { useReports } from "@/hooks/use-reports";
import { useActivities, useLogs } from "@/hooks/use-activities";
import { useUsers } from "@/hooks/use-users";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export default function DashboardPage() {
   const { user } = useAuth();
   const { data: folders } = useFolders(null);
   const { data: reports } = useReports();
   const { data: activities } = useActivities();
   const { data: users } = useUsers();
   const { data: logs } = useLogs();


  // Calculate real storage usage
  const totalStorageBytes = 10 * 1024 * 1024 * 1024; // 10GB in bytes
  const usedStorageBytes = reports?.reduce((total, report) => total + (report.fileSize || 0), 0) || 0;
  const usedStorageGB = usedStorageBytes / (1024 * 1024 * 1024);
  const storagePercentage = Math.min((usedStorageBytes / totalStorageBytes) * 100, 100);

  return (
    <LayoutWrapper>
      <header className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
        <h1 className="text-3xl font-display font-bold text-primary mb-2">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.fullName}. Here's what's happening today.
        </p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
        <HoverCard>
          <HoverCardTrigger asChild>
            <div>
              <StatCard
                title="Total Folders"
                value={folders?.length || 0}
                icon={Folder}
                color="primary"
                trend="Root directories"
              />
            </div>
          </HoverCardTrigger>
          <HoverCardContent className="w-80 shadow-lg rounded-lg">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Folders</h4>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {folders?.slice(0, 10).map((folder) => (
                  <div key={folder.id} className="text-xs text-muted-foreground">
                    {folder.name}
                  </div>
                ))}
                {folders && folders.length > 10 && (
                  <div className="text-xs text-muted-foreground">... and {folders.length - 10} more</div>
                )}
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
        <HoverCard>
          <HoverCardTrigger asChild>
            <div>
              <StatCard
                title="Total Reports"
                value={reports?.length || 0}
                icon={FileText}
                color="secondary"
                trend="Across all folders"
              />
            </div>
          </HoverCardTrigger>
          <HoverCardContent className="w-80 shadow-lg rounded-lg">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Recent Reports</h4>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {reports?.slice(0, 10).map((report) => (
                  <div key={report.id} className="text-xs text-muted-foreground">
                    {report.title}
                  </div>
                ))}
                {reports && reports.length > 10 && (
                  <div className="text-xs text-muted-foreground">... and {reports.length - 10} more</div>
                )}
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
        <HoverCard>
          <HoverCardTrigger asChild>
            <div>
              <StatCard
                title="Total Activities"
                value={activities?.length || 0}
                icon={Activity}
                color="accent"
                trend="All tasks"
              />
            </div>
          </HoverCardTrigger>
          <HoverCardContent className="w-80 shadow-lg rounded-lg">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Activities</h4>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {activities?.slice(0, 10).map((activity) => (
                  <div key={activity.id} className="text-xs text-muted-foreground">
                    {activity.title}
                  </div>
                ))}
                {activities && activities.length > 10 && (
                  <div className="text-xs text-muted-foreground">... and {activities.length - 10} more</div>
                )}
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
        <HoverCard>
          <HoverCardTrigger asChild>
            <div>
              <StatCard
                title="Total Users"
                value={users?.length || 0}
                icon={Users}
                color="orange"
                trend="Active accounts"
              />
            </div>
          </HoverCardTrigger>
          <HoverCardContent className="w-80 shadow-lg rounded-lg">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Users</h4>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {users?.slice(0, 10).map((user) => (
                  <div key={user.id} className="text-xs text-muted-foreground">
                    {user.fullName} ({user.role})
                  </div>
                ))}
                {users && users.length > 10 && (
                  <div className="text-xs text-muted-foreground">... and {users.length - 10} more</div>
                )}
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
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
                  {logs?.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-muted/50">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Activity className="w-4 h-4 text-primary" />
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
                        <div className="flex justify-between items-center mt-1">
                          <p className="text-xs text-muted-foreground capitalize">
                            Action: {log.action.replace('_', ' ')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            By: {log.userFullName || 'Unknown'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
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
    </LayoutWrapper>
  );
}
