import { LayoutWrapper } from "@/components/layout-wrapper";
import { useActivities, useCreateActivity, useDeleteActivity } from "@/hooks/use-activities";
import { 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  format, 
  isSameMonth, 
  isToday,
  isSameDay
} from "date-fns";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Upload, FileText, Clock, CheckCircle, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { api } from "@shared/routes";

export default function CalendarPage() {
  const { user } = useAuth();
  const { data: activities } = useActivities();
  const createActivity = useCreateActivity();
  const deleteActivity = useDeleteActivity();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [isNewActivityOpen, setIsNewActivityOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Handle activityId from URL query parameter (when clicking from notification)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const activityId = params.get('activityId');
    
    if (activityId && activities) {
      const activity = activities.find(a => a.id === parseInt(activityId));
      if (activity) {
        setSelectedActivity(activity);
        setIsActivityModalOpen(true);
        // Navigate to the month of the activity's deadline
        const activityDate = new Date(activity.deadlineDate);
        setCurrentDate(activityDate);
        // Clear the URL parameter after handling
        setLocation('/calendar', { replace: true });
      }
    }
  }, [activities, setLocation]);

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  // Calculate padding days for grid alignment
  const startDay = startOfMonth(currentDate).getDay();
  const paddingDays = Array.from({ length: startDay });

  const handleCreate = async () => {
    if (!title || !selectedDate) return;
    await createActivity.mutateAsync({
      title,
      description,
      startDate: new Date(),
      deadlineDate: selectedDate,
      status: 'pending',
    });
    setIsNewActivityOpen(false);
    setSelectedDate(null);
    setTitle("");
    setDescription("");
  };

  const getStatusColor = (status: string | null) => {
    switch(status) {
      case 'completed': return 'bg-green-100 text-green-700 border-green-200';
      case 'overdue': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-orange-100 text-orange-700 border-orange-200';
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles: File[] = [];

    for (const file of files) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: `File "${file.name}" is not supported. Please select PDF or Word documents only.`,
          variant: "destructive"
        });
        continue;
      }
      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `File "${file.name}" exceeds 10MB limit.`,
          variant: "destructive"
        });
        continue;
      }
      validFiles.push(file);
    }

    setSelectedFiles(validFiles);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const validFiles: File[] = [];

    for (const file of files) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: `File "${file.name}" is not supported. Please select PDF or Word documents only.`,
          variant: "destructive"
        });
        continue;
      }
      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `File "${file.name}" exceeds 10MB limit.`,
          variant: "destructive"
        });
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setSelectedFiles([...selectedFiles, ...validFiles]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedActivity || selectedFiles.length === 0) return;

    setIsSubmitting(true);
    try {
      // Submit all files
      const uploadPromises = selectedFiles.map(async (file, index) => {
        return new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = reader.result as string;

            try {
              // Only create notification for the last file to avoid multiple notifications
              const isLastFile = index === selectedFiles.length - 1;
              const response = await fetch(`/api/activities/${selectedActivity.id}/submit`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  title: `${selectedActivity.title} - ${file.name}`,
                  description: `Submission for activity: ${selectedActivity.title}`,
                  fileName: file.name,
                  fileType: file.type,
                  fileSize: file.size,
                  fileData: base64,
                  suppressNotification: !isLastFile,
                }),
              });

              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Upload failed');
              }

              resolve();
            } catch (error) {
              reject(error);
            }
          };
          reader.onerror = () => reject(new Error('File reading failed'));
          reader.readAsDataURL(file);
        });
      });

      await Promise.all(uploadPromises);

      toast({
        title: "Submission successful",
        description: `Successfully submitted ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}!`,
      });
      setIsActivityModalOpen(false);
      setSelectedFiles([]);
      // Refresh activities without page reload
      queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });
    } catch (error: any) {
      console.error('Submission error:', error);
      toast({
        title: "Submission failed",
        description: error.message || 'Submission failed. Please try again.',
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LayoutWrapper>
      <div className="flex items-center justify-between mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary mb-2 flex items-center gap-2">
            <CalendarIcon className="w-8 h-8" />
            Activity Calendar
          </h1>
          <p className="text-muted-foreground">Manage your schedule and deadlines.</p>
        </div>
        
        <Dialog open={isNewActivityOpen} onOpenChange={setIsNewActivityOpen}>
          <DialogTrigger asChild>
            <Button
              className="gap-2 shadow-lg shadow-primary/20 bg-primary"
              disabled={!selectedDate}
              onClick={() => {
                if (!selectedDate) {
                  // Show message to select a date first
                  toast({
                    title: "Select a date",
                    description: "Please select a date on the calendar first.",
                    variant: "destructive"
                  });
                  return;
                }
                setIsNewActivityOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              {selectedDate ? `Add Activity for ${format(selectedDate, 'MMM d')}` : 'Select a Date First'}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Activity</DialogTitle>
              <DialogDescription>
                Create a new activity for {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'the selected date'}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Submit Q1 Report" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createActivity.isPending}>
                {createActivity.isPending ? "Creating..." : "Create Activity"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Activity Submission Modal */}
        <Dialog open={isActivityModalOpen} onOpenChange={(open) => {
          setIsActivityModalOpen(open);
          if (!open) {
            setSelectedFiles([]);
            setSelectedActivity(null);
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {selectedActivity?.title}
              </DialogTitle>
              <DialogDescription>
                Submit your report for this activity
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Activity Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Description</h4>
                  <p className="text-sm">{selectedActivity?.description || 'No description provided'}</p>
                </div>
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Deadline</h4>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {selectedActivity ? format(new Date(selectedActivity.deadlineDate), 'PPP') : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center justify-center">
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2",
                  selectedActivity?.status === 'completed' && "bg-green-100 text-green-700",
                  selectedActivity?.status === 'overdue' && "bg-red-100 text-red-700",
                  selectedActivity?.status === 'pending' && "bg-orange-100 text-orange-700"
                )}>
                  {selectedActivity?.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                  {selectedActivity?.status === 'overdue' && <AlertCircle className="w-3 h-3" />}
                  {selectedActivity?.status === 'pending' && <Clock className="w-3 h-3" />}
                  {selectedActivity?.status === 'pending' ? 'Pending' :
                   selectedActivity?.status === 'completed' ? 'Completed' :
                   selectedActivity?.status === 'overdue' ? 'Overdue' : 'Unknown'}
                </div>
              </div>

              {/* Submission Status */}
              {selectedActivity && (
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {selectedActivity.status === 'completed'
                      ? "You have already submitted this activity."
                      : selectedActivity.status === 'overdue'
                      ? "This activity is overdue. You can still submit but it will be marked as late."
                      : "Ready to submit your report for this activity."
                    }
                  </p>
                </div>
              )}

              {/* File Upload Section */}
              {selectedActivity?.status !== 'completed' && (
                <div className="space-y-4">
                  <div 
                    className={`text-center p-4 border-2 border-dashed rounded-lg transition-colors ${isDragging ? 'border-primary bg-primary/10' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <input
                      type="file"
                      id="activity-file-upload"
                      className="hidden"
                      accept=".pdf,.doc,.docx"
                      multiple
                      onChange={handleFileSelect}
                    />
                    <label
                      htmlFor="activity-file-upload"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md cursor-pointer hover:bg-primary/90 transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      Choose File
                    </label>
                    <p className="text-xs text-muted-foreground mt-2">or drag and drop files here</p>
                  </div>

                  {selectedFiles.length > 0 && (
                    <div className="text-center p-3 bg-muted/30 rounded-lg">
                      <p className="text-sm font-medium mb-2">
                        {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected:
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="text-xs text-muted-foreground flex justify-between">
                            <span className="truncate">{file.name}</span>
                            <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground text-center">
                    Supported formats: PDF, DOC, DOCX (Max 10MB)
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="flex justify-between">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setActivityToDelete(selectedActivity);
                  setShowDeleteConfirm(true);
                }}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Activity
              </Button>

              {selectedActivity?.status !== 'completed' && (
                <Button
                  className="gap-2"
                  onClick={handleSubmit}
                  disabled={selectedFiles.length === 0 || isSubmitting}
                >
                  <Upload className="w-4 h-4" />
                  {isSubmitting ? 'Submitting...' : `Submit ${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''}`}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Modal */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Activity</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the activity "{activityToDelete?.title}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (activityToDelete) {
                    deleteActivity.mutate(activityToDelete.id);
                    setIsActivityModalOpen(false);
                  }
                  setShowDeleteConfirm(false);
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
        {/* Calendar Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800 bg-muted/20">
          <div className="flex items-center gap-4">
            <div className="flex gap-1">
              <Button variant="outline" size="icon" onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <h2 className="text-xl font-bold font-display text-primary min-w-[160px]">
              {format(currentDate, 'MMMM yyyy')}
            </h2>
          </div>
          <div className="text-sm text-muted-foreground font-medium">
            {activities?.length} Scheduled Activities
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-800">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="py-3 text-center text-sm font-semibold text-muted-foreground border-r last:border-r-0 bg-muted/5 dark:bg-muted/20">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 min-h-[600px] auto-rows-fr" onClick={() => setSelectedDate(null)}>
          {paddingDays.map((_, i) => (
            <div key={`padding-${i}`} className="bg-muted/5 dark:bg-muted/10 border-b border-r last:border-r-0 border-gray-200 dark:border-gray-800" />
          ))}

          {daysInMonth.map((date) => {
            const dayActivities = activities?.filter(a => isSameDay(new Date(a.deadlineDate), date));

            return (
              <div
                key={date.toISOString()}
                className={cn(
                  "p-2 border-b border-r last:border-r-0 min-h-[100px] transition-colors cursor-pointer hover:bg-primary/10 border-gray-200 dark:border-gray-800",
                  isToday(date) && "bg-accent/5 dark:bg-accent/10",
                  selectedDate && isSameDay(date, selectedDate) && "ring-2 ring-primary ring-inset bg-primary/5"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectedDate && isSameDay(date, selectedDate)) {
                    setSelectedDate(null);
                  } else {
                    setSelectedDate(date);
                  }
                }}
              >
                <div className={cn(
                  "w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-2",
                  isToday(date) ? "bg-accent text-white shadow-sm" : "text-muted-foreground"
                )}>
                  {format(date, 'd')}
                </div>
                
                <div className="space-y-1">
                  {dayActivities?.map(activity => (
                    <button
                      key={activity.id}
                      onClick={() => {
                        setSelectedActivity(activity);
                        setIsActivityModalOpen(true);
                      }}
                      className={cn(
                        "text-xs p-1.5 rounded-md border truncate font-medium text-left w-full",
                        getStatusColor(activity.status),
                        selectedActivity?.id === activity.id && "ring-2 ring-primary ring-offset-1"
                      )}
                    >
                      {activity.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </LayoutWrapper>
  );
}
