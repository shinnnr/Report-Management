import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertActivity } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useActivities() {
  return useQuery({
    queryKey: [api.activities.list.path],
    queryFn: async () => {
      const res = await fetch(api.activities.list.path);
      if (!res.ok) throw new Error("Failed to fetch activities");
      return api.activities.list.responses[200].parse(await res.json());
    },
    staleTime: 0, // Always fetch fresh data
    refetchInterval: 10000, // Poll every 10 seconds to check for new activities
  });
}

export function useCreateActivity() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertActivity) => {
      const res = await fetch(api.activities.create.path, {
        method: api.activities.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create activity");
      return api.activities.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });
      toast({ title: "Success", description: "Activity created" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create activity", variant: "destructive" });
    },
  });
}

export function useDeleteActivity() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.activities.delete.path, { id });
      const res = await fetch(url, { method: api.activities.delete.method });
      if (!res.ok) throw new Error("Failed to delete activity");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });
      toast({ title: "Deleted", description: "Activity removed" });
    },
  });
}

export function useLogs() {
  return useQuery({
    queryKey: [api.logs.list.path],
    queryFn: async () => {
      const res = await fetch(api.logs.list.path);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return api.logs.list.responses[200].parse(await res.json());
    },
    staleTime: 0, // Always fetch fresh data
    refetchInterval: 5000, // Poll every 5 seconds to check for new activity logs
  });
}
