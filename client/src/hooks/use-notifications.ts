import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useNotifications() {
  return useQuery({
    queryKey: [api.notifications.list.path],
    queryFn: async () => {
      const res = await fetch(api.notifications.list.path, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return api.notifications.list.responses[200].parse(await res.json());
    },
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(api.notifications.markRead.path.replace(':id', id.toString()), {
        method: api.notifications.markRead.method,
        credentials: 'include',
      });
      if (!res.ok) throw new Error("Failed to mark notification as read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to mark notification as read", variant: "destructive" });
    },
  });
}