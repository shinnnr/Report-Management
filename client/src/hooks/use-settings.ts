import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { User } from "@shared/schema";

export function useSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser, isLoading: isLoadingUser } = useAuth();

  // Update username mutation
  const updateUsernameMutation = useMutation({
    retry: false,
    mutationFn: async ({ userId, username }: { userId: number; username: string }) => {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        const error = await res.json();
        return Promise.reject(new Error(error.message || "Failed to update username"));
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
      queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
      toast({ title: "Username updated", description: "Your username has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Update profile picture mutation
  const updateProfilePictureMutation = useMutation({
    retry: false,
    mutationFn: async ({ userId, profilePicture }: { userId: number; profilePicture: string | null }) => {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ profilePicture }),
      });
      if (!res.ok) {
        const error = await res.json();
        return Promise.reject(new Error(error.message || "Failed to update profile picture"));
      }
      return api.users.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      // Update the current user cache immediately
      queryClient.setQueryData([api.auth.me.path], (old: User | null) => {
        if (old) return { ...old, profilePicture: data.profilePicture };
        return old;
      });
      queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.auth.me.path] });
      toast({ title: "Profile picture updated", description: "Your profile picture has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Update password mutation
  const updatePasswordMutation = useMutation({
    retry: false,
    mutationFn: async ({ userId, currentPassword, newPassword }: { userId: number; currentPassword: string; newPassword: string }) => {
      const res = await fetch(`/api/users/${userId}/password`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const error = await res.json();
        return Promise.reject(new Error(error.message || "Failed to update password"));
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
    updateProfilePictureMutation,
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
    retry: false,
    mutationFn: async (data: { username: string; password: string; fullName: string; role: "admin" | "cps" | "ets" }) => {
      const res = await fetch(api.users.create.path, {
        method: api.users.create.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        return Promise.reject(new Error(error.message || "Failed to create user"));
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
    retry: false,
    mutationFn: async ({ userId, updates }: { userId: number; updates: { username?: string; fullName?: string; role?: "admin" | "cps" | "ets"; status?: "active" | "inactive" } }) => {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const error = await res.json();
        return Promise.reject(new Error(error.message || "Failed to update user"));
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
    retry: false,
    mutationFn: async (userId: number) => {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        return Promise.reject(new Error(error.message || "Failed to delete user"));
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

export function useSystemSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Helper function to get setting value
  const getSetting = async (key: string): Promise<boolean> => {
    const res = await fetch(`/api/settings/${key}`, { credentials: 'include' });
    if (!res.ok) {
      if (res.status === 404) {
        return true;
      }
      throw new Error("Failed to fetch setting");
    }
    const data = await res.json();
    return data.value === 'true';
  };

  // Setting queries
  const allowNonAdminFileManagementQuery = useQuery({
    queryKey: ['settings', 'allow_non_admin_file_management'],
    queryFn: () => getSetting('allow_non_admin_file_management'),
    staleTime: Infinity,
  });

  const allowNonAdminActivityDeleteQuery = useQuery({
    queryKey: ['settings', 'allow_non_admin_activity_delete'],
    queryFn: () => getSetting('allow_non_admin_activity_delete'),
    staleTime: Infinity,
  });

  const allowNonAdminHolidayAddQuery = useQuery({
    queryKey: ['settings', 'allow_non_admin_holiday_add'],
    queryFn: () => getSetting('allow_non_admin_holiday_add'),
    staleTime: Infinity,
  });

  // Current values from queries
  const allowNonAdminFileManagement = allowNonAdminFileManagementQuery.data ?? true;
  const allowNonAdminActivityDelete = allowNonAdminActivityDeleteQuery.data ?? true;
  const allowNonAdminHolidayAdd = allowNonAdminHolidayAddQuery.data ?? true;

  // Convenience mutations for each setting
  const updateAllowNonAdminFileManagement = useMutation({
    retry: false,
    mutationFn: async (value: boolean) => {
      const res = await fetch(api.settings.set.path, {
        method: api.settings.set.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ key: 'allow_non_admin_file_management', value: value.toString() }),
      });
      if (!res.ok) {
        const error = await res.json();
        return Promise.reject(new Error(error.message || "Failed to update setting"));
      }
      return api.settings.set.responses[200].parse(await res.json());
    },
    onMutate: async (value: boolean) => {
      await queryClient.cancelQueries({ queryKey: ['settings', 'allow_non_admin_file_management'] });
      const previous = queryClient.getQueryData<boolean>(['settings', 'allow_non_admin_file_management']);
      queryClient.setQueryData(['settings', 'allow_non_admin_file_management'], value);
      return { previous };
    },
    onError: (error: Error, _value, context: { previous: boolean | undefined } | undefined) => {
      if (context) {
        queryClient.setQueryData(['settings', 'allow_non_admin_file_management'], context.previous);
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Setting updated", description: "File management permission has been updated." });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'allow_non_admin_file_management'] });
    },
  });

  const updateAllowNonAdminActivityDelete = useMutation({
    retry: false,
    mutationFn: async (value: boolean) => {
      const res = await fetch(api.settings.set.path, {
        method: api.settings.set.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ key: 'allow_non_admin_activity_delete', value: value.toString() }),
      });
      if (!res.ok) {
        const error = await res.json();
        return Promise.reject(new Error(error.message || "Failed to update setting"));
      }
      return api.settings.set.responses[200].parse(await res.json());
    },
    onMutate: async (value: boolean) => {
      await queryClient.cancelQueries({ queryKey: ['settings', 'allow_non_admin_activity_delete'] });
      const previous = queryClient.getQueryData<boolean>(['settings', 'allow_non_admin_activity_delete']);
      queryClient.setQueryData(['settings', 'allow_non_admin_activity_delete'], value);
      return { previous };
    },
    onError: (error: Error, _value, context: { previous: boolean | undefined } | undefined) => {
      if (context) {
        queryClient.setQueryData(['settings', 'allow_non_admin_activity_delete'], context.previous);
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Setting updated", description: "Activity deletion permission has been updated." });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'allow_non_admin_activity_delete'] });
    },
  });

  const updateAllowNonAdminHolidayAdd = useMutation({
    retry: false,
    mutationFn: async (value: boolean) => {
      const res = await fetch(api.settings.set.path, {
        method: api.settings.set.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ key: 'allow_non_admin_holiday_add', value: value.toString() }),
      });
      if (!res.ok) {
        const error = await res.json();
        return Promise.reject(new Error(error.message || "Failed to update setting"));
      }
      return api.settings.set.responses[200].parse(await res.json());
    },
    onMutate: async (value: boolean) => {
      await queryClient.cancelQueries({ queryKey: ['settings', 'allow_non_admin_holiday_add'] });
      const previous = queryClient.getQueryData<boolean>(['settings', 'allow_non_admin_holiday_add']);
      queryClient.setQueryData(['settings', 'allow_non_admin_holiday_add'], value);
      return { previous };
    },
    onError: (error: Error, _value, context: { previous: boolean | undefined } | undefined) => {
      if (context) {
        queryClient.setQueryData(['settings', 'allow_non_admin_holiday_add'], context.previous);
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
    onSuccess: () => {
      // Also invalidate holidays query in case holiday management was disabled
      queryClient.invalidateQueries({ queryKey: [api.holidays.list.path] });
      toast({ title: "Setting updated", description: "Holiday management permission has been updated." });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'allow_non_admin_holiday_add'] });
    },
  });

  return {
    // Current values
    allowNonAdminFileManagement,
    allowNonAdminActivityDelete,
    allowNonAdminHolidayAdd,

    // Loading states
    isLoadingAllowNonAdminFileManagement: allowNonAdminFileManagementQuery.isLoading,
    isLoadingAllowNonAdminActivityDelete: allowNonAdminActivityDeleteQuery.isLoading,
    isLoadingAllowNonAdminHolidayAdd: allowNonAdminHolidayAddQuery.isLoading,

    // Update mutations
    updateAllowNonAdminFileManagement,
    updateAllowNonAdminActivityDelete,
    updateAllowNonAdminHolidayAdd,
  };
}

type UseSystemSettingsPollingOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

// Hook to poll for system settings changes and update queries in real-time
export function useSystemSettingsPolling(options?: UseSystemSettingsPollingOptions) {
  const queryClient = useQueryClient();
  const lastSettingsRef = useRef<{
    allowNonAdminFileManagement?: boolean;
    allowNonAdminActivityDelete?: boolean;
    allowNonAdminHolidayAdd?: boolean;
  }>({});

  const { data: currentSettings } = useQuery({
    queryKey: ['system-settings-polling'],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const [fileManagement, activityDelete, holidayAdd] = await Promise.all([
        fetch(`/api/settings/allow_non_admin_file_management`).then(r => r.ok ? r.json().then(d => d.value === 'true') : true).catch(() => true),
        fetch(`/api/settings/allow_non_admin_activity_delete`).then(r => r.ok ? r.json().then(d => d.value === 'true') : true).catch(() => true),
        fetch(`/api/settings/allow_non_admin_holiday_add`).then(r => r.ok ? r.json().then(d => d.value === 'true') : true).catch(() => true),
      ]);

      return {
        allowNonAdminFileManagement: fileManagement,
        allowNonAdminActivityDelete: activityDelete,
        allowNonAdminHolidayAdd: holidayAdd,
      };
    },
    refetchInterval: options?.refetchInterval ?? 5000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (currentSettings) {
      const lastSettings = lastSettingsRef.current;

      // Check if any settings changed
      const settingsChanged =
        lastSettings.allowNonAdminFileManagement !== currentSettings.allowNonAdminFileManagement ||
        lastSettings.allowNonAdminActivityDelete !== currentSettings.allowNonAdminActivityDelete ||
        lastSettings.allowNonAdminHolidayAdd !== currentSettings.allowNonAdminHolidayAdd;

      if (settingsChanged) {
        // Invalidate relevant queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['settings'] });
        queryClient.invalidateQueries({ queryKey: [api.holidays.list.path] });

        // Update last settings
        lastSettingsRef.current = { ...currentSettings };
      }
    }
  }, [currentSettings, queryClient]);

  return currentSettings;
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
