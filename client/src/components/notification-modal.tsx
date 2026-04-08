import { useState } from "react";
import { useNotifications, useMarkNotificationRead, useDeleteNotification, useDeleteAllNotifications } from "@/hooks/use-notifications";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
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

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationModal({ isOpen, onClose }: NotificationModalProps) {
  const { user } = useAuth();
  const { data: notifications } = useNotifications();
  const markReadMutation = useMarkNotificationRead();
  const deleteMutation = useDeleteNotification();
  const deleteAllMutation = useDeleteAllNotifications();
  const [, setLocation] = useLocation();

  const [currentPage, setCurrentPage] = useState(1);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        setCurrentPage(1);
      }
      onClose();
    }}>
      <DialogContent className="flex max-h-[80vh] max-w-none flex-col sm:max-w-lg">
        <DialogHeader className="pb-4 shrink-0">
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>All Notifications</span>
            {notifications && notifications.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowDeleteAllConfirm(true)}
                disabled={deleteAllMutation.isPending}
                className="rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Delete all notifications"
                title="Delete all notifications"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
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

        <div className="mt-2 shrink-0 py-2">
          <div className="flex min-h-9 w-full items-center justify-between gap-2">
            <span className="whitespace-nowrap text-sm text-muted-foreground">
              {notifications && notifications.length >= notificationsPerPage ? (
                <>Page {currentPage} of {Math.ceil(notifications.length / notificationsPerPage)}</>
              ) : ""}
            </span>
            {notifications && notifications.length >= notificationsPerPage ? (
              <div className="flex shrink-0 gap-1">
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
              </div>
            ) : (
              <div className="min-h-9" />
            )}
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={showDeleteAllConfirm} onOpenChange={setShowDeleteAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Notifications</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete all notifications? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAllMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (event) => {
                event.preventDefault();
                await deleteAllMutation.mutateAsync();
                setCurrentPage(1);
                setShowDeleteAllConfirm(false);
              }}
              disabled={deleteAllMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAllMutation.isPending ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
