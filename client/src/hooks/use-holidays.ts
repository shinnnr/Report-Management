import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { type InsertHoliday } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useHolidays() {
  return useQuery({
    queryKey: [api.holidays.list.path],
    queryFn: async () => {
      const res = await fetch(api.holidays.list.path);
      if (!res.ok) throw new Error("Failed to fetch holidays");
      return api.holidays.list.responses[200].parse(await res.json());
    },
    staleTime: 0,
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateHoliday() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    retry: false,
    mutationFn: async (data: InsertHoliday) => {
      const res = await fetch(api.holidays.create.path, {
        method: api.holidays.create.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Failed to create holiday" }));
        return Promise.reject(new Error(errorData?.message ?? "Failed to create holiday"));
      }
      return api.holidays.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.holidays.list.path] });
      toast({ title: "Success", description: "Holiday created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateHoliday() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    retry: false,
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertHoliday> }) => {
      const url = api.holidays.update.path.replace(':id', id.toString());
      const res = await fetch(url, {
        method: api.holidays.update.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return Promise.reject(new Error(data.message || "Failed to update holiday"));
      }
      return api.holidays.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.holidays.list.path] });
      toast({ title: "Success", description: "Holiday updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteHoliday() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    retry: false,
    mutationFn: async (id: number) => {
      const url = api.holidays.delete.path.replace(':id', id.toString());
      const res = await fetch(url, {
        method: api.holidays.delete.method,
        credentials: 'include'
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return Promise.reject(new Error(data.message || "Failed to delete holiday"));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.holidays.list.path] });
      toast({ title: "Deleted", description: "Holiday removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}