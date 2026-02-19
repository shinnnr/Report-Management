import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertReport } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useReports(folderId?: number | "root", status: string = 'active') {
  return useQuery({
    queryKey: [api.reports.list.path, folderId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (folderId) params.append("folderId", folderId.toString());
      if (status) params.append("status", status);

      const url = `${api.reports.list.path}?${params.toString()}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch reports");
      return api.reports.list.responses[200].parse(await res.json());
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    refetchOnMount: false, // Don't refetch on mount if cached
    refetchOnWindowFocus: false,
  });
}

export function useCreateReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertReport) => {
      const res = await fetch(api.reports.create.path, {
        method: api.reports.create.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      
      if (!res.ok) throw new Error("Failed to upload report");
      return api.reports.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.reports.list.path] });
      toast({ title: "Success", description: "File uploaded successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to upload file", variant: "destructive" });
    },
  });
}

export function useMoveReports() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { reportIds: number[]; folderId: number | null }) => {
      const res = await fetch(api.reports.move.path, {
        method: api.reports.move.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to move reports");
      return api.reports.move.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.reports.list.path] });
      toast({ title: "Success", description: "Files moved successfully" });
    },
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.reports.delete.path, { id });
      const res = await fetch(url, { method: api.reports.delete.method, credentials: 'include' });
      if (!res.ok) throw new Error("Failed to delete report");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.reports.list.path] });
      toast({ title: "Deleted", description: "File deleted successfully" });
    },
  });
}

export function useUpdateReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertReport>) => {
      const url = buildUrl(api.reports.update.path, { id });
      const res = await fetch(url, {
        method: api.reports.update.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update report");
      return api.reports.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      // Update the cache immediately for all folder queries
      queryClient.setQueriesData({ queryKey: [api.reports.list.path] }, (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        return old.map((report: any) => {
          if (report.id === data.id) {
            return { ...report, ...data };
          }
          return report;
        });
      });
      queryClient.invalidateQueries({ queryKey: [api.reports.list.path] });
      toast({ title: "Success", description: "File renamed successfully" });
    },
  });
}
