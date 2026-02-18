import { LayoutWrapper } from "@/components/layout-wrapper";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSettings, useUserManagement, validatePasswordStrength } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, UserPlus, Trash2, Shield, ShieldAlert, Check, X, Eye, EyeOff, User, Lock, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

function SettingsContent() {
  const { user } = useAuth();
  const { currentUser, isLoadingUser, updateUsernameMutation, updatePasswordMutation } = useSettings();
  const { users, isLoadingUsers, createUserMutation, updateUserMutation, deleteUserMutation } = useUserManagement();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    role: "assistant" as "admin" | "assistant",
  });
  const [newUserErrors, setNewUserErrors] = useState<string[]>([]);

  const isAdmin = user?.role === "admin";

  // Update username
  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !username.trim()) {
      toast({ title: "Error", description: "Please enter a username", variant: "destructive" });
      return;
    }

    try {
      await updateUsernameMutation.mutateAsync({ userId: currentUser.id, username: username.trim() });
      setUsername("");
    } catch (error) {
      // Error handled in mutation
    }
  };

  // Update password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    // Validate password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.isValid) {
      setPasswordErrors(validation.errors);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordErrors(["Passwords do not match"]);
      return;
    }

    setPasswordErrors([]);

    try {
      await updatePasswordMutation.mutateAsync({
        userId: currentUser.id,
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      // Error handled in mutation
    }
  };

  // Handle new password change for validation
  const handleNewPasswordChange = (value: string) => {
    setNewPassword(value);
    if (value) {
      const validation = validatePasswordStrength(value);
      setPasswordErrors(validation.errors);
    } else {
      setPasswordErrors([]);
    }
  };

  // Create new user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: string[] = [];

    if (!newUserData.username.trim()) errors.push("Username is required");
    if (!newUserData.fullName.trim()) errors.push("Full name is required");
    if (!newUserData.password) errors.push("Password is required");
    
    const passwordValidation = validatePasswordStrength(newUserData.password);
    if (!passwordValidation.isValid) {
      errors.push(...passwordValidation.errors);
    }

    if (newUserData.password !== newUserData.confirmPassword) {
      errors.push("Passwords do not match");
    }

    if (errors.length > 0) {
      setNewUserErrors(errors);
      return;
    }

    setNewUserErrors([]);

    try {
      await createUserMutation.mutateAsync({
        username: newUserData.username.trim(),
        password: newUserData.password,
        fullName: newUserData.fullName.trim(),
        role: newUserData.role,
      });
      setIsCreateUserOpen(false);
      setNewUserData({
        username: "",
        password: "",
        confirmPassword: "",
        fullName: "",
        role: "assistant",
      });
    } catch (error) {
      // Error handled in mutation
    }
  };

  // Update user role
  const handleUpdateRole = async (userId: number, role: "admin" | "assistant") => {
    try {
      await updateUserMutation.mutateAsync({ userId, updates: { role } });
    } catch (error) {
      // Error handled in mutation
    }
  };

  // Delete user
  const handleDeleteUser = async (userId: number) => {
    try {
      await deleteUserMutation.mutateAsync(userId);
    } catch (error) {
      // Error handled in mutation
    }
  };

  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your account settings and user permissions</p>
        </div>
      </div>

      <Separator />

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-[400px]">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Security
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
          )}
        </TabsList>

        {/* Profile Tab - Change Username */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Information
              </CardTitle>
              <CardDescription>Update your personal information and username</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current User Info */}
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">{currentUser?.fullName?.charAt(0) || 'U'}</span>
                </div>
                <div>
                  <p className="text-lg font-medium">{currentUser?.fullName}</p>
                  <p className="text-muted-foreground">@{currentUser?.username}</p>
                  <Badge variant={currentUser?.role === "admin" ? "default" : "secondary"} className="mt-1">
                    {currentUser?.role === "admin" ? "Administrator" : "Assistant"}
                  </Badge>
                </div>
              </div>

              <Separator />

              {/* Change Username Form */}
              <form onSubmit={handleUpdateUsername} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="currentUsername">Current Username</Label>
                  <Input
                    id="currentUsername"
                    value={currentUser?.username || ""}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="newUsername">New Username</Label>
                  <Input
                    id="newUsername"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter new username"
                  />
                </div>
                <Button type="submit" disabled={updateUsernameMutation.isPending || !username.trim()} className="w-full sm:w-auto">
                  {updateUsernameMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Username
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab - Change Password */}
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Password Security
              </CardTitle>
              <CardDescription>Update your password to keep your account secure. Make sure to use a strong password.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => handleNewPasswordChange(e.target.value)}
                    placeholder="Enter new password"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <X className="h-3 w-3" />
                      Passwords do not match
                    </p>
                  )}
                </div>

                {/* Password Requirements */}
                <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                  <p className="text-sm font-medium">Password Requirements:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className={newPassword.length >= 8 ? "text-green-600" : "text-muted-foreground"}>
                      {newPassword.length >= 8 ? <Check className="inline h-3 w-3 mr-1" /> : <X className="inline h-3 w-3 mr-1" />}
                      At least 8 characters
                    </div>
                    <div className={/[A-Z]/.test(newPassword) ? "text-green-600" : "text-muted-foreground"}>
                      {/[A-Z]/.test(newPassword) ? <Check className="inline h-3 w-3 mr-1" /> : <X className="inline h-3 w-3 mr-1" />}
                      One uppercase letter
                    </div>
                    <div className={/[a-z]/.test(newPassword) ? "text-green-600" : "text-muted-foreground"}>
                      {/[a-z]/.test(newPassword) ? <Check className="inline h-3 w-3 mr-1" /> : <X className="inline h-3 w-3 mr-1" />}
                      One lowercase letter
                    </div>
                    <div className={/[0-9]/.test(newPassword) ? "text-green-600" : "text-muted-foreground"}>
                      {/[0-9]/.test(newPassword) ? <Check className="inline h-3 w-3 mr-1" /> : <X className="inline h-3 w-3 mr-1" />}
                      One number
                    </div>
                    <div className={/[!@#$%^&*(),.?\":{}|<>]/.test(newPassword) ? "text-green-600" : "text-muted-foreground"}>
                      {/[!@#$%^&*(),.?\":{}|<>]/.test(newPassword) ? <Check className="inline h-3 w-3 mr-1" /> : <X className="inline h-3 w-3 mr-1" />}
                      One special character
                    </div>
                  </div>
                </div>

                {/* Password Errors */}
                {passwordErrors.length > 0 && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <ul className="text-sm text-destructive space-y-1">
                      {passwordErrors.map((error, index) => (
                        <li key={index} className="flex items-center gap-1">
                          <X className="h-3 w-3" />
                          {error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <Button 
                  type="submit" 
                  disabled={
                    updatePasswordMutation.isPending || 
                    !currentPassword || 
                    !newPassword || 
                    !confirmPassword ||
                    passwordErrors.length > 0 ||
                    newPassword !== confirmPassword
                  }
                  className="w-full sm:w-auto"
                >
                  {updatePasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Password
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* User Management Tab (Admin Only) */}
        {isAdmin && (
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    User Management
                  </CardTitle>
                  <CardDescription>Manage user accounts, roles, and permissions</CardDescription>
                </div>
                <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add User
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New User</DialogTitle>
                      <DialogDescription>Add a new user to the system</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateUser} className="space-y-4">
                      {newUserErrors.length > 0 && (
                        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                          <ul className="text-sm text-destructive space-y-1">
                            {newUserErrors.map((error, index) => (
                              <li key={index}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="grid gap-2">
                        <Label htmlFor="newUsername">Username</Label>
                        <Input
                          id="newUsername"
                          value={newUserData.username}
                          onChange={(e) => setNewUserData({ ...newUserData, username: e.target.value })}
                          placeholder="Enter username"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="newFullName">Full Name</Label>
                        <Input
                          id="newFullName"
                          value={newUserData.fullName}
                          onChange={(e) => setNewUserData({ ...newUserData, fullName: e.target.value })}
                          placeholder="Enter full name"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="newUserRole">Role</Label>
                        <select
                          id="newUserRole"
                          value={newUserData.role}
                          onChange={(e) => setNewUserData({ ...newUserData, role: e.target.value as "admin" | "assistant" })}
                          className="w-full border border-input bg-background px-3 py-2 rounded-md"
                        >
                          <option value="assistant">Assistant</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="newPassword">Password</Label>
                        <Input
                          id="newPassword"
                          type="password"
                          value={newUserData.password}
                          onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                          placeholder="Enter password"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="newConfirmPassword">Confirm Password</Label>
                        <Input
                          id="newConfirmPassword"
                          type="password"
                          value={newUserData.confirmPassword}
                          onChange={(e) => setNewUserData({ ...newUserData, confirmPassword: e.target.value })}
                          placeholder="Confirm password"
                        />
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsCreateUserOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createUserMutation.isPending}>
                          {createUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Create User
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {isLoadingUsers ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {users?.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="font-medium text-primary">{user.fullName?.charAt(0) || 'U'}</span>
                            </div>
                            <div>
                              <p className="font-medium">{user.fullName}</p>
                              <p className="text-sm text-muted-foreground">@{user.username}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                              {user.role === "admin" ? (
                                <><ShieldAlert className="mr-1 h-3 w-3" /> Admin</>
                              ) : (
                                <><Shield className="mr-1 h-3 w-3" /> Assistant</>
                              )}
                            </Badge>
                            <Badge variant="outline">
                              {user.status}
                            </Badge>
                            {user.id !== currentUser?.id && (
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUpdateRole(user.id, user.role === "admin" ? "assistant" : "admin")}
                                  disabled={updateUserMutation.isPending}
                                >
                                  {user.role === "admin" ? "Remove Admin" : "Make Admin"}
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm" disabled={deleteUserMutation.isPending}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete User</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete {user.fullName}? This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeleteUser(user.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <LayoutWrapper>
      <SettingsContent />
    </LayoutWrapper>
  );
}
