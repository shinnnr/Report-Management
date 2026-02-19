import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";

export function useSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get current user data
  const { data: currentUser, isLoading: isLoadingUser } = useQuery({
    queryKey: [api.auth.me.path],
    queryFn: async () => {
      const res = await fetch(api.auth.me.path, { credentials: 'include' });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return api.auth.me.responses[200].parse(await res.json());
    },
  });

  // Update username mutation
  const updateUsernameMutation = useMutation({
    mutationFn: async ({ userId, username }: { userId: number; username: string }) => {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update username");
      }
      return api.users.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      // Update the current user cache immediately
      queryClient.setQueryData([api.auth.me.path], (old: User | null) => {
        if (old) return { ...old, username: data.username };
        return old;
      });
      queryClient.invalidateQueries({ queryKey: [api.auth.me.path] });
      toast({ title: "Username updated", description: "Your username has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Update password mutation
  const updatePasswordMutation = useMutation({
    mutationFn: async ({ userId, currentPassword, newPassword }: { userId: number; currentPassword: string; newPassword: string }) => {
      const res = await fetch(`/api/users/${userId}/password`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update password");
      }
      return api.users.updatePassword.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      toast({ title: "Password updated", description: "Your password has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return {
    currentUser,
    isLoadingUser,
    updateUsernameMutation,
    updatePasswordMutation,
  };
}

export function useUserManagement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get all users (Admin only)
  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: [api.users.list.path],
    queryFn: async () => {
      const res = await fetch(api.users.list.path, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch users");
      return api.users.list.responses[200].parse(await res.json());
    },
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; fullName: string; role: "admin" | "assistant" }) => {
      const res = await fetch(api.users.create.path, {
        method: api.users.create.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create user");
      }
      return api.users.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
      toast({ title: "User created", description: "New user has been created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: number; updates: { username?: string; fullName?: string; role?: "admin" | "assistant"; status?: "active" | "inactive" } }) => {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update user");
      }
      return api.users.update.responses[200].parse(await res.json());
    },
    onSuccess: (data, variables) => {
      // Update the current user cache immediately if fullName was updated
      if (variables.updates.fullName) {
        queryClient.setQueryData([api.auth.me.path], (old: User | null) => {
          if (old) return { ...old, fullName: variables.updates.fullName };
          return old;
        });
      }
      queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.auth.me.path] });
      toast({ title: "User updated", description: "User has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete user");
      }
      return api.users.delete.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
      toast({ title: "User deleted", description: "User has been deleted successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return {
    users,
    isLoadingUsers,
    createUserMutation,
    updateUserMutation,
    deleteUserMutation,
  };
}

// Password strength validator
export function validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }
  if (!/[!@#$%^&*(),.?\":{}|<>]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}
