import { createContext, ReactNode, useContext, useState, useEffect, useRef } from "react";
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
const AUTH_STORAGE_KEY = "authUser";

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

export function useUser(isLoginPage: boolean = false) {
  const queryClient = useQueryClient();
  const wasOnLoginPage = useRef(isLoginPage);

  // Track if we just logged in - if so, we need to refetch even if on login page
  const [forceRefetch, setForceRefetch] = useState(false);

  useEffect(() => {
    // Listen for login success event
    const handler = () => {
      setForceRefetch(true);
    };
    window.addEventListener("auth-updated", handler);
    return () => window.removeEventListener("auth-updated", handler);
  }, []);

  // Determine if query should run
  const shouldRunQuery = !isLoginPage || wasOnLoginPage.current || forceRefetch;

  // After first successful fetch when we were on login page, update the ref
  useEffect(() => {
    if (!isLoginPage && wasOnLoginPage.current) {
      wasOnLoginPage.current = false;
      setForceRefetch(false);
    }
  }, [isLoginPage]);

  return useQuery({
    queryKey: [api.auth.me.path, isLoginPage, forceRefetch],
    queryFn: async () => {
      const res = await fetch(api.auth.me.path, { credentials: "include" });
      if (res.status === 401) {
        // Check if user was deactivated
        const data = await res.json().catch(() => ({}));
        if (data.deactivated) {
          // Get current session timestamp from localStorage
          const sessionTimestamp = localStorage.getItem("userSessionTimestamp");

          // Store deactivation with both session and current timestamps
          const deactivationData = {
            message: data.message || "Your account has been deactivated by the administrator.",
            timestamp: Date.now(),
            sessionTimestamp: sessionTimestamp,
          };
          localStorage.setItem("userDeactivated", JSON.stringify(deactivationData));

          // Dispatch custom event for deactivation - but keep user logged in
          window.dispatchEvent(new CustomEvent("user-deactivated", { detail: deactivationData.message }));

          // Return cached user data instead to stay logged in
          const cachedUser =
            queryClient.getQueryData<User | null>([api.auth.me.path]) ?? getStoredUser();
          return cachedUser ?? null;
        }

        setStoredUser(null);
        return null;
      }
      if (!res.ok) {
        const error = new Error("Failed to fetch user");
        error.name = "AuthError"; // Mark as auth error to suppress console error
        throw error;
      }

      const parsedUser = api.auth.me.responses[200].parse(await res.json());
      setStoredUser(parsedUser);
      return parsedUser;
    },
    enabled: shouldRunQuery,
    initialData: () => getStoredUser(),
    retry: false,
    staleTime: 30000, // Cache user data for 30 seconds to prevent rapid refetches
    throwOnError: (error) => {
      // Don't throw on auth errors to suppress console errors
      return error.name === "AuthError" ? false : true;
    },
    // Poll every 5 seconds to detect role changes from other sessions
    refetchInterval: () => (isLoginPage ? false : 5000),
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
        credentials: "include",
        body: JSON.stringify(credentials),
      });

      if (!res.ok) {
        if (res.status === 401) {
          const data = await res.json().catch(() => ({}));
          // Check if account is deactivated
          if (data.message && data.message.includes("deactivated")) {
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
    mutationFn: async () => {
      const res = await fetch(api.auth.logout.path, {
        method: api.auth.logout.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Logout failed");
    },
    onSuccess: () => {
      // Clear deactivation flags from localStorage
      localStorage.removeItem("userDeactivated");
      localStorage.removeItem("deactivatedMessage");
      setStoredUser(null);
      queryClient.setQueryData([api.auth.me.path], null);
      resetTheme();
      toast({ title: "Logged out", description: "See you next time!" });
    },
  });
}

export function AuthProvider({ children, isLoginPage = false }: { children: ReactNode; isLoginPage?: boolean }) {
  const { data: user, isLoading, error, refetch } = useUser(isLoginPage);
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
