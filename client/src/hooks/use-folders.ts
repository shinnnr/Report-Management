import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertFolder } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useFolders(parentId: number | null | 'all' = null, status: string = 'active', refetchInterval?: number) {
  return useQuery({
    queryKey: [api.folders.list.path, parentId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (parentId === 'all') {
        params.append('parentId', 'all');
      } else if (parentId !== null) {
        params.append('parentId', parentId.toString());
      }
      if (status) params.append('status', status);

      const url = `${api.folders.list.path}?${params.toString()}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Failed to fetch folders: ${res.status} - ${errorText}`);
      }
      return api.folders.list.responses[200].parse(await res.json());
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

export function useCreateFolder(currentParentId: number | null = null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertFolder) => {
      const res = await fetch(api.folders.create.path, {
        method: api.folders.create.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ ...data, parentId: data.parentId || currentParentId }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create folder");
      }
      return api.folders.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.folders.list.path] });
      toast({ title: "Success", description: "Folder created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useRenameFolder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const url = buildUrl(api.folders.rename.path, { id });
      const res = await fetch(url, {
        method: api.folders.rename.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to rename folder");
      }
      return api.folders.rename.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.folders.list.path] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useMoveFolder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, targetParentId, suppressToast }: { id: number; targetParentId: number | null; suppressToast?: boolean }) => {
      const url = buildUrl(api.folders.move.path, { id });
      const res = await fetch(url, {
        method: api.folders.move.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ targetParentId }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to move folder");
      }
      return { ...await api.folders.move.responses[200].parse(await res.json()), suppressToast };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.folders.list.path] });
      if (!data?.suppressToast) {
        toast({ title: "Moved", description: "Folder moved successfully" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, suppressToast }: { id: number; suppressToast?: boolean }) => {
      const url = buildUrl(api.folders.delete.path, { id });
      const res = await fetch(url, { method: api.folders.delete.method, credentials: 'include' });
      if (!res.ok) throw new Error("Failed to delete folder");
      return { suppressToast };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.folders.list.path] });
      if (!data?.suppressToast) {
        toast({ title: "Deleted", description: "Folder deleted successfully" });
      }
    },
  });
}

export function useUpdateFolder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<InsertFolder>) => {
      const url = buildUrl(api.folders.update.path, { id });
      const res = await fetch(url, {
        method: api.folders.update.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update folder");
      return api.folders.update.responses[200].parse(await res.json());
    },
    onSuccess: (data, variables) => {
      // Update the cache immediately for all folder queries
      queryClient.setQueriesData({ queryKey: [api.folders.list.path] }, (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        return old.map((folder: any) => {
          if (folder.id === data.id) {
            return { ...folder, ...data };
          }
          return folder;
        });
      });
      
      // Invalidate all folder queries to refresh both archives and drive views
      queryClient.invalidateQueries({ queryKey: [api.folders.list.path] });
      
      // Also invalidate all report queries in case restored folders contain files
      queryClient.invalidateQueries({ queryKey: [api.reports.list.path] });
      
      // Determine the message based on what's being updated
      if (variables.status === 'active') {
        toast({ title: "Restored", description: "Folder restored successfully" });
      } else if (variables.name) {
        toast({ title: "Success", description: "Folder renamed successfully" });
      }
    },
  });
}
