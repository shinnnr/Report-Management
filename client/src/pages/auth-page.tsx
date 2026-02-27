import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
import { useTheme } from "@/contexts/theme-context";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

import neecoBanner from "@assets/NEECO_banner_1770341682188.png";

export default function AuthPage() {
  const { user, loginMutation } = useAuth();
  const { theme, resetTheme } = useTheme();
  const [showPassword, setShowPassword] = useState(false);

  // Force light mode on auth page
  useEffect(() => {
    // Store current theme to restore after unmount
    const currentTheme = theme;
    // Force light mode
    document.documentElement.classList.remove("dark");
    sessionStorage.setItem("theme-preference", "light");

    // Restore on unmount
    return () => {
      if (currentTheme === "dark") {
        document.documentElement.classList.add("dark");
        sessionStorage.setItem("theme-preference", "dark");
      }
    };
  }, []);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  function onSubmit(values: z.infer<typeof loginSchema>) {
    loginMutation.mutate(values);
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Top: Branding - visible on mobile at top, on desktop at left */}
      <div className="flex flex-col justify-between bg-primary p-8 lg:p-12 text-white relative overflow-hidden order-1 min-h-[100vh]">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80')] opacity-10 bg-cover bg-center" />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/80 to-transparent" />
        
        <div className="relative z-10 flex flex-col text-center lg:text-start">
          <div className="mb-6">
            <img src={neecoBanner} alt="NEECO Banner" className="h-16 lg:h-20 w-auto rounded-lg shadow-lg" />
          </div>
          <h1 className="text-2xl lg:text-4xl font-display font-bold mb-4">Report Management System</h1>
          <p className="text-sm lg:text-lg opacity-80 max-w-md">
            Streamline your workflow, organize reports, and track activities with our comprehensive management solution.
          </p>
        </div>
        
        <div className="relative z-10 text-xs lg:text-sm opacity-60">
          © {new Date().getFullYear()} RMS Inc. Secure & Encrypted.
        </div>
      </div>

      {/* Bottom: Login Form */}
      <div className="flex items-center justify-center p-8 bg-gray-50 order-2 min-h-[100vh]">
        <Card className="w-full max-w-lg border-2 border-gray-200 shadow-lg bg-white mx-4">
          <CardHeader className="space-y-1 px-8">
            <CardTitle className="text-3xl font-display font-bold text-primary">Welcome back</CardTitle>
            <CardDescription className="text-base">
              Enter your credentials to access your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel htmlFor="username" className="text-gray-900">Username</FormLabel>
                      <FormControl>
                        <Input
                          id="username"
                          placeholder="Enter Username"
                          autoComplete="username"
                          {...field}
                          className={`h-12 text-base ${fieldState.error ? 'border-red-500 focus:border-red-500' : ''}`}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel htmlFor="password" className="text-gray-900">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter Password"
                            autoComplete="current-password"
                            {...field}
                            className="h-12 text-base pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-medium shadow-lg shadow-primary/20 hover:shadow-xl transition-all" 
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
