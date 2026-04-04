import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insertUserSchema, type User, type InsertUser } from "@shared/schema";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/theme-context";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: ReturnType<typeof useLoginMutation>;
  logoutMutation: ReturnType<typeof useLogoutMutation>;
  refetchUser: () => void;
  isLoggedOut: boolean;
  isSessionDeactivated: boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);
const AUTH_STORAGE_KEY = "authUser";

// Global flag to track logout state
let isLoggedOut = false;
let isSessionDeactivated = false;

function getStoredUser(): User | null {
  try {
    const storedUser = localStorage.getItem(AUTH_STORAGE_KEY);
    return storedUser ? (JSON.parse(storedUser) as User) : null;
  } catch {
    return null;
  }
}

function setStoredUser(user: User | null) {
  if (user) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    return;
  }

  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function notifyUserDeactivated(message: string) {
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent("user-deactivated", { detail: message }));
  }, 0);
}

export function useUser() {
  const queryClient = useQueryClient();
  const isLoginPage = typeof window !== "undefined" && window.location.pathname === "/login";
  const storedUser = getStoredUser();

  return useQuery({
    queryKey: [api.auth.me.path],
    queryFn: async () => {
      try {
        const res = await fetch(api.auth.me.path, { credentials: "include" });
        const data = await res.json().catch(() => ({}));

        if (data?.deactivated) {
          isSessionDeactivated = true;
          await queryClient.cancelQueries({ queryKey: [api.notifications.list.path] });
          await queryClient.cancelQueries({ queryKey: [api.folders.list.path] });
          await queryClient.cancelQueries({ queryKey: [api.reports.list.path] });
          await queryClient.cancelQueries({ queryKey: [api.reports.count.path] });
          await queryClient.cancelQueries({ queryKey: [api.activities.list.path] });
          const sessionTimestamp = localStorage.getItem("userSessionTimestamp");
          const deactivationData = {
            message: data.message || "Your account has been deactivated by the administrator.",
            timestamp: Date.now(),
            sessionTimestamp: sessionTimestamp,
          };
          localStorage.setItem("userDeactivated", JSON.stringify(deactivationData));
          notifyUserDeactivated(deactivationData.message);
          const cachedUser =
            queryClient.getQueryData<User | null>([api.auth.me.path]) ?? getStoredUser();
          return cachedUser ?? null;
        }

        if (res.status === 401) {
          if (data.deactivated) {
            isSessionDeactivated = true;
            await queryClient.cancelQueries({ queryKey: [api.notifications.list.path] });
            await queryClient.cancelQueries({ queryKey: [api.folders.list.path] });
            await queryClient.cancelQueries({ queryKey: [api.reports.list.path] });
            await queryClient.cancelQueries({ queryKey: [api.reports.count.path] });
            await queryClient.cancelQueries({ queryKey: [api.activities.list.path] });
            const sessionTimestamp = localStorage.getItem("userSessionTimestamp");
            const deactivationData = {
              message: data.message || "Your account has been deactivated by the administrator.",
              timestamp: Date.now(),
              sessionTimestamp: sessionTimestamp,
            };
            localStorage.setItem("userDeactivated", JSON.stringify(deactivationData));
            notifyUserDeactivated(deactivationData.message);
            const cachedUser =
              queryClient.getQueryData<User | null>([api.auth.me.path]) ?? getStoredUser();
            return cachedUser ?? null;
          }
          setStoredUser(null);
          return null;
        }
        if (!res.ok) {
          throw new Error("Failed to fetch user");
        }
        const parsedUser = api.auth.me.responses[200].parse(data);
        isSessionDeactivated = false;
        setStoredUser(parsedUser);
        return parsedUser;
      } catch (e) {
        if (e instanceof Error && e.name === "AuthError") {
          return null;
        }
        throw e;
      }
    },
    initialData: () => storedUser,
    enabled: !!storedUser && !isLoggedOut,
    retry: false,
    staleTime: 30000,
    refetchInterval: (data) => {
      if (!data || isLoggedOut || isLoginPage || isSessionDeactivated) return false;
      return 5000;
    },
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    retry: false,
    mutationFn: async (credentials: Pick<InsertUser, "username" | "password">) => {
      const res = await fetch(api.auth.login.path, {
        method: api.auth.login.method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(credentials),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error("Login failed");
      }

      if (data?.authenticated === false) {
        if (data?.deactivated) {
          throw new Error(data.message || "Your account has been deactivated. Please contact the administrator.");
        }
        throw new Error("Invalid username or password");
      }

      if (data?.deactivated) {
        throw new Error(data.message || "Your account has been deactivated. Please contact the administrator.");
      }
      return api.auth.login.responses[200].parse(data) as User;
    },
    onSuccess: (user) => {
      // Reset logout flag on successful login
      isLoggedOut = false;
      isSessionDeactivated = false;

      queryClient.setQueryData([api.auth.me.path], user);
      setStoredUser(user);
      // Set session timestamp on successful login
      localStorage.setItem("userSessionTimestamp", Date.now().toString());
      toast({ title: "Welcome back!", description: `Logged in as ${user.fullName}` });
      // Trigger auth update event
      window.dispatchEvent(new CustomEvent("auth-updated"));
    },
    onError: (error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { resetTheme } = useTheme();

  return useMutation({
    retry: false,
    onMutate: async () => {
      isLoggedOut = true;
      await queryClient.cancelQueries();
    },
    mutationFn: async () => {
      const res = await fetch(api.auth.logout.path, {
        method: api.auth.logout.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Logout failed");
    },
    onError: () => {
      isLoggedOut = false;
    },
    onSuccess: () => {
      // Set global logout flag to prevent further polling
      isLoggedOut = true;
      isSessionDeactivated = false;

      // Clear deactivation flags from localStorage
      localStorage.removeItem("userDeactivated");
      localStorage.removeItem("deactivatedMessage");
      setStoredUser(null);

      // Clear all queries from cache to stop polling and prevent 401 errors
      queryClient.clear();

      resetTheme();
      toast({ title: "Logged out", description: "See you next time!" });
    },
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error, refetch } = useUser();
  const loginMutation = useLoginMutation();
  const logoutMutation = useLogoutMutation();

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error: error as Error | null,
        loginMutation,
        logoutMutation,
        refetchUser: () => refetch(),
        isLoggedOut,
        isSessionDeactivated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
