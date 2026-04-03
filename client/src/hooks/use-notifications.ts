import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export function useNotifications() {
  const { user, isLoggedOut, isSessionDeactivated } = useAuth();
  const isLoginPage = typeof window !== "undefined" && window.location.pathname === "/login";

  return useQuery({
    queryKey: [api.notifications.list.path],
    queryFn: async () => {
      const res = await fetch(api.notifications.list.path, { credentials: 'include' });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return api.notifications.list.responses[200].parse(await res.json());
    },
    enabled: !!user && !isLoggedOut && !isSessionDeactivated && !isLoginPage,
    staleTime: 0,
    refetchInterval: user && !isLoggedOut && !isSessionDeactivated && !isLoginPage ? 5000 : false,
    retry: false,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    retry: false,
    mutationFn: async ({ userId, notificationId }: { userId: number; notificationId: number }) => {
      const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return Promise.reject(new Error(data.message || "Failed to mark notification as read"));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    retry: false,
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return Promise.reject(new Error(data.message || "Failed to delete notification"));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] });
      toast({ title: "Success", description: "Notification deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteAllNotifications() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await fetch('/api/notifications', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return Promise.reject(new Error(data.message || "Failed to delete all notifications"));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] });
      toast({ title: "Success", description: "All notifications deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
