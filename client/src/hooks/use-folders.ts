import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertFolder } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useFolders(parentId: number | null = null) {
  return useQuery({
    queryKey: [api.folders.list.path, parentId],
    queryFn: async () => {
      const url = `${api.folders.list.path}?parentId=${parentId ?? 'null'}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch folders");
      return api.folders.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertFolder) => {
      const res = await fetch(api.folders.create.path, {
        method: api.folders.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) throw new Error("Failed to create folder");
      return api.folders.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.folders.list.path] });
      toast({ title: "Success", description: "Folder created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create folder", variant: "destructive" });
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
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to rename folder");
      return api.folders.rename.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.folders.list.path] });
      toast({ title: "Updated", description: "Folder renamed successfully" });
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.folders.delete.path, { id });
      const res = await fetch(url, { method: api.folders.delete.method });
      if (!res.ok) throw new Error("Failed to delete folder");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.folders.list.path] });
      toast({ title: "Deleted", description: "Folder deleted successfully" });
    },
  });
}
