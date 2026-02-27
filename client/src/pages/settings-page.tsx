import { LayoutWrapper, useSidebar } from "@/components/layout-wrapper";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSettings, useUserManagement } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserPlus, Trash2, Shield, ShieldAlert, X, Eye, EyeOff, User, Lock, Users, Settings, Menu } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

function SettingsContent() {
  const { user } = useAuth();
  const { openSidebar } = useSidebar();
  const isMobile = useIsMobile();
  const { currentUser, isLoadingUser, updateUsernameMutation, updatePasswordMutation } = useSettings();
  const { users, isLoadingUsers, createUserMutation, updateUserMutation, deleteUserMutation } = useUserManagement();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");

  // Initialize username and fullName with current user's values
  useEffect(() => {
    if (currentUser) {
      setUsername(currentUser.username || "");
      setFullName(currentUser.fullName || "");
    }
  }, [currentUser]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCreateUserPassword, setShowCreateUserPassword] = useState(false);
  const [showCreateUserConfirmPassword, setShowCreateUserConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    role: "assistant" as "admin" | "assistant",
  });

  const isAdmin = user?.role === "admin";

  // Mobile user dialog state
  const [selectedUserForDialog, setSelectedUserForDialog] = useState<any>(null);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);

  // User search and pagination state
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userCurrentPage, setUserCurrentPage] = useState(1);
  const usersPerPage = 10;

  // Sort users: current logged-in user first
  const sortedUsers = useMemo(() => {
    if (!users) return [];
    return [...users].sort((a, b) => {
      if (a.id === currentUser?.id) return -1;
      if (b.id === currentUser?.id) return 1;
      return 0;
    });
  }, [users, currentUser]);

  // Filter users based on search query
  const filteredUsers = useMemo(() => {
    if (!sortedUsers) return [];
    if (!userSearchQuery.trim()) return sortedUsers;
    const query = userSearchQuery.toLowerCase();
    return sortedUsers.filter(
      (user) =>
        user.fullName?.toLowerCase().includes(query) ||
        user.username?.toLowerCase().includes(query)
    );
  }, [sortedUsers, userSearchQuery]);

  // Calculate total pages
  const totalUserPages = Math.ceil(filteredUsers.length / usersPerPage);

  // Paginate filtered users
  const paginatedUsers = useMemo(() => {
    const startIndex = (userCurrentPage - 1) * usersPerPage;
    return filteredUsers.slice(startIndex, startIndex + usersPerPage);
  }, [filteredUsers, userCurrentPage, usersPerPage]);

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

  // Update full name
  const handleUpdateFullName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !fullName.trim()) {
      toast({ title: "Error", description: "Please enter a name", variant: "destructive" });
      return;
    }

    try {
      await updateUserMutation.mutateAsync({ 
        userId: currentUser.id, 
        updates: { fullName: fullName.trim() } 
      });
      setFullName("");
    } catch (error) {
      // Error handled in mutation
    }
  };

  // Update password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    // Validate password length only (at least 8 characters)
    if (newPassword.length < 8) {
      setPasswordError("");
      toast({ title: "Error", description: "Password must be at least 8 characters long", variant: "destructive" });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("");
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }

    setPasswordError("");

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

  // Create new user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate fields in order and show first error only
    if (!newUserData.username.trim()) {
      toast({ title: "Error", description: "Username is required", variant: "destructive" });
      return;
    }
    if (!newUserData.fullName.trim()) {
      toast({ title: "Error", description: "Full name is required", variant: "destructive" });
      return;
    }
    if (!newUserData.password) {
      toast({ title: "Error", description: "Password is required", variant: "destructive" });
      return;
    }
    if (newUserData.password.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters long", variant: "destructive" });
      return;
    }
    if (newUserData.password !== newUserData.confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-primary mb-2 flex items-center gap-2">
            {isMobile ? (
              <button 
                type="button" 
                onClick={(e) => {
                  e.stopPropagation();
                  openSidebar();
                }} 
                className="p-1 hover:bg-muted rounded-md transition-colors cursor-pointer"
                aria-label="Open menu"
              >
                <Menu className="w-8 h-8" />
              </button>
            ) : (
              <Settings className="w-8 h-8" />
            )}
            Settings
          </h1>
          <p className="text-muted-foreground text-sm lg:text-base">
            {isAdmin ? "Manage your account settings and user permissions" : "Manage your account settings"}
          </p>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
        <TabsList className={`grid w-full ${isAdmin ? "grid-cols-3" : "grid-cols-2"} max-w-[400px]`}>
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

        {/* Profile Tab - Change Username and Full Name */}
        <TabsContent value="profile" className="space-y-4">
          <Card className="border border-gray-200 dark:border-gray-800 shadow-lg">
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
                  <p className="text-lg font-medium truncate max-w-[150px]">{currentUser?.fullName}</p>
                  <p className="text-muted-foreground">@{currentUser?.username}</p>
                  <Badge variant={currentUser?.role === "admin" ? "default" : "secondary"} className="mt-1">
                    {currentUser?.role === "admin" ? "Administrator" : "Assistant"}
                  </Badge>
                </div>
              </div>

              {/* Change Full Name Form */}
              <form onSubmit={handleUpdateFullName} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="currentFullName">Name</Label>
                  <Input
                    id="currentFullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your name"
                  />
                </div>
                <Button type="submit" disabled={updateUserMutation.isPending || fullName.trim() === currentUser?.fullName?.trim()} className="">
                  {updateUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Name
                </Button>
              </form>

              {/* Change Username Form */}
              <form onSubmit={handleUpdateUsername} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="currentUsername">Username</Label>
                  <Input
                    id="currentUsername"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                  />
                </div>
                <Button type="submit" disabled={updateUsernameMutation.isPending || username.trim() === currentUser?.username?.trim()} className="">
                  {updateUsernameMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Username
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab - Change Password */}
        <TabsContent value="security" className="space-y-4">
          <Card className="border border-gray-200 dark:border-gray-800 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Password Security
              </CardTitle>
              <CardDescription>Update your password to keep your account secure.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
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
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 8 characters)"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>

                {/* Password Error - now shown via toast, kept for mutation errors */}
                {passwordError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <X className="h-3 w-3" />
                      {passwordError}
                    </p>
                  </div>
                )}

                <Button 
                  type="submit" 
                  disabled={
                    updatePasswordMutation.isPending || 
                    !currentPassword || 
                    !newPassword || 
                    !confirmPassword
                  }
                  className=""
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
            <Card className="border border-gray-200 dark:border-gray-800 shadow-lg overflow-hidden">
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <Users className="h-5 w-5" />
                    User Management
                  </CardTitle>
                  <CardDescription className="text-sm">Manage user accounts, roles, and permissions</CardDescription>
                </div>
                <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="text-xs sm:text-sm">
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
                      <div className="grid gap-2">
                        <Label htmlFor="newUsername">Username</Label>
                        <Input
                          id="newUsername"
                          name="newUsername"
                          value={newUserData.username}
                          onChange={(e) => setNewUserData({ ...newUserData, username: e.target.value })}
                          placeholder="Enter username"
                          autoComplete="username"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="newFullName">Full Name</Label>
                        <Input
                          id="newFullName"
                          name="newFullName"
                          value={newUserData.fullName}
                          onChange={(e) => setNewUserData({ ...newUserData, fullName: e.target.value })}
                          placeholder="Enter full name"
                          autoComplete="name"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="newUserRole">Role</Label>
                        <Select
                          value={newUserData.role}
                          onValueChange={(value) => setNewUserData({ ...newUserData, role: value as "admin" | "assistant" })}
                          name="newUserRole"
                        >
                          <SelectTrigger id="newUserRole">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="assistant">Assistant</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="newPassword">Password</Label>
                        <div className="relative">
                          <Input
                            id="newPassword"
                            name="newPassword"
                            type={showCreateUserPassword ? "text" : "password"}
                            value={newUserData.password}
                            onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                            placeholder="Enter password (min 8 characters)"
                            className="pr-10"
                            autoComplete="new-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowCreateUserPassword(!showCreateUserPassword)}
                          >
                            {showCreateUserPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="newConfirmPassword">Confirm Password</Label>
                        <div className="relative">
                          <Input
                            id="newConfirmPassword"
                            name="newConfirmPassword"
                            type={showCreateUserConfirmPassword ? "text" : "password"}
                            value={newUserData.confirmPassword}
                            onChange={(e) => setNewUserData({ ...newUserData, confirmPassword: e.target.value })}
                            placeholder="Confirm password"
                            className="pr-10"
                            autoComplete="new-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowCreateUserConfirmPassword(!showCreateUserConfirmPassword)}
                          >
                            {showCreateUserConfirmPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsCreateUserOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={
                            createUserMutation.isPending ||
                            !newUserData.username.trim() ||
                            !newUserData.fullName.trim() ||
                            !newUserData.password ||
                            !newUserData.confirmPassword
                          }
                        >
                          {createUserMutation.isPending ? "Creating..." : "Create User"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {/* Search Input */}
                <div className="mb-4">
                  <Input
                    placeholder="Search users by name or username..."
                    value={userSearchQuery}
                    onChange={(e) => {
                      setUserSearchQuery(e.target.value);
                      setUserCurrentPage(1); // Reset to first page when searching
                    }}
                    name="userSearch"
                    id="userSearch"
                    className="max-w-sm"
                  />
                </div>
                {isLoadingUsers ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-12 border-t">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                      <Users className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No users found</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {paginatedUsers.map((user) => (
                        <div
                          key={user.id}
                          className={`flex flex-wrap items-start justify-between p-4 border rounded-lg transition-colors cursor-pointer md:cursor-auto gap-3 ${
                            user.id === currentUser?.id 
                              ? "bg-primary/10 border-primary/30 dark:bg-primary/20" 
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => {
                            if (isMobile) {
                              setSelectedUserForDialog(user);
                              setIsUserDialogOpen(true);
                            }
                          }}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="font-medium text-primary">{user.fullName?.charAt(0) || 'U'}</span>
                            </div>
                            <div>
                              <p className="font-medium truncate max-w-[150px]">{user.fullName}{user.id === currentUser?.id && " (You)"}</p>
                              <p className="text-sm text-muted-foreground">@{user.username}</p>
                            </div>
                          </div>
                          <div className="hidden md:flex items-center gap-3">
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

                  {/* Pagination controls - only show when more than 10 users */}
                  {filteredUsers.length > usersPerPage && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <span className="text-sm text-muted-foreground">
                        Showing {Math.min((userCurrentPage - 1) * usersPerPage + 1, filteredUsers.length)} to {Math.min(userCurrentPage * usersPerPage, filteredUsers.length)} of {filteredUsers.length} users
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setUserCurrentPage(p => Math.max(1, p - 1))}
                          disabled={userCurrentPage === 1}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setUserCurrentPage(p => Math.min(totalUserPages, p + 1))}
                          disabled={userCurrentPage >= totalUserPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
            </CardContent>
          </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Mobile User Details Dialog */}
      <Dialog open={isUserDialogOpen && isMobile} onOpenChange={setIsUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8 text-left truncate max-w-[150px]">
              <User className="w-5 h-5 flex-shrink-0" />
              {selectedUserForDialog?.fullName}
            </DialogTitle>
            <DialogDescription className="sr-only">
              User details and actions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Username</span>
              <span className="font-medium">@{selectedUserForDialog?.username}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Role</span>
              <Badge variant={selectedUserForDialog?.role === "admin" ? "default" : "secondary"}>
                {selectedUserForDialog?.role === "admin" ? (
                  <><ShieldAlert className="mr-1 h-3 w-3" /> Admin</>
                ) : (
                  <><Shield className="mr-1 h-3 w-3" /> Assistant</>
                )}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline">
                {selectedUserForDialog?.status}
              </Badge>
            </div>
          </div>
          {selectedUserForDialog?.id !== currentUser?.id && (
            <DialogFooter className="flex-row justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  handleUpdateRole(selectedUserForDialog.id, selectedUserForDialog.role === "admin" ? "assistant" : "admin");
                  setIsUserDialogOpen(false);
                }}
                disabled={updateUserMutation.isPending}
              >
                {selectedUserForDialog?.role === "admin" ? "Remove Admin" : "Make Admin"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deleteUserMutation.isPending}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete User</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete {selectedUserForDialog?.fullName}? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        handleDeleteUser(selectedUserForDialog?.id);
                        setIsUserDialogOpen(false);
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
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
