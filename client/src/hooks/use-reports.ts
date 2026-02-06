import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertReport } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useReports(folderId?: number, status: string = 'active') {
  return useQuery({
    queryKey: [api.reports.list.path, folderId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (folderId) params.append("folderId", folderId.toString());
      if (status) params.append("status", status);
      
      const url = `${api.reports.list.path}?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch reports");
      return api.reports.list.responses[200].parse(await res.json());
    },
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

export function useDeleteReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.reports.delete.path, { id });
      const res = await fetch(url, { method: api.reports.delete.method });
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
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update report");
      return api.reports.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.reports.list.path] });
      toast({ title: "Updated", description: "File updated successfully" });
    },
  });
}
