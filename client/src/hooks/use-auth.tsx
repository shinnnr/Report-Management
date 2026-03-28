import { createContext, ReactNode, useContext } from "react";
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
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useUser() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: [api.auth.me.path],
    queryFn: async () => {
      const res = await fetch(api.auth.me.path, { credentials: 'include' });
      if (res.status === 401) {
        // Check if user was deactivated
        const data = await res.json().catch(() => ({}));
        if (data.deactivated) {
          // Store in localStorage so the modal shows before user becomes null
          localStorage.setItem('userDeactivated', 'true');
          localStorage.setItem('deactivatedMessage', data.message || "Your account has been deactivated by the administrator.");
          // Dispatch custom event for deactivation - don't clear user data yet
          window.dispatchEvent(new CustomEvent('user-deactivated', { detail: data.message }));
        }
        // Return null to indicate auth failure
        return null;
      }
      if (!res.ok) {
        const error = new Error("Failed to fetch user");
        error.name = "AuthError"; // Mark as auth error to suppress console error
        throw error;
      }
      return api.auth.me.responses[200].parse(await res.json());
    },
    retry: false,
    staleTime: 30000, // Cache user data for 30 seconds to prevent rapid refetches
    throwOnError: (error) => {
      // Don't throw on auth errors to suppress console errors
      return error.name === "AuthError" ? false : true;
    },
    // Poll every 5 seconds to detect role changes from other sessions
    refetchInterval: 5000,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (credentials: Pick<InsertUser, "username" | "password">) => {
      const res = await fetch(api.auth.login.path, {
        method: api.auth.login.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });

      if (!res.ok) {
        if (res.status === 401) {
          const data = await res.json().catch(() => ({}));
          // Check if account is deactivated
          if (data.message && data.message.includes('deactivated')) {
            throw new Error(data.message);
          }
          throw new Error("Invalid username or password");
        }
        throw new Error("Login failed");
      }
      return api.auth.login.responses[200].parse(await res.json());
    },
    onSuccess: (user) => {
      queryClient.setQueryData([api.auth.me.path], user);
      toast({ title: "Welcome back!", description: `Logged in as ${user.fullName}` });
    },
    onError: (error) => {
      toast({ 
        title: "Login failed", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { resetTheme } = useTheme();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(api.auth.logout.path, {
        method: api.auth.logout.method,
        credentials: 'include',
      });
      if (!res.ok) throw new Error("Logout failed");
    },
    onSuccess: () => {
      // Clear deactivation flags from localStorage
      localStorage.removeItem('userDeactivated');
      localStorage.removeItem('deactivatedMessage');
      queryClient.setQueryData([api.auth.me.path], null);
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
