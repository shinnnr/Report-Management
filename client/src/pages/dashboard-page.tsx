import { LayoutWrapper } from "@/components/layout-wrapper";
import { StatCard } from "@/components/stat-card";
import { Folder, FileText, Clock, AlertCircle, Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useFolders } from "@/hooks/use-folders";
import { useReports } from "@/hooks/use-reports";
import { useActivities, useLogs } from "@/hooks/use-activities";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: folders } = useFolders(null);
  const { data: reports } = useReports();
  const { data: activities } = useActivities();
  const { data: logs } = useLogs();

  const pendingActivities = activities?.filter(a => a.status === 'pending').length || 0;
  const overdueActivities = activities?.filter(a => a.status === 'overdue').length || 0;

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
        <StatCard
          title="Total Folders"
          value={folders?.length || 0}
          icon={Folder}
          color="primary"
          trend="Root directories"
        />
        <StatCard
          title="Total Files"
          value={reports?.length || 0}
          icon={FileText}
          color="secondary"
          trend="Across all folders"
        />
        <StatCard
          title="Pending Tasks"
          value={pendingActivities}
          icon={Clock}
          color="accent"
          trend={`${activities?.length || 0} total activities`}
          trendClassName="text-accent"
        />
        <StatCard
          title="Overdue"
          value={overdueActivities}
          icon={AlertCircle}
          color="orange"
          trend="Action required"
        />
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
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Action</th>
                      <th className="px-4 py-3 text-left font-medium">Description</th>
                      <th className="px-4 py-3 text-left font-medium">User</th>
                      <th className="px-4 py-3 text-left font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {logs?.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">
                            {log.action.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{log.description}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-bold text-primary">
                                {log.userFullName?.substring(0, 2).toUpperCase() || 'U'}
                              </span>
                            </div>
                            <span className="text-sm">{log.userFullName || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {format(new Date(log.timestamp!), 'MMM d, h:mm a')}
                        </td>
                      </tr>
                    ))}
                    {!logs?.length && (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                          No recent system activity found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Used</span>
                  <span className="font-medium">45%</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-accent w-[45%]" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Using 4.5GB of 10GB allocated storage.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </LayoutWrapper>
  );
}
