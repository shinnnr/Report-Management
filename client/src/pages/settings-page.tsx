import { LayoutWrapper, useSidebar } from "@/components/layout-wrapper";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSettings, useUserManagement, useSystemSettings } from "@/hooks/use-settings";
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
import { Switch } from "@/components/ui/switch";
import { Loader2, UserPlus, Trash2, Shield, ShieldAlert, X, Eye, EyeOff, User, Lock, Users, Settings, Menu, Clock, ChevronLeft, ChevronRight, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCheckDeadlines } from "@/hooks/use-activities";

function SettingsContent() {
  const { user } = useAuth();
  const { openSidebar, isSidebarOpen } = useSidebar();
  const isMobile = useIsMobile();
  const { currentUser, updateUsernameMutation, updatePasswordMutation, updateProfilePictureMutation } = useSettings();
  const { users, createUserMutation, updateUserMutation, deleteUserMutation } = useUserManagement();
  const {
    allowNonAdminFileManagement,
    allowNonAdminActivityDelete,
    allowNonAdminHolidayAdd,
    updateAllowNonAdminFileManagement,
    updateAllowNonAdminActivityDelete,
    updateAllowNonAdminHolidayAdd,
  } = useSystemSettings();
  const { toast } = useToast();
  const checkDeadlines = useCheckDeadlines();

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [isUpdatingFullName, setIsUpdatingFullName] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

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

  // Optimized click handlers to prevent performance warnings
  const toggleCurrentPassword = useCallback(() => {
    setShowCurrentPassword(prev => !prev);
  }, []);

  const toggleNewPassword = useCallback(() => {
    setShowNewPassword(prev => !prev);
  }, []);

  const toggleConfirmPassword = useCallback(() => {
    setShowConfirmPassword(prev => !prev);
  }, []);
  const [showCreateUserPassword, setShowCreateUserPassword] = useState(false);
  const [showCreateUserConfirmPassword, setShowCreateUserConfirmPassword] = useState(false);

  const toggleCreateUserPassword = useCallback(() => {
    setShowCreateUserPassword(prev => !prev);
  }, []);

  const toggleCreateUserConfirmPassword = useCallback(() => {
    setShowCreateUserConfirmPassword(prev => !prev);
  }, []);
  const [passwordError, setPasswordError] = useState("");
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isUploadingProfilePicture, setIsUploadingProfilePicture] = useState(false);
  const [isRemovingProfilePicture, setIsRemovingProfilePicture] = useState(false);
  const [newUserData, setNewUserData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    role: "" as "admin" | "cps" | "ets",
  });

  const isAdmin = user?.role === "admin";

  // Mobile user dialog state
  const [selectedUserForDialog, setSelectedUserForDialog] = useState<any>(null);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [changingRoleUserId, setChangingRoleUserId] = useState<{ userId: number; role: string } | null>(null);

  // User search and pagination state
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userCurrentPage, setUserCurrentPage] = useState(1);
  const usersPerPage = 10;
  const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(null);



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

  useEffect(() => {
    if (!selectedUserForDialog || !users) return;

    const updatedSelectedUser = users.find(user => user.id === selectedUserForDialog.id);
    if (updatedSelectedUser) {
      setSelectedUserForDialog(updatedSelectedUser);
    }
  }, [users, selectedUserForDialog]);

  // Update username
  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !username.trim()) {
      toast({ title: "Error", description: "Please enter a username", variant: "destructive" });
      return;
    }

    setIsUpdatingUsername(true);
    try {
      await updateUsernameMutation.mutateAsync({ userId: currentUser.id, username: username.trim() });
      setUsername("");
    } catch (error) {
      // Error handled in mutation
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  // Update full name
  const handleUpdateFullName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !fullName.trim()) {
      toast({ title: "Error", description: "Please enter a name", variant: "destructive" });
      return;
    }

    setIsUpdatingFullName(true);
    try {
      await updateUserMutation.mutateAsync({ 
        userId: currentUser.id, 
        updates: { fullName: fullName.trim() } 
      });
      setFullName("");
    } catch (error) {
      // Error handled in mutation
    } finally {
      setIsUpdatingFullName(false);
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

    setIsUpdatingPassword(true);
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
    } finally {
      setIsUpdatingPassword(false);
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
        role: "cps",
      });
    } catch (error) {
      // Error handled in mutation
    }
  };

  // Update user role
  const handleUpdateRole = async (userId: number, role: "admin" | "cps" | "ets") => {
    setChangingRoleUserId({ userId, role });
    try {
      const updatedUser = await updateUserMutation.mutateAsync({ userId, updates: { role } });

      if (selectedUserForDialog?.id === userId && updatedUser) {
        setSelectedUserForDialog(updatedUser);
      }
    } catch (error) {
      // Error handled in mutation
    } finally {
      setChangingRoleUserId(null);
    }
  };

  // Delete user
  const handleDeleteUser = async (userId: number) => {
    setDeletingUserId(userId);
    try {
      await deleteUserMutation.mutateAsync(userId);
    } catch (error) {
      // Error handled in mutation
    } finally {
      setDeletingUserId(null);
    }
  };

  // Toggle user status (activate/deactivate)
  const handleToggleUserStatus = async (userId: number) => {
    // Find the user to get current status
    const user = users?.find(u => u.id === userId);
    if (!user) return;

    const newStatus = user.status === "active" ? "inactive" : "active";
    setTogglingUserId(userId);
    try {
      const updatedUser = await updateUserMutation.mutateAsync({
        userId,
        updates: { status: newStatus }
      });

      if (selectedUserForDialog?.id === userId && updatedUser) {
        setSelectedUserForDialog(updatedUser);
      }
    } catch (error) {
      // Error handled in mutation
    } finally {
      setTogglingUserId(null);
    }
  };

  // Handle profile picture upload
  const handleProfilePictureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({ title: "Error", description: "Please select a valid image file", variant: "destructive" });
      return;
    }

    setIsUploadingProfilePicture(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        await updateProfilePictureMutation.mutateAsync({
          userId: currentUser.id,
          profilePicture: base64,
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast({ title: "Error", description: "Failed to upload profile picture", variant: "destructive" });
    } finally {
      setIsUploadingProfilePicture(false);
      // Reset the input
      event.target.value = '';
    }
  };

  // Handle profile picture removal
  const handleProfilePictureRemove = async () => {
    if (!currentUser) return;

    setIsRemovingProfilePicture(true);
    try {
      await updateProfilePictureMutation.mutateAsync({
        userId: currentUser.id,
        profilePicture: null,
      });
    } catch (error) {
      // Error handled in mutation
    } finally {
      setIsRemovingProfilePicture(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className={`grid w-full ${isAdmin ? "grid-cols-4" : "grid-cols-2"} max-w-[500px]`}>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Security
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              System
            </TabsTrigger>
          )}
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
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                    {currentUser?.profilePicture ? (
                      <img
                        src={currentUser.profilePicture}
                        alt="Profile"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl font-bold text-primary">{currentUser?.fullName?.charAt(0) || 'U'}</span>
                    )}
                  </div>
                  {/* Profile Picture Controls */}
                  <div className="absolute -bottom-1 -right-1 flex gap-1">
                    <label className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProfilePictureUpload}
                        className="hidden"
                        disabled={isUploadingProfilePicture || updateProfilePictureMutation.isPending}
                      />
                      <Camera className="w-3 h-3" />
                    </label>
                    {currentUser?.profilePicture && (
                      <button
                        onClick={handleProfilePictureRemove}
                        disabled={isRemovingProfilePicture || updateProfilePictureMutation.isPending}
                        className="w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:bg-destructive/90 transition-colors"
                        title="Remove profile picture"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-lg font-medium truncate max-w-[150px]">{currentUser?.fullName}</p>
                  <p className="text-muted-foreground">@{currentUser?.username}</p>
                  <Badge className={currentUser?.role === "cps" ? "bg-[#1f8f5f] text-white mt-1" : currentUser?.role === "ets" ? "bg-[#DAA520] text-white mt-1" : currentUser?.role === "admin" ? "bg-primary text-primary-foreground mt-1" : "mt-1"}>
                    {currentUser?.role === "admin" ? "Administrator" : currentUser?.role === "cps" ? "CPS" : "ETS"}
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
                <Button type="submit" disabled={isUpdatingFullName || updateUserMutation.isPending || fullName.trim() === currentUser?.fullName?.trim()} className="">
                  {isUpdatingFullName ? "Updating Name..." : "Update Name"}
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
                <Button type="submit" disabled={isUpdatingUsername || updateUsernameMutation.isPending || username.trim() === currentUser?.username?.trim()} className="">
                  {isUpdatingUsername ? "Updating Username..." : "Update Username"}
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
                {/* Hidden username field for accessibility */}
                <input
                  type="text"
                  name="username"
                  value={user?.username || ""}
                  autoComplete="username"
                  style={{ display: "none" }}
                  aria-hidden="true"
                  readOnly
                />
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
                      autoComplete="current-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={toggleCurrentPassword}
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
                      autoComplete="new-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={toggleNewPassword}
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
                      autoComplete="new-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={toggleConfirmPassword}
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
                    isUpdatingPassword ||
                    updatePasswordMutation.isPending || 
                    !currentPassword || 
                    !newPassword || 
                    !confirmPassword
                  }
                  className=""
                >
                  {isUpdatingPassword ? "Updating Password..." : "Update Password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Tab (Admin Only) - Deadline Management */}
        {isAdmin && (
          <TabsContent value="system" className="space-y-4">
            <Card className="border border-gray-200 dark:border-gray-800 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Deadline Management
                </CardTitle>
                <CardDescription>Manage activity deadlines and overdue checks.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-medium mb-2">Manual Deadline Check</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Trigger a manual check for overdue activities. This will update all activities that have passed their deadline and send notifications to users.
                  </p>
                  <Button
                    onClick={() => checkDeadlines.mutate()}
                    disabled={checkDeadlines.isPending}
                    className=""
                  >
                    {checkDeadlines.isPending ? "Checking Deadlines..." : "Check Deadlines"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200 dark:border-gray-800 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  User Permissions
                </CardTitle>
                <CardDescription>Control what non-admin users can do in the system.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">File Management</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow non-admin users to manage folders and files in the Drive and Archives pages, including renaming, moving, archiving, deleting, and restoring items. If disabled, the 3-dot menu will be hidden.
                    </p>
                  </div>
                  <Switch
                    checked={allowNonAdminFileManagement}
                    onCheckedChange={(checked) => updateAllowNonAdminFileManagement.mutate(checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">Activity Deletion</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow non-admin users to delete activities and use the Delete All button on the Calendar page. If disabled, these options will be hidden.
                    </p>
                  </div>
                  <Switch
                    checked={allowNonAdminActivityDelete}
                    onCheckedChange={(checked) => updateAllowNonAdminActivityDelete.mutate(checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">Holiday Management</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow non-admin users to add and manage holidays. If disabled, the Manage Holidays button, modal, and panel will be hidden.
                    </p>
                  </div>
                  <Switch
                    checked={allowNonAdminHolidayAdd}
                    onCheckedChange={(checked) => updateAllowNonAdminHolidayAdd.mutate(checked)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* User Management Tab (Admin Only) */}
        {isAdmin && (
          <TabsContent value="users" className="space-y-4">
            <Card className="border border-gray-200 dark:border-gray-800 shadow-lg">
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
                <div className="min-w-0">
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
                          onValueChange={(value) => setNewUserData({ ...newUserData, role: value as "admin" | "cps" | "ets" })}
                          name="newUserRole"
                        >
                          <SelectTrigger id="newUserRole">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">ADMIN</SelectItem>
                            <SelectItem value="cps">CPS</SelectItem>
                            <SelectItem value="ets">ETS</SelectItem>
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
                            onClick={toggleCreateUserPassword}
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
                            onClick={toggleCreateUserConfirmPassword}
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
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-12 border-t">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                      <Users className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No users found</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {paginatedUsers.map((user) => (
                        <div
                          key={user.id}
                          className={`flex flex-wrap items-start justify-between p-4 pr-4 border rounded-lg transition-colors cursor-pointer md:cursor-auto gap-3 overflow-visible ${
                            user.id === currentUser?.id 
                              ? "bg-primary/10 border-primary/30 dark:bg-primary/20" 
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => {
                            // Open dialog for mobile users regardless of status
                            if (isMobile) {
                              setSelectedUserForDialog(user);
                              setIsUserDialogOpen(true);
                            }
                          }}
                        >
                          <div className="flex items-center gap-4">
                            {user.profilePicture ? (
                              <button
                                type="button"
                                className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden transition-opacity hover:opacity-80"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setProfilePicturePreview(user.profilePicture ?? null);
                                }}
                                aria-label={`Open ${user.fullName}'s profile picture`}
                              >
                                <img
                                  src={user.profilePicture}
                                  alt="Profile"
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                                <span className="font-medium text-primary">{user.fullName?.charAt(0) || 'U'}</span>
                              </div>
                            )}
                            <div>
                              <p className="font-medium truncate md:whitespace-normal md:max-w-none">{user.fullName}{user.id === currentUser?.id && " (You)"}</p>
                              <p className="text-sm text-muted-foreground">@{user.username}</p>
                            </div>
                          </div>
                          <div className={`flex flex-wrap items-center gap-2 ${isMobile ? 'hidden' : ''}`}>
                            <Badge className={user.role === "cps" ? "bg-[#1f8f5f] text-white" : user.role === "ets" ? "bg-[#DAA520] text-white" : user.role === "admin" ? "bg-primary text-primary-foreground" : ""}>
                              {user.role === "admin" ? (
                                <><ShieldAlert className="mr-1 h-3 w-3" /> Admin</>
                              ) : user.role === "cps" ? (
                                <><Shield className="mr-1 h-3 w-3" /> CPS</>
                              ) : (
                                <><Shield className="mr-1 h-3 w-3" /> ETS</>
                              )}
                            </Badge>
                            {/* Activate/Deactivate button - only show for non-current users */}
                            {user.id !== currentUser?.id && (
                              <Button
                                variant={user.status === "active" ? "destructive" : "outline"}
                                size="sm"
                                onClick={() => handleToggleUserStatus(user.id)}
                                disabled={togglingUserId === user.id}
                              >
                                {togglingUserId === user.id ? (
                                  user.status === "active" ? "Deactivating..." : "Activating..."
                                ) : (
                                  user.status === "active" ? "Deactivate" : "Activate"
                                )}
                              </Button>
                            )}
                            {user.id !== currentUser?.id && (
                              <div className="flex items-center gap-2">
                                {user.role === "admin" ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUpdateRole(user.id, "cps")}
                                  disabled={changingRoleUserId?.userId === user.id}
                                >
                                  {changingRoleUserId?.userId === user.id && changingRoleUserId?.role === "cps" ? "Making CPS..." : "Make CPS"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUpdateRole(user.id, "ets")}
                                  disabled={changingRoleUserId?.userId === user.id}
                                >
                                  {changingRoleUserId?.userId === user.id && changingRoleUserId?.role === "ets" ? "Making ETS..." : "Make ETS"}
                                </Button>
                              </>
                            ) : user.role === "cps" ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUpdateRole(user.id, "ets")}
                                  disabled={changingRoleUserId?.userId === user.id}
                                >
                                  {changingRoleUserId?.userId === user.id && changingRoleUserId?.role === "ets" ? "Making ETS..." : "Make ETS"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUpdateRole(user.id, "admin")}
                                  disabled={changingRoleUserId?.userId === user.id}
                                >
                                  {changingRoleUserId?.userId === user.id && changingRoleUserId?.role === "admin" ? "Making Admin..." : "Make Admin"}
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUpdateRole(user.id, "cps")}
                                  disabled={changingRoleUserId?.userId === user.id}
                                >
                                  {changingRoleUserId?.userId === user.id && changingRoleUserId?.role === "cps" ? "Making CPS..." : "Make CPS"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUpdateRole(user.id, "admin")}
                                  disabled={changingRoleUserId?.userId === user.id}
                                >
                                  {changingRoleUserId?.userId === user.id && changingRoleUserId?.role === "admin" ? "Making Admin..." : "Make Admin"}
                                </Button>
                              </>
                            )}
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm">
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
                                        disabled={deletingUserId === user.id}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        {deletingUserId === user.id ? "Deleting..." : "Delete"}
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
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setUserCurrentPage(p => Math.min(totalUserPages, p + 1))}
                          disabled={userCurrentPage >= totalUserPages}
                        >
                          <ChevronRight className="h-4 w-4" />
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex min-w-0 items-start gap-2 pr-8 text-left text-base leading-snug sm:text-lg">
              <User className="w-5 h-5 flex-shrink-0" />
              <span className="min-w-0 break-words">
                {selectedUserForDialog?.fullName}
              </span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              User details and actions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-muted-foreground">Username</span>
              <span className="font-medium break-all sm:text-right">@{selectedUserForDialog?.username}</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-muted-foreground">Role</span>
              <Badge className={`w-fit max-w-full ${selectedUserForDialog?.role === "cps" ? "bg-[#1f8f5f] text-white" : selectedUserForDialog?.role === "ets" ? "bg-[#DAA520] text-white" : selectedUserForDialog?.role === "admin" ? "bg-primary text-primary-foreground" : ""}`}>
                {selectedUserForDialog?.role === "admin" ? (
                  <><ShieldAlert className="mr-1 h-3 w-3" /> Admin</>
                ) : selectedUserForDialog?.role === "cps" ? (
                  <><Shield className="mr-1 h-3 w-3" /> CPS</>
                ) : (
                  <><Shield className="mr-1 h-3 w-3" /> ETS</>
                )}
              </Badge>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-muted-foreground">Status</span>
              {selectedUserForDialog?.id !== currentUser?.id ? (
                <Button
                  variant={selectedUserForDialog?.status === "active" ? "destructive" : "outline"}
                  size="sm"
                  className="max-w-full self-start whitespace-normal text-center"
                  onClick={() => {
                    if (selectedUserForDialog) {
                      handleToggleUserStatus(selectedUserForDialog.id);
                    }
                  }}
                  disabled={togglingUserId === selectedUserForDialog?.id}
                >
                  {togglingUserId === selectedUserForDialog?.id ? (
                    selectedUserForDialog?.status === "active" ? "Deactivating..." : "Activating..."
                  ) : (
                    selectedUserForDialog?.status === "active" ? "Deactivate" : "Activate"
                  )}
                </Button>
              ) : (
                <Badge variant="outline">
                  {selectedUserForDialog?.status}
                </Badge>
              )}
            </div>
          </div>
          {selectedUserForDialog?.id !== currentUser?.id && (
            <DialogFooter className="flex-row flex-wrap justify-start gap-2 sm:justify-end">
              {selectedUserForDialog?.role === "admin" ? (
              <>
                <Button
                  variant="outline"
                  className="max-w-full whitespace-normal text-center"
                  onClick={() => {
                    handleUpdateRole(selectedUserForDialog.id, "cps");
                  }}
                  disabled={changingRoleUserId !== null}
                >
                  {changingRoleUserId?.userId === selectedUserForDialog?.id && changingRoleUserId?.role === "cps" ? "Making CPS..." : "Make CPS"}
                </Button>
                <Button
                  variant="outline"
                  className="max-w-full whitespace-normal text-center"
                  onClick={() => {
                    handleUpdateRole(selectedUserForDialog.id, "ets");
                  }}
                  disabled={changingRoleUserId !== null}
                >
                  {changingRoleUserId?.userId === selectedUserForDialog?.id && changingRoleUserId?.role === "ets" ? "Making ETS..." : "Make ETS"}
                </Button>
              </>
            ) : selectedUserForDialog?.role === "cps" ? (
              <>
                <Button
                  variant="outline"
                  className="max-w-full whitespace-normal text-center"
                  onClick={() => {
                    handleUpdateRole(selectedUserForDialog.id, "ets");
                  }}
                  disabled={changingRoleUserId !== null}
                >
                  {changingRoleUserId?.userId === selectedUserForDialog?.id && changingRoleUserId?.role === "ets" ? "Making ETS..." : "Make ETS"}
                </Button>
                <Button
                  variant="outline"
                  className="max-w-full whitespace-normal text-center"
                  onClick={() => {
                    handleUpdateRole(selectedUserForDialog.id, "admin");
                  }}
                  disabled={changingRoleUserId !== null}
                >
                  {changingRoleUserId?.userId === selectedUserForDialog?.id && changingRoleUserId?.role === "admin" ? "Making Admin..." : "Make Admin"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="max-w-full whitespace-normal text-center"
                  onClick={() => {
                    handleUpdateRole(selectedUserForDialog.id, "cps");
                  }}
                  disabled={changingRoleUserId !== null}
                >
                  {changingRoleUserId?.userId === selectedUserForDialog?.id && changingRoleUserId?.role === "cps" ? "Making CPS..." : "Make CPS"}
                </Button>
                <Button
                  variant="outline"
                  className="max-w-full whitespace-normal text-center"
                  onClick={() => {
                    handleUpdateRole(selectedUserForDialog.id, "admin");
                  }}
                  disabled={changingRoleUserId !== null}
                >
                  {changingRoleUserId?.userId === selectedUserForDialog?.id && changingRoleUserId?.role === "admin" ? "Making Admin..." : "Make Admin"}
                </Button>
              </>
            )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="max-w-full whitespace-normal text-center">
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
                      disabled={deletingUserId === selectedUserForDialog?.id}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deletingUserId === selectedUserForDialog?.id ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(profilePicturePreview)} onOpenChange={(open) => !open && setProfilePicturePreview(null)}>
        <DialogContent className="w-auto max-w-none border-none bg-transparent p-0 shadow-none [&>button]:hidden">
          <DialogTitle className="sr-only">Profile picture preview</DialogTitle>
          {profilePicturePreview && (
            <div className="flex items-center justify-center">
              <img
                src={profilePicturePreview}
                alt="Profile picture preview"
                className="h-[min(70vh,28rem)] w-[min(70vh,28rem)] rounded-full object-cover shadow-2xl"
              />
            </div>
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
