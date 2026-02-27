import { useState } from "react";
import { useNotifications, useMarkNotificationRead, useDeleteNotification } from "@/hooks/use-notifications";
import { formatDistanceToNow, format } from "date-fns";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Check, X } from "lucide-react";
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
  const [, setLocation] = useLocation();

  const [selectedNotifications, setSelectedNotifications] = useState<number[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState<number | null>(null);

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
    setNotificationToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (notificationToDelete) {
      deleteMutation.mutate(notificationToDelete);
    }
    setShowDeleteConfirm(false);
    setNotificationToDelete(null);
  };

  const handleDeleteSelected = () => {
    if (selectedNotifications.length > 0) {
      setNotificationToDelete(null);
      setShowDeleteConfirm(true);
    }
  };

  const handleConfirmDeleteSelected = () => {
    selectedNotifications.forEach(id => deleteMutation.mutate(id));
    setSelectedNotifications([]);
    setShowDeleteConfirm(false);
    setNotificationToDelete(null);
  };

  const toggleSelection = (id: number) => {
    setSelectedNotifications(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const isAdmin = user?.role === 'admin';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>All Notifications</span>
            {isAdmin && selectedNotifications.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={deleteMutation.isPending}
                className="mr-2"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Selected ({selectedNotifications.length})
              </Button>
            )}
          </DialogTitle>
          <DialogDescription className="text-left">
            View and manage all your notifications. Select notifications to delete them.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] max-h-[500px]">
          <div className="space-y-4 pr-4 pb-4">
            {notifications && notifications.length > 0 ? (
              notifications.map((notification) => (
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
                      <p className="text-sm text-muted-foreground mt-1 break-words">
                        {notification.content}
                      </p>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Type: {notification.activityId ? 'Activity' : 'System'}</span>
                        <span>{notification.createdAt ? format(new Date(notification.createdAt), 'MMM d, yyyy h:mm a') : 'Unknown'}</span>
                        <span className={`px-2 py-1 rounded text-xs ${notification.isRead ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}`}>
                          {notification.isRead ? 'Read' : 'Unread'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      {isAdmin && (
                        <input
                          type="checkbox"
                          checked={selectedNotifications.includes(notification.id)}
                          onChange={() => toggleSelection(notification.id)}
                          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity rounded w-4 h-4"
                        />
                      )}
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
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              {notificationToDelete 
                ? "Are you sure you want to delete this notification? This action cannot be undone."
                : `Are you sure you want to delete ${selectedNotifications.length} notification(s)? This action cannot be undone.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={notificationToDelete ? handleConfirmDelete : handleConfirmDeleteSelected}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}