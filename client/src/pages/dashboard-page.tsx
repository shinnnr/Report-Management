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
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {activities?.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-4 p-4 rounded-lg bg-muted/30 border border-muted/50">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {activity.userFullName?.substring(0, 2).toUpperCase() || 'AC'}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <p className="font-medium text-sm text-foreground">{activity.description || 'No description'}</p>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(activity.createdAt!), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 capitalize">
                          Status: {activity.status}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          By: {activity.userFullName}
                        </p>
                      </div>
                    </div>
                  ))}
                  {!activities?.length && (
                    <div className="text-center py-10 text-muted-foreground">
                      No recent activities found.
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
