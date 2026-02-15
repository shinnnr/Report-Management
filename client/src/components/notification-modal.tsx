import { useState } from "react";
import { useNotifications, useMarkNotificationRead, useDeleteNotification } from "@/hooks/use-notifications";
import { formatDistanceToNow, format } from "date-fns";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Check, X } from "lucide-react";
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

  const handleNotificationClick = (notification: any) => {
    markReadMutation.mutate(notification.id);
    if (notification.content.includes('activity')) {
      setLocation('/calendar');
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader className="pb-4 flex-shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span>All Notifications</span>
          </DialogTitle>
          <DialogDescription>
            View and manage all your notifications. Select notifications to delete them.
          </DialogDescription>
        </DialogHeader>

        {isAdmin && selectedNotifications.length > 0 && (
          <div className="flex justify-end pb-4 flex-shrink-0">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSelected}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete Selected ({selectedNotifications.length})
            </Button>
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-4 pr-4 pb-4">
            {notifications && notifications.length > 0 ? (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors ${
                    !notification.isRead ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1" onClick={() => handleNotificationClick(notification)}>
                      <h4 className={`text-sm font-medium ${!notification.isRead ? 'font-semibold' : 'font-normal'}`}>
                        {notification.title}
                      </h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {notification.content}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>Type: {notification.activityId ? 'Activity' : 'System'}</span>
                        <span>{notification.createdAt ? format(new Date(notification.createdAt), 'MMM d, yyyy h:mm a') : 'Unknown'}</span>
                        <span>{notification.createdAt ? formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true }) : 'Unknown'}</span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          notification.isRead ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {notification.isRead ? 'Read' : 'Unread'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {!notification.isRead && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => user?.id && markReadMutation.mutate({ userId: user.id, notificationId: notification.id })}
                          disabled={markReadMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}

                      {isAdmin && (
                        <>
                          <input
                            type="checkbox"
                            checked={selectedNotifications.includes(notification.id)}
                            onChange={() => toggleSelection(notification.id)}
                            className="rounded"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(notification.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No notifications found.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}