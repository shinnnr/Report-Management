import { useState } from "react";
import { useNotifications, useMarkNotificationRead, useDeleteNotification } from "@/hooks/use-notifications";
import { formatDistanceToNow, format } from "date-fns";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationModal({ isOpen, onClose }: NotificationModalProps) {
  const { user } = useAuth();
  const { data: notifications } = useNotifications();
  const markReadMutation = useMarkNotificationRead();
  const deleteMutation = useDeleteNotification();
  const [, setLocation] = useLocation();

  const [selectedNotifications, setSelectedNotifications] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const notificationsPerPage = 10;

  const handleNotificationClick = (notification: any) => {
    if (user?.id) {
      markReadMutation.mutate({ userId: user.id, notificationId: notification.id });
    }
    if (notification.content.includes('activity') || notification.activityId) {
      const activityId = notification.activityId;
      if (activityId) {
        setLocation(`/calendar?activityId=${activityId}`);
      } else {
        setLocation('/calendar');
      }
    }
    onClose();
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
  };

  const handleDeleteSelected = () => {
    selectedNotifications.forEach(id => deleteMutation.mutate(id));
    setSelectedNotifications([]);
  };

  const toggleSelection = (id: number) => {
    setSelectedNotifications(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const isAdmin = user?.role === 'admin';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        setCurrentPage(1);
        setSelectedNotifications([]);
      }
      onClose();
    }}>
      <DialogContent className="max-w-lg flex flex-col max-h-[80vh]">
        <DialogHeader className="pb-4 shrink-0">
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>All Notifications</span>
          </DialogTitle>
          <DialogDescription className="text-left">
            View and manage all your notifications. Select notifications to delete them.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4 pr-4 pb-4">
            {notifications && notifications.length > 0 ? (
              notifications
                .slice((currentPage - 1) * notificationsPerPage, currentPage * notificationsPerPage)
                .map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border cursor-pointer hover:bg-muted transition-colors group ${
                    !notification.isRead ? 'bg-primary/10 border-primary/20' : 'bg-card border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Checkbox
                      checked={selectedNotifications.includes(notification.id)}
                      onCheckedChange={() => toggleSelection(notification.id)}
                      className="flex-shrink-0 mt-1"
                    />
                    <div className="flex-1 min-w-0" onClick={() => handleNotificationClick(notification)}>
                      <h4 className={`text-sm font-medium ${!notification.isRead ? 'font-semibold' : 'font-normal'} text-foreground`}>
                        {notification.title}
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1 break-words whitespace-pre-wrap">
                        {notification.content}
                      </p>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Type: {notification.activityId ? 'Activity' : 'System'}</span>
                        <span>{notification.createdAt ? format(new Date(notification.createdAt), 'MMM d, yyyy h:mm a') : 'Unknown'}</span>
                        <span className={`px-2 py-1 rounded text-xs self-start sm:self-auto ${notification.isRead ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}`}>
                          {notification.isRead ? 'Read' : 'Unread'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <button
                        onClick={() => handleDelete(notification.id)}
                        disabled={deleteMutation.isPending}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-1.5 hover:bg-destructive/20 rounded text-destructive hover:text-destructive"
                        title="Delete notification"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No notifications found.</p>
              </div>
            )}
          </div>
        </ScrollArea>

          {/* Pagination Controls and Delete Selected - fixed at bottom */}
          <div className="mt-2 flex min-h-[88px] shrink-0 flex-col items-start justify-between gap-2 border-t py-2 sm:min-h-[56px] sm:flex-row sm:items-center sm:gap-0">
            <div className="flex items-center gap-2">
              {notifications && notifications.length >= notificationsPerPage && (
                <>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {Math.ceil(notifications.length / notificationsPerPage)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(notifications.length / notificationsPerPage), p + 1))}
                    disabled={currentPage >= Math.ceil(notifications.length / notificationsPerPage)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
            <div className="flex min-h-9 items-center gap-4">
              <span
                className={`text-sm text-muted-foreground ${
                  selectedNotifications.length > 0 ? "" : "invisible"
                }`}
              >
                {selectedNotifications.length > 0 ? `${selectedNotifications.length} selected` : "0 selected"}
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={selectedNotifications.length === 0 || deleteMutation.isPending}
                className={selectedNotifications.length > 0 ? "" : "invisible pointer-events-none"}
              >
                Delete Selected
              </Button>
            </div>
          </div>
      </DialogContent>
    </Dialog>
  );
}
