import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertActivity } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

type CreateActivityInput = {
  data: InsertActivity;
  suppressSuccessToast?: boolean;
};

export function useActivities() {
  const { user, isLoggedOut, isSessionDeactivated } = useAuth();
  const isLoginPage = typeof window !== "undefined" && window.location.pathname === "/login";

  return useQuery({
    queryKey: [api.activities.list.path],
    queryFn: async () => {
      const res = await fetch(api.activities.list.path, { credentials: "include" });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to fetch activities");
      return api.activities.list.responses[200].parse(await res.json());
    },
    enabled: !!user && !isLoggedOut && !isSessionDeactivated && !isLoginPage,
    staleTime: 0, // Always fetch fresh data
    refetchInterval: user && !isLoggedOut && !isSessionDeactivated && !isLoginPage ? 5000 : false,
    retry: false,
  });
}

export function useCreateActivity() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    retry: false,
    mutationFn: async ({ data }: CreateActivityInput) => {
      const res = await fetch(api.activities.create.path, {
        method: api.activities.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "No response body" }));
        const msg = errorData?.message ?? String(errorData?.message ?? "Failed to create activity");
        return Promise.reject(new Error(msg));
      }
      return api.activities.create.responses[201].parse(await res.json());
    },
    onSuccess: (_createdActivity, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });
      if (!variables.suppressSuccessToast) {
        toast({ title: "Success", description: "Activity created" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteActivity() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    retry: false,
    mutationFn: async (id: number) => {
      const url = buildUrl(api.activities.delete.path, { id });
      const res = await fetch(url, { method: api.activities.delete.method });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return Promise.reject(new Error(data.message || "Failed to delete activity"));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });
      toast({ title: "Deleted", description: "Activity removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useLogs(enabled: boolean = true) {
  return useQuery({
    queryKey: [api.logs.list.path],
    queryFn: async () => {
      const res = await fetch(api.logs.list.path);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return api.logs.list.responses[200].parse(await res.json());
    },
    enabled,
    staleTime: 0, // Always fetch fresh data
    refetchInterval: enabled ? 5000 : false, // Poll every 5 seconds to check for new activity logs
  });
}

export function useDeleteAllLogs() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await fetch(api.logs.deleteAll.path, {
        method: api.logs.deleteAll.method,
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        return Promise.reject(new Error(error.message || "Failed to delete logs"));
      }
      return api.logs.deleteAll.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path] });
      toast({ title: "Deleted", description: "All activity logs have been deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteLog() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    retry: false,
    mutationFn: async (logId: number) => {
      const res = await fetch(buildUrl(api.logs.delete.path, { id: logId }), {
        method: api.logs.delete.method,
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        return Promise.reject(new Error(error.message || "Failed to delete log"));
      }
      return api.logs.delete.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path] });
      toast({ title: "Deleted", description: "Log removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useStartActivity() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    retry: false,
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/activities/${id}/start`, {
        method: "POST",
        credentials: 'include',
      });
      if (!res.ok) {
        const text = await res.text();
        try {
          const error = JSON.parse(text);
          return Promise.reject(new Error(error.message || "Failed to start activity"));
        } catch {
          return Promise.reject(new Error(text || "Failed to start activity"));
        }
      }
      // Fetch the updated activity and return it
      const activityRes = await fetch(api.activities.list.path);
      const activities = await activityRes.json();
      const updatedActivity = activities.find((a: any) => a.id === id);
      return updatedActivity;
    },
    onSuccess: (updatedActivity) => {
      queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });
      toast({ title: "Success", description: "Activity started" });
      return updatedActivity;
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateActivity() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    retry: false,
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: Partial<{ title: string; description: string; deadlineDate: Date; status: string; applyToSeries: boolean }>;
    }) => {
      const url = buildUrl(api.activities.update.path, { id });
      const res = await fetch(url, {
        method: api.activities.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return Promise.reject(new Error(data.message || "Failed to update activity"));
      }
      return api.activities.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });
      toast({ title: "Success", description: "Activity updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useCheckDeadlines() {
  const { toast } = useToast();

  return useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await fetch("/api/check-deadlines", {
        method: "POST",
        credentials: 'include',
      });
      if (!res.ok) {
        const text = await res.text();
        try {
          const error = JSON.parse(text);
          return Promise.reject(new Error(error.message || "Failed to check deadlines"));
        } catch {
          return Promise.reject(new Error(text || "Failed to check deadlines"));
        }
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Deadline check completed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
