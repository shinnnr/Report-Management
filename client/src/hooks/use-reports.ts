import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertReport } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useReports(folderId?: number | "root", status: string = 'active', refetchInterval?: number) {
  return useQuery({
    queryKey: [api.reports.list.path, folderId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (folderId) params.append("folderId", folderId.toString());
      if (status) params.append("status", status);

      const url = `${api.reports.list.path}?${params.toString()}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Failed to fetch reports: ${res.status} - ${errorText}`);
      }
      return api.reports.list.responses[200].parse(await res.json());
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    refetchOnMount: false, // Don't refetch on mount if cached
    refetchOnWindowFocus: false,
    refetchInterval: refetchInterval,
    retry: 3, // Retry up to 3 times on failure
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });
}

export function useReportsCount(folderId?: number | "root", status: string = 'active') {
  return useQuery({
    queryKey: [api.reports.count.path, folderId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (folderId) params.append("folderId", folderId.toString());
      if (status) params.append("status", status);

      const url = `${api.reports.count.path}?${params.toString()}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Failed to fetch reports count: ${res.status} - ${errorText}`);
      }
      const data = api.reports.count.responses[200].parse(await res.json());
      return data.count;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 3,
  });
}

export function useCreateReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertReport & { _suppressToast?: boolean }) => {
      const res = await fetch(api.reports.create.path, {
        method: api.reports.create.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      
      if (!res.ok) throw new Error("Failed to upload report");
      return api.reports.create.responses[201].parse(await res.json());
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.reports.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.reports.count.path] });
      // Also invalidate folder queries in case new Year/Month folders were created
      queryClient.invalidateQueries({ queryKey: [api.folders.list.path] });
      // Only show toast if _suppressToast is not true
      if (!variables._suppressToast) {
        toast({ title: "Success", description: "File uploaded successfully" });
      }
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
    mutationFn: async ({ reportIds, folderId, suppressToast }: { reportIds: number[]; folderId: number | null; suppressToast?: boolean }) => {
      const res = await fetch(api.reports.move.path, {
        method: api.reports.move.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ reportIds, folderId }),
      });
      if (!res.ok) throw new Error("Failed to move reports");
      return { ...await api.reports.move.responses[200].parse(await res.json()), suppressToast };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.reports.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.reports.count.path] });
      if (!data?.suppressToast) {
        toast({ title: "Success", description: "Files moved successfully" });
      }
    },
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, suppressToast }: { id: number; suppressToast?: boolean }) => {
      const url = buildUrl(api.reports.delete.path, { id });
      const res = await fetch(url, { method: api.reports.delete.method, credentials: 'include' });
      if (!res.ok) throw new Error("Failed to delete report");
      return { suppressToast };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.reports.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.reports.count.path] });
      if (!data?.suppressToast) {
        toast({ title: "Deleted", description: "File deleted successfully" });
      }
    },
  });
}

export function useUpdateReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, suppressToast, ...updates }: { id: number; suppressToast?: boolean } & Partial<InsertReport>) => {
      const url = buildUrl(api.reports.update.path, { id });
      const res = await fetch(url, {
        method: api.reports.update.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update report");
      return { ...api.reports.update.responses[200].parse(await res.json()), suppressToast };
    },
    onSuccess: (data, variables) => {
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
      queryClient.invalidateQueries({ queryKey: [api.reports.count.path] });
      // Force refetch to update dashboard and other views immediately
      queryClient.refetchQueries({ queryKey: [api.reports.list.path] });

      // Show toast for restore action only if not suppressed
      if (variables.status === 'active' && !data?.suppressToast) {
        toast({ title: "Restored", description: "File restored successfully" });
      }
    },
  });
}
