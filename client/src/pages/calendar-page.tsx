import { useState, useEffect, useCallback, useRef } from "react";
import { LayoutWrapper, useSidebar } from "@/components/layout-wrapper";
import { useIsMobile } from "@/hooks/use-mobile";
import { format, isSameDay, isSameMonth, eachDayOfInterval, startOfMonth, endOfMonth, addDays, addWeeks, addMonths, startOfWeek, differenceInDays, isPast, isToday } from "date-fns";
import {
  Menu,
  CalendarDays,
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Clock,
  CheckCircle,
  AlertCircle,
  Upload,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  ChevronDown,
  Filter,
  FolderOpen,
  Archive,
  Edit2,
  MoveHorizontal,
  Loader2,
  ArrowLeft,
  Grid3X3,
  LayoutList,
  FileText,
} from "lucide-react";
import { useActivities, useCreateActivity, useDeleteActivity, useStartActivity, useUpdateActivity } from "@/hooks/use-activities";
import { useHolidays, useCreateHoliday, useUpdateHoliday, useDeleteHoliday } from "@/hooks/use-holidays";
import { useAuth } from "@/hooks/use-auth";
import { useSystemSettings, useSystemSettingsPolling } from "@/hooks/use-settings";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { api, buildUrl } from "@shared/routes";
import { Link, useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

// Helper functions defined outside component for accessibility
let holidaysData: any[] = [];
let holidaysEnabledDataData: boolean = true;

// Helper function to check if a date is a holiday
const isDateHoliday = (date: Date) => {
  if (!holidaysEnabledDataData) return false;
  return holidaysData?.some(holiday =>
    isSameDay(new Date(holiday.date), date)
  ) || false;
};

// Helper function to check if a date is a weekend
const isDateWeekend = (date: Date) => {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
};

// Helper function to get the effective display date for an activity (adjusted for holidays/weekends)
const getEffectiveActivityDate = (activity: any): Date => {
  const deadlineDate = new Date(activity.deadlineDate);
  
  // Check if we should adjust for weekends (always, regardless of holidays setting)
  const shouldAdjust = isDateWeekend(deadlineDate) || (holidaysEnabledDataData && isDateHoliday(deadlineDate));
  
  if (shouldAdjust) {
    // Move to previous weekday that's not a holiday
    let adjustedDate = new Date(deadlineDate);
    let isAdjusted = true;

    while (isAdjusted) {
      isAdjusted = false;
      const dayOfWeek = adjustedDate.getDay();

      // Check if it's a weekend
      if (dayOfWeek === 6) { // Saturday
        adjustedDate.setDate(adjustedDate.getDate() - 1);
        isAdjusted = true;
      } else if (dayOfWeek === 0) { // Sunday
        adjustedDate.setDate(adjustedDate.getDate() - 2);
        isAdjusted = true;
      } else if (holidaysEnabledDataData && isDateHoliday(adjustedDate)) { // Check if it's a holiday (only when enabled)
        adjustedDate.setDate(adjustedDate.getDate() - 1);
        isAdjusted = true;
      }
    }

    return adjustedDate;
  }
  return deadlineDate;
};

export default function CalendarPage() {
  return (
    <LayoutWrapper>
      <CalendarContent />
    </LayoutWrapper>
  );
}

function CalendarContent() {
  const { user } = useAuth();
  const { openSidebar } = useSidebar();
  const { allowNonAdminActivityDelete, allowNonAdminHolidayAdd } = useSystemSettings();
  const canDeleteActivities = user?.role === "admin" || allowNonAdminActivityDelete;

  // Holidays enabled state - local with polling for sync across users
  const [holidaysEnabledData, setHolidaysEnabled] = useState<boolean>(true);
  const { toast } = useToast();
  const holidaysEnabledSavePendingRef = useRef(false);

  const updateHolidaysEnabled = useMutation({
    retry: false,
    mutationFn: async (value: boolean) => {
      const res = await fetch(api.settings.set.path, {
        method: api.settings.set.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ key: 'holidays_enabled', value: value.toString() }),
      });
      if (!res.ok) {
        const error = await res.json();
        return Promise.reject(new Error(error.message || "Failed to update setting"));
      }
      return res.json();
    },
    onMutate: (value: boolean) => {
      holidaysEnabledSavePendingRef.current = true;
      const previous = holidaysEnabledDataData;
      setHolidaysEnabled(value);
      holidaysEnabledDataData = value;
      return { previous };
    },
    onError: (err, _value, context) => {
      if (context?.previous !== undefined) {
        setHolidaysEnabled(context.previous);
        holidaysEnabledDataData = context.previous;
      }
      toast({
        title: "Could not save setting",
        description: err instanceof Error ? err.message : "Failed to update holidays",
        variant: "destructive",
      });
    },
    onSettled: () => {
      holidaysEnabledSavePendingRef.current = false;
    },
    onSuccess: (_, value) => {
      setHolidaysEnabled(value);
      holidaysEnabledDataData = value;
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path] });
      toast({
        title: "Setting saved",
        description: value
          ? "Holidays are enabled on the calendar."
          : "Holidays are disabled on the calendar.",
      });
    },
  });

  // Poll for holidays enabled setting every 5 seconds for cross-user sync
  useEffect(() => {
    const fetchHolidaysEnabled = async () => {
      if (holidaysEnabledSavePendingRef.current) return;
      try {
        const res = await fetch('/api/settings/holidays_enabled', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const newValue = data.value === 'true';
          setHolidaysEnabled(prev => {
            if (prev !== newValue) {
              holidaysEnabledDataData = newValue;
              return newValue;
            }
            return prev;
          });
        }
      } catch (e) {
        // Ignore errors
      }
    };

    fetchHolidaysEnabled();
    const interval = setInterval(fetchHolidaysEnabled, 5000);
    return () => clearInterval(interval);
  }, []);

  // Enable real-time polling for settings changes
  useSystemSettingsPolling();
  const canManageHolidays = user?.role === "admin" || allowNonAdminHolidayAdd;
  const isMobile = useIsMobile();
  const { data: activities } = useActivities();
  const createActivity = useCreateActivity();
  const deleteActivity = useDeleteActivity();
  const startActivity = useStartActivity();
  const updateActivity = useUpdateActivity();
  const { data: holidays } = useHolidays();
  const createHoliday = useCreateHoliday();
  const updateHoliday = useUpdateHoliday();
  const deleteHoliday = useDeleteHoliday();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();

  // Calendar view state
  type CalendarView = 'day' | 'week' | 'month';
  const [view, setView] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isNewActivityOpen, setIsNewActivityOpen] = useState(false);
  
  // Time slot activities modal state
  const [showTimeSlotActivitiesModal, setShowTimeSlotActivitiesModal] = useState(false);
  const [timeSlotActivitiesModalData, setTimeSlotActivitiesModalData] = useState<{
    date: Date;
    time: string;
    activities: any[];
  } | null>(null);

  // Time slot activities pagination state
  const [timeSlotActivitiesPage, setTimeSlotActivitiesPage] = useState(1);
  const timeSlotActivitiesPerPage = 10;

  // Activity filter state
  const [activityFilter, setActivityFilter] = useState<string>('all');
  
  // Agency & Department filter state for sidebar
  const [filterAgency, setFilterAgency] = useState<string>('');
  const [filterDepartment, setFilterDepartment] = useState<string>('');
  const [agencyFilterPage, setAgencyFilterPage] = useState(1);
  const [enableRoleFiltering, setEnableRoleFiltering] = useState(true);

  // Fetch role filtering setting
  useEffect(() => {
    const fetchSetting = async () => {
      try {
        const res = await fetch('/api/settings/enable_role_filtering', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setEnableRoleFiltering(data.value !== 'false');
        }
      } catch (error) {
        console.error('Error fetching setting:', error);
      }
    };
    fetchSetting();

    // Poll for setting changes every 2 seconds
    const interval = setInterval(fetchSetting, 2000);
    return () => clearInterval(interval);
  }, []);

  // Update global holidays data when holidays change
  const [holidaysKey, setHolidaysKey] = useState(0);
  useEffect(() => {
    holidaysData = holidays || [];
    holidaysEnabledDataData = holidaysEnabledData;
    setHolidaysKey(k => k + 1); // Force re-render when holidays update
  }, [holidays, holidaysEnabledData]);

  // Clear department filter when role-based filtering is enabled for non-admin users
  useEffect(() => {
    if (enableRoleFiltering && user && user.role !== 'admin') {
      setFilterDepartment('');
    }
  }, [enableRoleFiltering, user]);
  
  // Reset pagination when filters change
  useEffect(() => {
    setAgencyFilterPage(1);
  }, [filterAgency, filterDepartment]);
  
  // Drag state for rescheduling
  const [draggedActivity, setDraggedActivity] = useState<any>(null);
  const [dropTargetDate, setDropTargetDate] = useState<Date | null>(null);
  const [dropTargetTime, setDropTargetTime] = useState<string | null>(null);
  const [showRescheduleConfirm, setShowRescheduleConfirm] = useState(false);
  const [rescheduleTargetDate, setRescheduleTargetDate] = useState<Date | null>(null);
  const [rescheduleTargetTime, setRescheduleTargetTime] = useState<string | null>(null);
  const [isDraggingOverTimeSlot, setIsDraggingOverTimeSlot] = useState(false);
  
  // Auto-scroll state for drag-and-drop
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(false);
  const autoScrollRef = useRef<{
    direction: 'left' | 'right' | 'up' | 'down' | null;
    intervalId: NodeJS.Timeout | null;
  }>({ direction: null, intervalId: null });
  
  // Touch drag state
  const touchDragRef = useRef<{
    activity: any;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [isTouchDragging, setIsTouchDragging] = useState(false);
  
  // Filter activities based on current filter
  const filteredActivities = activities?.filter(a => {
    if (activityFilter === 'all') return true;
    if (activityFilter === 'pending') return a.status === 'pending';
    if (activityFilter === 'in-progress') return a.status === 'in-progress';
    if (activityFilter === 'completed') return a.status === 'completed' || a.status === 'late';
    if (activityFilter === 'overdue') return a.status === 'overdue';
    return true;
  }) || [];

  // Calculate activities in current month
  const activitiesInCurrentMonth = filteredActivities.filter(a =>
    isSameMonth(getEffectiveActivityDate(a), currentDate)
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [startingActivityId, setStartingActivityId] = useState<number | null>(null);
  const [deletingActivityId, setDeletingActivityId] = useState<number | null>(null);
  
  // Day Activities Modal State
  const [showDayActivitiesModal, setShowDayActivitiesModal] = useState(false);
  const [dayActivitiesModalDate, setDayActivitiesModalDate] = useState<Date | null>(null);
  const [dayActivitiesPage, setDayActivitiesPage] = useState(1);
  const [activityFromDayModal, setActivityFromDayModal] = useState(false);
  const [newActivityFromDayModal, setNewActivityFromDayModal] = useState(false);
  const dayActivitiesPerPage = 10;

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [activityTime, setActivityTime] = useState<string>("23:59"); // Default to end of day
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [regulatoryAgency, setRegulatoryAgency] = useState("");
  const [concernDepartment, setConcernDepartment] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState<string>("none");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>("");
  const [submissionDate, setSubmissionDate] = useState<Date>(new Date());
  const [activitySubmissions, setActivitySubmissions] = useState<any[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);

  // Holiday State
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState<Date | undefined>(undefined);
  const [editingHoliday, setEditingHoliday] = useState<any>(null);
  const [holidayToDelete, setHolidayToDelete] = useState<any>(null);
  const [showDeleteHolidayConfirm, setShowDeleteHolidayConfirm] = useState(false);
  const [isAddingHoliday, setIsAddingHoliday] = useState(false);
  const [isDeletingHolidayId, setIsDeletingHolidayId] = useState<number | null>(null);
  const [holidayPage, setHolidayPage] = useState(1);
  const holidaysPerPage = 5;

  // Check if holiday fields have changed from original values
  const hasHolidayChanges = editingHoliday && (
    holidayName !== editingHoliday.name || 
    (holidayDate && editingHoliday.date && !isSameDay(new Date(holidayDate), new Date(editingHoliday.date)))
  );

  // Delete Recurring Activities State
  const [deleteRecurType, setDeleteRecurType] = useState<string>("");
  const [deleteRecurYear, setDeleteRecurYear] = useState<string>("");
  const [deleteRecurPreview, setDeleteRecurPreview] = useState<any[]>([]);
  const [showDeleteRecurConfirm, setShowDeleteRecurConfirm] = useState(false);
  const [isDeletingRecurring, setIsDeletingRecurring] = useState(false);
  
  // Clear concern department when regulatory agency changes
  useEffect(() => {
    setConcernDepartment([]);
  }, [regulatoryAgency]);
  
  const [reportDetails, setReportDetails] = useState("");
  const [remarks, setRemarks] = useState("");

  // Helper function to create blob URL from base64 data
  const createBlobUrl = (dataUrl: string) => {
    if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
    const byteCharacters = atob(dataUrl.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: dataUrl.split(',')[0].split(';')[0] });
    return URL.createObjectURL(blob);
  };

  // Handle file click to open or download
  const handleFileClick = (fileData: string, fileName: string, fileType?: string, forceDownload?: boolean) => {
    // Check if file type can be opened in browser
    const canOpenInBrowser = !forceDownload && fileType && [
      'application/pdf',
      'image/',
      'text/',
    ].some(type => fileType.toLowerCase().startsWith(type));
    
    if (canOpenInBrowser) {
      // For PDF/image/text files, create a Blob and use object URL
      const [mimeType, base64Data] = fileData.split(',');
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const mime = mimeType.split(';')[0].replace('data:', '');
      const blob = new Blob([byteArray], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      
      // Open in new window
      const newWindow = window.open(blobUrl, '_blank');
      if (!newWindow) {
        window.location.href = blobUrl;
      }
    } else {
      // For other files or when forceDownload is true, download
      const [mimeType, base64Data] = fileData.split(',');
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const mime = mimeType.split(';')[0].replace('data:', '');
      const blob = new Blob([byteArray], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Handle activityId from URL query parameter (when clicking from notification)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const activityId = params.get('activityId');
    
    if (activityId && activities) {
      const activity = activities.find(a => a.id === parseInt(activityId));
      if (activity) {
        setSelectedActivity(activity);
        setIsActivityModalOpen(true);
        // Clear previous submissions and show loading
        setActivitySubmissions([]);
        setIsLoadingSubmissions(true);
        // Fetch submissions for this activity when modal opens
        fetch(`/api/activities/${activity.id}/submissions`)
          .then(res => res.json())
          .then(data => {
            setActivitySubmissions(data);
            setIsLoadingSubmissions(false);
          })
          .catch(err => {
            console.error('Failed to fetch submissions:', err);
            setIsLoadingSubmissions(false);
          });
        // Navigate to the month of the activity's deadline
        const activityDate = new Date(activity.deadlineDate);
        setCurrentDate(activityDate);
        // Auto-switch to month view when navigating from notification
        setView('month');
        // Clear the URL parameter without adding to browser history
        window.history.replaceState({}, '', '/calendar');
      }
    }
  }, [activities, setLocation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (selectedDate) {
          setIsNewActivityOpen(true);
        } else {
          toast({
            title: "Select a date",
            description: "Please select a date on the calendar first.",
            variant: "destructive"
          });
        }
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        handleGoToToday();
      } else if (e.key === 'Escape') {
        setIsActivityModalOpen(false);
        setIsNewActivityOpen(false);
        // Clear selection in all views when pressing Escape
        setSelectedDate(null);
        setSelectedTimeSlot(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDate, view]);

  // Helper function to check if activity is due soon (within 3 days)
  const isDueSoon = (deadlineDate: string | Date) => {
    const deadline = new Date(deadlineDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = differenceInDays(deadline, today);
    return diff >= 0 && diff <= 3;
  };

  // Helper function to check if a date is a weekend
  const isDateWeekend = (date: Date) => {
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
  };

  // Helper function to check if a date is a holiday or weekend
  const isDateHolidayOrWeekend = (date: Date) => {
    return (holidaysEnabledDataData && isDateHoliday(date)) || isDateWeekend(date);
  };

  // Helper to get date indicators
  const getDateIndicators = (date: Date) => {
    const dayActivities = filteredActivities.filter(a =>
      isSameDay(getEffectiveActivityDate(a), date)
    );
    return {
      hasOverdue: dayActivities.some(a => a.status === 'overdue'),
      hasDueSoon: dayActivities.some(a => isDueSoon(a.deadlineDate)),
      hasActivities: dayActivities.length > 0,
      activityCount: dayActivities.length,
      isHoliday: isDateHoliday(date),
      isWeekend: isDateWeekend(date),
      isHolidayOrWeekend: isDateHolidayOrWeekend(date)
    };
  };

  // Helper function to check if target date/time is in the past
  const isTargetDateTimePast = (targetDate: Date, targetTime?: string | null): boolean => {
    const now = new Date();
    const target = new Date(targetDate);
    
    if (targetTime) {
      const [hours, minutes] = targetTime.split(':').map(Number);
      target.setHours(hours, minutes, 0, 0);
    } else {
      // If no time specified, check if the entire day is past
      target.setHours(23, 59, 59, 999);
    }
    
    return isPast(target);
  };

  // Stop auto-scroll on drag end
  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current.intervalId) {
      clearInterval(autoScrollRef.current.intervalId);
      autoScrollRef.current.intervalId = null;
    }
    autoScrollRef.current.direction = null;
    setAutoScrollEnabled(false);
  }, []);

  // Handle go to today
  const handleGoToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    // Preserve the current view (day, week, or month) - only change the displayed date
  };

  // Handle view change
  const handleViewChange = (newView: CalendarView) => {
    if (newView === 'day' || newView === 'week') {
      // If there's a selected date, navigate to that date
      // Otherwise, use the current date
      const targetDate = selectedDate || currentDate;
      setCurrentDate(targetDate);
    }
    setView(newView);
  };

  // Handle clicking on a day in WeekView to navigate to DayView
  const handleDayClickInWeekView = (date: Date) => {
    setCurrentDate(date);
    setSelectedDate(date);
    setView('day');
  };

  // Handle drag start for rescheduling
  const handleActivityDragStart = (e: React.DragEvent, activity: any) => {
    e.stopPropagation();
    setDraggedActivity(activity);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(activity.id));
    // Also store the activity as JSON for touch support
    e.dataTransfer.setData('application/json', JSON.stringify(activity));
  };

  // Handle drag over for time slot (Week/Day view)
  const handleTimeSlotDragOver = (e: React.DragEvent, date: Date, time: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetDate(date);
    setDropTargetTime(time);
    setIsDraggingOverTimeSlot(true);
    
    // Auto-scroll logic - scroll based on viewport edges (like Google Calendar)
    if (!draggedActivity) return;
    
    const scrollThreshold = 60;
    const scrollSpeed = 20;
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const clientX = e.clientX;
    const clientY = e.clientY;
    
    let scrollDirection: 'left' | 'right' | 'up' | 'down' | null = null;
    
    // Check horizontal edges of viewport
    if (clientX < scrollThreshold) {
      scrollDirection = 'left';
    } else if (clientX > viewportWidth - scrollThreshold) {
      scrollDirection = 'right';
    }
    
    // Check vertical edges of viewport
    if (clientY < scrollThreshold) {
      scrollDirection = 'up';
    } else if (clientY > viewportHeight - scrollThreshold) {
      scrollDirection = 'down';
    }
    
    // Stop existing auto-scroll if direction changed or no longer needed
    if (autoScrollRef.current.intervalId) {
      clearInterval(autoScrollRef.current.intervalId);
      autoScrollRef.current.intervalId = null;
    }
    
    if (scrollDirection) {
      setAutoScrollEnabled(true);
      autoScrollRef.current.direction = scrollDirection;
      
      const intervalId = setInterval(() => {
        if (!draggedActivity) {
          clearInterval(intervalId);
          autoScrollRef.current.intervalId = null;
          return;
        }
        
        switch (scrollDirection) {
          case 'left':
            window.scrollBy({ left: -scrollSpeed, behavior: 'auto' });
            break;
          case 'right':
            window.scrollBy({ left: scrollSpeed, behavior: 'auto' });
            break;
          case 'up':
            window.scrollBy({ top: -scrollSpeed, behavior: 'auto' });
            break;
          case 'down':
            window.scrollBy({ top: scrollSpeed, behavior: 'auto' });
            break;
        }
      }, 16);
      
      autoScrollRef.current.intervalId = intervalId;
    } else {
      setAutoScrollEnabled(false);
    }
  };

  // Handle drag leave for time slot
  const handleTimeSlotDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverTimeSlot(false);
  };

  // Handle drop on time slot (Week/Day view)
  const handleTimeSlotDrop = (e: React.DragEvent, date: Date, time: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverTimeSlot(false);
    
    // Stop auto-scroll
    stopAutoScroll();
    
    if (draggedActivity) {
      const currentDeadline = new Date(draggedActivity.deadlineDate);
      const targetDateTime = new Date(date);
      const [hours, minutes] = time.split(':').map(Number);
      targetDateTime.setHours(hours, minutes, 0, 0);
      
      const hasDateChanged = !isSameDay(currentDeadline, date);
      const hasTimeChanged = currentDeadline.getHours() !== hours || currentDeadline.getMinutes() !== minutes;
      
      if (hasDateChanged || hasTimeChanged) {
        setRescheduleTargetDate(date);
        setRescheduleTargetTime(time);
        setShowRescheduleConfirm(true);
        return;
      }
    }
    
    setDraggedActivity(null);
    setDropTargetDate(null);
    setDropTargetTime(null);
  };

  // Touch-based drag handlers
  const handleTouchDragStart = (activity: any, e: React.TouchEvent) => {
    if (activity.status === 'completed' || activity.status === 'late' || activity.status === 'in-progress') {
      return; // Don't allow dragging for these statuses
    }
    
    const touch = e.touches[0];
    touchDragRef.current = {
      activity,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY
    };
    setDraggedActivity(activity);
    setIsTouchDragging(true);
  };

  const handleTouchDragMove = (e: React.TouchEvent) => {
    if (!touchDragRef.current || !isTouchDragging) return;
    
    const touch = e.touches[0];
    touchDragRef.current.currentX = touch.clientX;
    touchDragRef.current.currentY = touch.clientY;
  };

  const handleTouchDragEnd = async (e: React.TouchEvent) => {
    if (!touchDragRef.current || !isTouchDragging) return;
    
    const { activity, currentX, currentY } = touchDragRef.current;
    
    // Get the element under the touch point
    const element = document.elementFromPoint(currentX, currentY);
    if (!element) {
      setDraggedActivity(null);
      setIsTouchDragging(false);
      touchDragRef.current = null;
      return;
    }
    
    // Find the closest time slot cell
    const timeSlotCell = element.closest('[data-time-slot]');
    if (timeSlotCell) {
      const targetDateStr = timeSlotCell.getAttribute('data-date');
      const targetTimeStr = timeSlotCell.getAttribute('data-time-slot');
      
      if (targetDateStr && targetTimeStr) {
        const targetDate = new Date(targetDateStr);
        const currentDeadline = new Date(activity.deadlineDate);
        const [hours, minutes] = targetTimeStr.split(':').map(Number);
        
        const hasDateChanged = !isSameDay(currentDeadline, targetDate);
        const hasTimeChanged = currentDeadline.getHours() !== hours || currentDeadline.getMinutes() !== minutes;
        
        if (hasDateChanged || hasTimeChanged) {
          // Set the dragged activity first so the modal can display it
          setDraggedActivity(activity);
          setRescheduleTargetDate(targetDate);
          setRescheduleTargetTime(targetTimeStr);
          setShowRescheduleConfirm(true);
          setIsTouchDragging(false);
          touchDragRef.current = null;
          return;
        }
      }
    }
    
    setDraggedActivity(null);
    setIsTouchDragging(false);
    touchDragRef.current = null;
  };

  // Handle drag over for date cell
  const handleDateDragOver = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetDate(date);
    
    // Auto-scroll logic for MonthView - scroll based on viewport edges (like Google Calendar)
    if (!draggedActivity) return;
    
    const scrollThreshold = 60;
    const scrollSpeed = 20;
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const clientX = e.clientX;
    const clientY = e.clientY;
    
    let scrollDirection: 'left' | 'right' | 'up' | 'down' | null = null;
    
    // Check horizontal edges of viewport
    if (clientX < scrollThreshold) {
      scrollDirection = 'left';
    } else if (clientX > viewportWidth - scrollThreshold) {
      scrollDirection = 'right';
    }
    
    // Check vertical edges of viewport
    if (clientY < scrollThreshold) {
      scrollDirection = 'up';
    } else if (clientY > viewportHeight - scrollThreshold) {
      scrollDirection = 'down';
    }
    
    // Stop existing auto-scroll if direction changed or no longer needed
    if (autoScrollRef.current.intervalId) {
      clearInterval(autoScrollRef.current.intervalId);
      autoScrollRef.current.intervalId = null;
    }
    
    if (scrollDirection) {
      autoScrollRef.current.direction = scrollDirection;
      
      const intervalId = setInterval(() => {
        if (!draggedActivity) {
          clearInterval(intervalId);
          autoScrollRef.current.intervalId = null;
          return;
        }
        
        switch (scrollDirection) {
          case 'left':
            window.scrollBy({ left: -scrollSpeed, behavior: 'auto' });
            break;
          case 'right':
            window.scrollBy({ left: scrollSpeed, behavior: 'auto' });
            break;
          case 'up':
            window.scrollBy({ top: -scrollSpeed, behavior: 'auto' });
            break;
          case 'down':
            window.scrollBy({ top: scrollSpeed, behavior: 'auto' });
            break;
        }
      }, 16);
      
      autoScrollRef.current.intervalId = intervalId;
    }
  };

  // Handle drop on date cell
  const handleDateDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Stop auto-scroll
    stopAutoScroll();
    
    if (draggedActivity) {
      const currentDeadline = new Date(draggedActivity.deadlineDate);
      if (!isSameDay(currentDeadline, date)) {
        setRescheduleTargetDate(date);
        setShowRescheduleConfirm(true);
        // Don't clear draggedActivity here - it's needed for the modal display
        return;
      }
    }
    
    setDraggedActivity(null);
    setDropTargetDate(null);
  };

  // Confirm reschedule
  const handleConfirmReschedule = async () => {
    if (draggedActivity && rescheduleTargetDate) {
      // Check if activity has a restricted status
      const restrictedStatuses = ['completed', 'late', 'in-progress'];
      if (restrictedStatuses.includes(draggedActivity.status)) {
        toast({
          title: "Cannot reschedule",
          description: `Activities with status "${draggedActivity.status}" cannot be rescheduled.`,
          variant: "destructive"
        });
        setShowRescheduleConfirm(false);
        setDraggedActivity(null);
        setRescheduleTargetDate(null);
        setRescheduleTargetTime(null);
        setDropTargetDate(null);
        setDropTargetTime(null);
        return;
      }
      
      try {
        // Convert Date to ISO string for the API
        // If time is provided, use it; otherwise preserve original time
        const deadlineDateStr = new Date(rescheduleTargetDate);
        if (rescheduleTargetTime) {
          const [hours, minutes] = rescheduleTargetTime.split(':').map(Number);
          deadlineDateStr.setHours(hours, minutes, 0, 0);
        } else {
          // Preserve original time
          const originalDate = new Date(draggedActivity.deadlineDate);
          deadlineDateStr.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0);
        }
        
        // Update the activity - server will automatically calculate the correct status
        // based on the new deadline date/time
        await updateActivity.mutateAsync({
          id: draggedActivity.id,
          data: { deadlineDate: deadlineDateStr }
        });
        
        // Stop auto-scroll if active
        stopAutoScroll();
        
        // Force refresh to get the updated status
        await queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });
        
        // Fetch the latest activity data to get the recalculated status
        const response = await fetch(api.activities.list.path);
        const allActivities = await response.json();
        const updatedActivity = allActivities.find((a: any) => a.id === draggedActivity.id);
        
        // Update selectedActivity if it's the same activity
        if (updatedActivity && selectedActivity && selectedActivity.id === draggedActivity.id) {
          setSelectedActivity(updatedActivity);
        }
        
        const timeStr = rescheduleTargetTime ? ` at ${rescheduleTargetTime}` : '';
        // Check if status changed to overdue
        const statusChangedToOverdue = updatedActivity && updatedActivity.status === 'overdue';
        const statusChangeMsg = statusChangedToOverdue ? ' Status changed to Overdue.' : '';
        toast({
          title: "Activity rescheduled",
          description: `Moved to ${format(rescheduleTargetDate, 'MMMM d, yyyy')}${timeStr}.${statusChangeMsg}`
        });
      } catch (error) {
        // Error handled by mutation
      }
    }
    setShowRescheduleConfirm(false);
    setDraggedActivity(null);
    setRescheduleTargetDate(null);
    setRescheduleTargetTime(null);
    setDropTargetDate(null);
    setDropTargetTime(null);
  };

  // Handle clearing all selections (date and time slot)
  const handleClearSelection = () => {
    setSelectedDate(null);
    setSelectedTimeSlot(null);
  };

  // Handle selecting a time slot in Day/Week view (highlights the time but doesn't open modal)
  const handleSelectTimeSlot = (date: Date, time: string) => {
    // If clicking on the same time slot, deselect it
    if (selectedDate && isSameDay(date, selectedDate) && selectedTimeSlot === time) {
      setSelectedTimeSlot(null);
    } else {
      setSelectedDate(date);
      setActivityTime(time);
      setSelectedTimeSlot(time);
    }
  };

  // Handle creating activity from Day/Week view with pre-selected date and time
  const handleCreateActivityFromTimeSlot = () => {
    if (selectedDate) {
      setIsNewActivityOpen(true);
    }
  };

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  // Mobile double-click detection state
  const [lastClickedDate, setLastClickedDate] = useState<Date | null>(null);
  const lastClickTimeRef = useRef<number>(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const DOUBLE_CLICK_DELAY = 300; // milliseconds

  // Optimized timeout cleanup functions
  const clearDateClickTimeout = useCallback(() => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    setLastClickedDate(null);
    lastClickTimeRef.current = 0;
  }, []);

  const clearTimeSlotClickTimeout = useCallback(() => {
    if (timeSlotClickTimerRef.current) {
      clearTimeout(timeSlotClickTimerRef.current);
      timeSlotClickTimerRef.current = null;
    }
    setLastClickedTimeSlot(null);
    lastTimeSlotClickTimeRef.current = 0;
  }, []);
  
  // Mobile double-click detection for time slots
  const [lastClickedTimeSlot, setLastClickedTimeSlot] = useState<string | null>(null);
  const lastTimeSlotClickTimeRef = useRef<number>(0);
  const timeSlotClickTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate padding days for grid alignment
  const startDay = startOfMonth(currentDate).getDay();
  const paddingDays = Array.from({ length: startDay });

  // Handle single/double click detection for mobile
  const handleDateClick = useCallback((date: Date) => {
    const now = Date.now();
    
    // If this is the same date clicked recently, it's a double click
    if (lastClickedDate && isSameDay(date, lastClickedDate) && (now - lastClickTimeRef.current) < DOUBLE_CLICK_DELAY) {
      // Double click - open modal
      setDayActivitiesModalDate(date);
      setDayActivitiesPage(1);
      setShowDayActivitiesModal(true);
      
      // Clear the timer and state
      clearDateClickTimeout();
    } else {
      // Single click or click on different date - select the date
      if (selectedDate && isSameDay(date, selectedDate)) {
        setSelectedDate(null);
      } else {
        setSelectedDate(date);
      }
      
      // Update last clicked info
      setLastClickedDate(date);
      lastClickTimeRef.current = now;
      
      // Clear previous timer
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
      
      // Set timer to reset the double-click state after delay
      clickTimerRef.current = setTimeout(clearDateClickTimeout, DOUBLE_CLICK_DELAY);
    }
  }, [selectedDate, lastClickedDate, clearDateClickTimeout]);

  // Handle single/double click detection for time slots on mobile
  const handleTimeSlotClick = useCallback((date: Date, time: string) => {
    // First, handle the single click selection
    handleSelectTimeSlot(date, time);
    
    // Now handle double-click detection for modal opening
    const now = Date.now();
    const timeSlotKey = `${date.toISOString()}-${time}`;
    
    // If this is the same time slot clicked recently, it's a double click
    if (lastClickedTimeSlot === timeSlotKey && (now - lastTimeSlotClickTimeRef.current) < DOUBLE_CLICK_DELAY) {
      // Double click - open modal for time slot activities
      const dayActivities = (activities || []).filter(a => isSameDay(getEffectiveActivityDate(a), date));
      const timeSlotActivities = dayActivities.filter(a => {
        const activityHour = new Date(a.deadlineDate).getHours();
        const [slotHour] = time.split(':').map(Number);
        return activityHour === slotHour;
      });
      
      setTimeSlotActivitiesModalData({ date, time, activities: timeSlotActivities });
      setShowTimeSlotActivitiesModal(true);
      
      // Clear the timer and state
      clearTimeSlotClickTimeout();
    } else {
      // Single click - update last clicked info
      setLastClickedTimeSlot(timeSlotKey);
      lastTimeSlotClickTimeRef.current = now;
      
      // Clear previous timer
      if (timeSlotClickTimerRef.current) {
        clearTimeout(timeSlotClickTimerRef.current);
      }
      
      // Set timer to reset the double-click state after delay
      timeSlotClickTimerRef.current = setTimeout(clearTimeSlotClickTimeout, DOUBLE_CLICK_DELAY);
    }
  }, [handleSelectTimeSlot, lastClickedTimeSlot, clearTimeSlotClickTimeout]);

  const handleCreate = async () => {
    if (!title || !selectedDate) return;
    
    // Combine selected date with activity time
    const [hours, minutes] = activityTime.split(':').map(Number);
    const deadlineWithTime = new Date(selectedDate);
    deadlineWithTime.setHours(hours, minutes, 0, 0);
    
    await createActivity.mutateAsync({
      title,
      description,
      startDate: selectedDate,
      deadlineDate: deadlineWithTime,
      status: 'pending',
      regulatoryAgency: regulatoryAgency || null,
      concernDepartment: concernDepartment.length > 0 ? concernDepartment.join(", ") : null,
      reportDetails: reportDetails || null,
      remarks: remarks || null,
      recurrence: recurrence !== 'none' ? recurrence : null,
      recurrenceEndDate: recurrence !== 'none' && recurrenceEndDate ? new Date(recurrenceEndDate) : null,
    });
    setIsNewActivityOpen(false);
    setSelectedDate(null);
    setTitle("");
    setDescription("");
    setActivityTime("23:59");
    setRegulatoryAgency("");
    setConcernDepartment([]);
    setRecurrence("none");
    setRecurrenceEndDate("");
    setReportDetails("");
    setRemarks("");
  };

  const getStatusColor = (status: string | null) => {
    switch(status) {
      case 'completed': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'overdue': return 'bg-red-100 text-red-800 border-red-200';
      case 'late': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'in-progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-amber-100 text-amber-800 border-amber-200';
    }
  };

  // Get the border color for a status (used for left border)
  const getStatusBorderColor = (status: string | null) => {
    switch(status) {
      case 'completed': return 'border-l-4 border-emerald-500';
      case 'overdue': return 'border-l-4 border-red-500';
      case 'late': return 'border-l-4 border-orange-500';
      case 'in-progress': return 'border-l-4 border-blue-500';
      default: return 'border-l-4 border-amber-500';
    }
  };

  // Get multi-colored border for a day cell with multiple activities
  const getMultiStatusBorderColor = (activities: any[]): { borderClass: string; style?: React.CSSProperties } => {
    if (!activities || activities.length === 0) return { borderClass: '', style: undefined };
    
    // Get unique statuses from activities
    const statuses = Array.from(new Set(activities.map(a => a.status)));
    
    if (statuses.length === 0) return { borderClass: '', style: undefined };
    if (statuses.length === 1) {
      // Single status - use the regular border color
      return { borderClass: getStatusBorderColor(statuses[0]), style: undefined };
    }
    
    // Multiple statuses - create a striped gradient border effect
    // Map statuses to hex colors
    const colorMap: Record<string, string> = {
      'completed': '#10b981', // emerald-500
      'overdue': '#ef4444', // red-500
      'late': '#f97316', // orange-500
      'in-progress': '#3b82f6', // blue-500
      'pending': '#f59e0b', // amber-500
    };
    
    // Build gradient colors for the border
    const colors = statuses.map(status => colorMap[status] || colorMap['pending']);
    
    // Create a repeating linear gradient for striped effect
    const stripeWidth = 100 / colors.length;
    const gradientStops = colors.map((color, i) => 
      `${color} ${i * stripeWidth}% ${(i + 1) * stripeWidth}%`
    ).join(', ');
    
    return { 
      borderClass: 'border-l-4', 
      style: { 
        borderImage: `linear-gradient(to bottom, ${gradientStops}) 1`,
        borderLeftWidth: '4px',
        borderLeftStyle: 'solid'
      } 
    };
  };

  // Get activities for selected date
  const selectedDateActivities = selectedDate
    ? activities?.filter(a => isSameDay(getEffectiveActivityDate(a), selectedDate)) || []
    : [];

  const handleDeleteAllByDate = async () => {
    if (!selectedDate) return;
    
    setIsDeletingAll(true);
    try {
      // Delete all activities for the selected date using direct API calls to avoid multiple toasts
      const deleteResults = await Promise.all(
        selectedDateActivities.map(async (activity) => {
          const url = buildUrl(api.activities.delete.path, { id: activity.id });
          const response = await fetch(url, { method: api.activities.delete.method });
          return { id: activity.id, success: response.ok };
        })
      );
      
      const failedCount = deleteResults.filter(r => !r.success).length;
      
      // Invalidate queries to refresh the list
      queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });
      
      setShowDeleteAllConfirm(false);
      setSelectedDate(null);
      
      if (failedCount === 0) {
        toast({
          title: "Deleted",
          description: `All ${selectedDateActivities.length} activities for ${format(selectedDate, 'MMMM d, yyyy')} have been deleted`,
        });
      } else if (selectedDateActivities.length - failedCount > 0) {
        toast({
          title: "Partially Deleted",
          description: `${selectedDateActivities.length - failedCount} activities deleted. ${failedCount} failed to delete.`,
        });
      } else {
        toast({ title: "Error", description: "Failed to delete activities. Please try again.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Failed to delete activities:", error);
      toast({ title: "Error", description: "Failed to delete activities. Please try again.", variant: "destructive" });
    } finally {
      setIsDeletingAll(false);
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
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setSelectedFiles([...selectedFiles, ...validFiles]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedActivity || selectedFiles.length === 0) return;

    // Calculate deadline year/month from activity (before file reading)
    const deadlineDate = new Date(selectedActivity.deadlineDate);
    const deadlineYear = deadlineDate.getFullYear();
    const deadlineMonth = deadlineDate.getMonth() + 1;

    setIsSubmitting(true);
    try {
      // Read all files first
      const fileReaders = selectedFiles.map(file => {
        return new Promise<{ name: string; type: string; size: number; data: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              name: file.name,
              type: file.type,
              size: file.size,
              data: reader.result as string
            });
          };
          reader.onerror = () => reject(new Error('File reading failed'));
          reader.readAsDataURL(file);
        });
      });

      const fileDataArray = await Promise.all(fileReaders);

      // Send all files in one request
      const response = await fetch(`/api/activities/${selectedActivity.id}/submit-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: fileDataArray,
          activityTitle: selectedActivity.title,
          suppressNotification: true,
          deadlineYear,
          deadlineMonth,
          submissionDate: submissionDate.toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();

      // Fetch users list once for notification creation
      const usersResponse = await fetch(api.users.list.path);
      const users = await usersResponse.json();
      
      // Create notifications in parallel (one per user, not per file)
      const notificationPromises = users
        .filter((recipient: any) => recipient.id !== user?.id)
        .map((recipient: any) => 
          fetch(api.notifications.create.path, {
            method: api.notifications.create.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: recipient.id,
              activityId: selectedActivity.id,
              title: 'Activity Submitted',
              content: `${user?.fullName || 'A user'} submitted ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} for: ${selectedActivity.title}`,
              isRead: false
            })
          })
        );
      await Promise.all(notificationPromises);

      toast({
        title: "Submission successful",
        description: `Successfully submitted ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}!`,
      });
      
      // Fetch the updated activity to get the new status
      const activityRes = await fetch(api.activities.list.path);
      const allActivities = await activityRes.json();
      const updatedActivity = allActivities.find((a: any) => a.id === selectedActivity.id);
      if (updatedActivity) {
        setSelectedActivity(updatedActivity);
      }
      
      setIsActivityModalOpen(false);
      setSelectedFiles([]);
      // Refresh activities and notifications without page reload
      queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] });
      // Also refresh folders and reports so Drive page reflects changes in real-time
      queryClient.invalidateQueries({ queryKey: [api.folders.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.reports.list.path] });
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
    <>
       {/* Delete Holiday Confirmation Dialog */}
        <Dialog open={showDeleteHolidayConfirm} onOpenChange={(open) => {
          setShowDeleteHolidayConfirm(open);
          if (!open) {
            // Only reset states when user manually closes/cancels the modal
            // Don't reset isDeletingHolidayId - it should persist until deletion completes
            setHolidayToDelete(null);
          }
        }}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Delete Holiday</DialogTitle>
             <DialogDescription>
               Are you sure you want to delete "{holidayToDelete?.name}"? This action cannot be undone.
             </DialogDescription>
           </DialogHeader>
           <DialogFooter>
             <Button variant="outline" onClick={() => setShowDeleteHolidayConfirm(false)}>
               Cancel
             </Button>
                <Button
                  variant="destructive"
                  disabled={isDeletingHolidayId === holidayToDelete?.id}
                  onClick={async () => {
                    if (holidayToDelete) {
                      setIsDeletingHolidayId(holidayToDelete.id);
                      // Close modal immediately
                      setShowDeleteHolidayConfirm(false);
                      const holidayId = holidayToDelete.id;
                      setHolidayToDelete(null);

                      try {
                        await deleteHoliday.mutateAsync(holidayId);
                      } catch (error) {
                        console.error('Failed to delete holiday:', error);
                      } finally {
                        // Reset deleting state after mutation completes (success or error)
                        setIsDeletingHolidayId(null);
                      }
                    }
                  }}
                >
                  {isDeletingHolidayId === holidayToDelete?.id ? 'Deleting...' : 'Delete'}
                </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

      {/* Delete Recurring Activities Confirmation Dialog */}
      <Dialog open={showDeleteRecurConfirm} onOpenChange={setShowDeleteRecurConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Recurring Activities</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete all occurrences of a recurring activity type for a specific year? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteRecurConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeletingRecurring}
              onClick={async () => {
                setIsDeletingRecurring(true);
                setShowDeleteRecurConfirm(false);
                try {
                  const deleteResults = await Promise.all(
                    deleteRecurPreview.map(async (activity) => {
                      const url = buildUrl(api.activities.delete.path, { id: activity.id });
                      const response = await fetch(url, { method: api.activities.delete.method });
                      return { id: activity.id, success: response.ok };
                    })
                  );
                  const failedCount = deleteResults.filter(r => !r.success).length;
                  queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });
                  setDeleteRecurPreview([]);
                  setDeleteRecurType("");
                  setDeleteRecurYear("");
                  if (failedCount === 0) {
                     toast({
                       title: "Deleted",
                       description: `All ${deleteResults.length} ${deleteRecurType} activities for ${deleteRecurYear} have been deleted`,
                     });
                  } else {
                    toast({
                      title: "Partially Deleted",
                       description: `${deleteResults.length - failedCount} activities deleted. ${failedCount} failed.`,
                       variant: "destructive"
                    });
                  }
                } catch (error) {
                  toast({ title: "Error", description: "Failed to delete activities. Please try again.", variant: "destructive" });
                } finally {
                  setIsDeletingRecurring(false);
                }
              }}
            >
              {isDeletingRecurring ? 'Deleting...' : 'Delete All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 mb-8">
        <div className="w-full">
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-primary mb-2 flex items-center gap-2">
            {isMobile ? (
              <button 
                type="button" 
                onClick={(e) => {
                  e.stopPropagation();
                  openSidebar();
                }} 
                className="p-1 hover:bg-muted rounded-md transition-colors"
                aria-label="Open menu"
              >
                <Menu className="w-8 h-8" />
              </button>
            ) : (
              <CalendarIcon className="w-8 h-8" />
            )}
            Activity Calendar
          </h1>
          <p className="text-muted-foreground text-sm lg:text-base">Manage your schedule and deadlines.</p>
        </div>
        
        {/* Action buttons - positioned based on screen size */}
        <div className="flex flex-row flex-wrap lg:flex-nowrap gap-1 lg:gap-2 place-items-start">
          {/* Holiday Management Button - first on mobile, third on desktop */}
          {canManageHolidays && (
           <Dialog open={isHolidayModalOpen} onOpenChange={(open) => {
             setIsHolidayModalOpen(open);
             if (!open) {
               // Reset form state
               setHolidayName("");
               setHolidayDate(undefined);
               setEditingHoliday(null);
               setHolidayPage(1);
               setIsAddingHoliday(false);
             }
           }}>
           <DialogTrigger asChild>
             <Button
               variant="outline"
               className="gap-2 whitespace-nowrap lg:order-3 order-1 w-auto"
               onClick={() => {
                 setEditingHoliday(null);
                 setHolidayName("");
                 setHolidayDate(selectedDate || undefined);
               }}
             >
               <CalendarDays className="w-4 h-4" />
               Manage Holidays
             </Button>
           </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-visible flex flex-col">
              <DialogHeader className="shrink-0 pb-4 border-b">
                <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                  <CalendarDays className="w-5 h-5" />
                  Holiday Management
                </DialogTitle>
                <DialogDescription className="text-sm">
                  Add or edit holidays. Activities will be automatically moved to the previous working day if they fall on holidays.
                </DialogDescription>
                <div className="flex items-center justify-between pt-2">
                  <Label htmlFor="holidays-enabled-modal" className="text-sm font-medium">
                    Enable Holidays
                  </Label>
                  <Switch
                    id="holidays-enabled-modal"
                    checked={holidaysEnabledData}
                    onCheckedChange={(checked) => updateHolidaysEnabled.mutate(checked)}
                  />
                </div>
              </DialogHeader>
              <div className="h-[400px] overflow-y-auto py-4 px-6 pb-8 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                <div className="space-y-6">
                  {/* Add/Edit Holiday Form */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                      {editingHoliday ? 'Edit Holiday' : 'Add New Holiday'}
                    </h3>
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="holidayName" className="text-sm font-medium">Holiday Name</Label>
                        <Input
                          id="holidayName"
                          value={holidayName}
                          onChange={(e) => setHolidayName(e.target.value)}
                          placeholder="New Year's Day"
                          className="h-10 border border-gray-300 dark:border-gray-600"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="holidayDate" className="text-sm font-medium">Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                             <Button id="holidayDate" variant="outline" className="h-10 w-full justify-start text-left font-normal !border-gray-300">
                              {holidayDate ? format(holidayDate, 'PPP') : <span className="text-muted-foreground">Pick a date</span>}
                             </Button>
                          </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={holidayDate}
                                onSelect={setHolidayDate}
                                initialFocus
                                holidays={holidays}
                                holidaysEnabled={holidaysEnabledData}
                              />
                            </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div className="flex gap-2">
                       <Button
                         onClick={async () => {
                           if (!holidayName || !holidayDate) return;

                           // Check if holiday date already exists (only when adding, not when editing)
                           if (!editingHoliday) {
                             const holidayExists = holidays?.some(h => isSameDay(new Date(h.date), holidayDate));
                             if (holidayExists) {
                               toast({
                                 title: "Holiday already exists",
                                 description: "A holiday is already configured for this date.",
                                 variant: "destructive"
                               });
                               return;
                             }
                           } else {
                             // When editing, check if another holiday has this date
                             const holidayExists = holidays?.some(h => h.id !== editingHoliday.id && isSameDay(new Date(h.date), holidayDate));
                             if (holidayExists) {
                               toast({
                                 title: "Holiday already exists",
                                 description: "Another holiday is already configured for this date.",
                                 variant: "destructive"
                               });
                               return;
                             }
                           }

                           setIsAddingHoliday(true);
                           try {
                             if (editingHoliday) {
                               await updateHoliday.mutateAsync({
                                 id: editingHoliday.id,
                                 data: {
                                   name: holidayName,
                                   date: holidayDate
                                 }
                               });
                             } else {
                               await createHoliday.mutateAsync({
                                 name: holidayName,
                                 date: holidayDate
                               });
                             }
                             setHolidayName("");
                             setHolidayDate(undefined);
                             setEditingHoliday(null);
                             setHolidayPage(1);
                           } catch (error) {
                             // Error handled by mutation
                           } finally {
                             setIsAddingHoliday(false);
                           }
                         }}
                          disabled={!holidayName || !holidayDate || isAddingHoliday || (editingHoliday && !hasHolidayChanges)}
                         className="gap-2"
                       >
                         {isAddingHoliday ? (
                           <>
                             {editingHoliday ? 'Updating...' : 'Adding...'}
                           </>
                         ) : (
                           <>
                             <Plus className="w-4 h-4" />
                             {editingHoliday ? 'Update Holiday' : 'Add Holiday'}
                           </>
                         )}
                       </Button>
                       {editingHoliday && (
                         <Button
                           variant="outline"
                           onClick={() => {
                             setHolidayName("");
                             setHolidayDate(undefined);
                             setEditingHoliday(null);
                           }}
                           disabled={isAddingHoliday}
                         >
                           Cancel
                         </Button>
                       )}
                     </div>
                  </div>

                   {/* Existing Holidays List */}
                   {holidays && holidays.length > 0 && (
                     <div className="space-y-4">
                       <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                         <span className="w-1 h-4 bg-green-500 rounded-full"></span>
                         Existing Holidays
                       </h3>
                       <div className="space-y-2">
                         {(() => {
                           const totalPages = Math.ceil((holidays?.length || 0) / holidaysPerPage);
                           const paginatedHolidays = holidays?.slice(
                             (holidayPage - 1) * holidaysPerPage,
                             holidayPage * holidaysPerPage
                           ) || [];

                           return (
                             <>
                               {paginatedHolidays.map((holiday: any) => (
                                 <div key={holiday.id} className="flex items-center justify-between p-3 border rounded-md">
                                   <div>
                                     <p className="font-medium">{holiday.name}</p>
                                     <p className="text-sm text-muted-foreground">{format(new Date(holiday.date), 'PPP')}</p>
                                   </div>
                                   <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setEditingHoliday(holiday);
                                          setHolidayName(holiday.name);
                                          setHolidayDate(new Date(holiday.date));
                                        }}
                                      >
                                        Edit
                                     </Button>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => {
                                          setHolidayToDelete(holiday);
                                          setShowDeleteHolidayConfirm(true);
                                        }}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                   </div>
                                 </div>
                               ))}
                               {/* Pagination - only show if more than 5 holidays */}
                               {(holidays?.length || 0) > holidaysPerPage && (
                                 <div className="flex items-center justify-between pt-4 border-t mt-4">
                                   <p className="text-sm text-muted-foreground">
                                     Page {holidayPage} of {totalPages}
                                   </p>
                                   <div className="flex gap-2">
                                     <Button
                                       variant="outline"
                                       size="sm"
                                       onClick={() => setHolidayPage(p => Math.max(1, p - 1))}
                                       disabled={holidayPage === 1}
                                     >
                                       <ChevronLeft className="w-4 h-4" />
                                     </Button>
                                     <Button
                                       variant="outline"
                                       size="sm"
                                       onClick={() => setHolidayPage(p => Math.min(totalPages, p + 1))}
                                       disabled={holidayPage === totalPages}
                                     >
                                       <ChevronRight className="w-4 h-4" />
                                     </Button>
                                   </div>
                                 </div>
                               )}
                             </>
                           );
                         })()}
                       </div>
                     </div>
                   )}
                </div>
              </div>
             </DialogContent>
           </Dialog>
          )}

           {/* Add Activity Button - second on mobile, second on desktop */}
          <Dialog open={isNewActivityOpen} onOpenChange={(open) => {
            setIsNewActivityOpen(open);
            if (!open) {
              // Reset form state
              setTitle("");
              setDescription("");
              setActivityTime("23:59");
              setRegulatoryAgency("");
              setConcernDepartment([]);
              setRecurrence("none");
              setRecurrenceEndDate("");
              setReportDetails("");
              setRemarks("");
            }
          }}>
            <DialogTrigger asChild>
              <Button
                className="gap-2 shadow-lg shadow-primary/20 bg-primary whitespace-nowrap w-auto lg:order-2 order-2"
                disabled={!selectedDate || (selectedDate && isDateHolidayOrWeekend(selectedDate))}
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
                  // Only reset time to default (23:59) when adding from Month View
                  // In Day/Week view, use the selected time slot if available
                  if (view === 'month') {
                    setActivityTime("23:59");
                    setSelectedTimeSlot(null);
                  }
                  setIsNewActivityOpen(true);
                }}
              >
                <Plus className="w-4 h-4" />
                {selectedDate
                  ? isDateHolidayOrWeekend(selectedDate)
                    ? `${isDateHoliday(selectedDate) ? 'Holiday' : 'Weekend'}`
                    : `Add Activity for ${format(selectedDate, 'MMMM d')}`
                  : 'Select Date'}
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-visible flex flex-col">
            <DialogHeader className="shrink-0 pb-4 border-b">
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                New Activity
              </DialogTitle>
              <DialogDescription className="text-sm">
                Create a new activity for {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'the selected date'}.
              </DialogDescription>
            </DialogHeader>
            <div className="h-[400px] overflow-y-auto py-4 px-6 pb-8 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
              <div className="space-y-6">
                {/* Basic Info Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1 h-4 bg-primary rounded-full"></span>
                    Basic Information
                  </h3>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title" className="text-sm font-medium">Title</Label>
                      <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Submit Q1 Report" className="h-10 border border-gray-300 dark:border-gray-600" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="desc" className="text-sm font-medium">Description</Label>
                      <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the activity" className="resize-none border border-gray-300 dark:border-gray-600" rows={2} />
                    </div>
                  </div>
                </div>

                {/* Agency & Department Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                    Agency & Department
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="regulatoryAgency" className="text-sm font-medium">Regulatory Agency</Label>
                      <Select value={regulatoryAgency} onValueChange={setRegulatoryAgency}>
                        <SelectTrigger id="regulatoryAgency" className="h-10 border border-gray-300 dark:border-gray-600">
                          <SelectValue placeholder="Select agency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DOE">DOE</SelectItem>
                          <SelectItem value="ERC">ERC</SelectItem>
                          <SelectItem value="NEA">NEA</SelectItem>
                          <SelectItem value="NEA-WEB PORTAL">NEA-WEB PORTAL</SelectItem>
                          <SelectItem value="IEMOP">IEMOP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="concernDepartment" className="text-sm font-medium">Concern Department</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button id="concernDepartment" variant="outline" className="h-10 w-full justify-between border-gray-400 font-normal" style={{ borderColor: '#9ca3af' }}>
                            {concernDepartment.length > 0 ? (
                              <span className="truncate">
                                {concernDepartment.join(", ")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Select departments</span>
                            )}
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-2" align="start">
                          <div className="space-y-2">
                            {/* ERC Departments */}
                            {regulatoryAgency === 'ERC' && (
                              <>
                                <div className="text-xs font-medium text-muted-foreground px-2 py-1">ERC Departments</div>
                                {["FSD-CACD", "ISD-MSD", "CITET-ETS", "ISD-CWDC", "TSD-DNOD", "TSD-DAMD"].map((dept) => (
                                  <label key={dept} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded-md cursor-pointer">
                                    <Checkbox
                                      checked={concernDepartment.includes(dept)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setConcernDepartment([...concernDepartment, dept]);
                                        } else {
                                          setConcernDepartment(concernDepartment.filter(d => d !== dept));
                                        }
                                      }}
                                    />
                                    <span className="text-sm">{dept}</span>
                                  </label>
                                ))}
                              </>
                            )}
                            {/* NEA-WEB PORTAL Departments */}
                            {regulatoryAgency === 'NEA-WEB PORTAL' && (
                              <>
                                <div className="text-xs font-medium text-muted-foreground px-2 py-1">NEA-WEB PORTAL Departments</div>
                                {["TSD-DAMD", "ISD-MSD", "FSD-GAD", "ZONE-ZOS", "OGM", "TSD-DNOD", "CITET-ETS"].map((dept) => (
                                  <label key={dept} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded-md cursor-pointer">
                                    <Checkbox
                                      checked={concernDepartment.includes(dept)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setConcernDepartment([...concernDepartment, dept]);
                                        } else {
                                          setConcernDepartment(concernDepartment.filter(d => d !== dept));
                                        }
                                      }}
                                    />
                                    <span className="text-sm">{dept}</span>
                                  </label>
                                ))}
                              </>
                            )}
                            {/* IEMOP Departments */}
                            {regulatoryAgency === 'IEMOP' && (
                              <>
                                <div className="text-xs font-medium text-muted-foreground px-2 py-1">IEMOP Departments</div>
                                {["FSD-CASHIER", "FSD-ACCOUNTING CLERK"].map((dept) => (
                                  <label key={dept} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded-md cursor-pointer">
                                    <Checkbox
                                      checked={concernDepartment.includes(dept)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setConcernDepartment([...concernDepartment, dept]);
                                        } else {
                                          setConcernDepartment(concernDepartment.filter(d => d !== dept));
                                        }
                                      }}
                                    />
                                    <span className="text-sm">{dept}</span>
                                  </label>
                                ))}
                              </>
                            )}
                            {/* DOE Departments */}
                            {regulatoryAgency === 'DOE' && (
                              <>
                                <div className="text-xs font-medium text-muted-foreground px-2 py-1">DOE Departments</div>
                                {["CITET-ETS", "CITET-CPS"].map((dept) => (
                                  <label key={dept} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded-md cursor-pointer">
                                    <Checkbox
                                      checked={concernDepartment.includes(dept)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setConcernDepartment([...concernDepartment, dept]);
                                        } else {
                                          setConcernDepartment(concernDepartment.filter(d => d !== dept));
                                        }
                                      }}
                                    />
                                    <span className="text-sm">{dept}</span>
                                  </label>
                                ))}
                              </>
                            )}
                            {/* NEA Departments */}
                            {regulatoryAgency === 'NEA' && (
                              <>
                                <div className="text-xs font-medium text-muted-foreground px-2 py-1">NEA Departments</div>
                                {["CITET-ETS", "TSD-DAMD"].map((dept) => (
                                  <label key={dept} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded-md cursor-pointer">
                                    <Checkbox
                                      checked={concernDepartment.includes(dept)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setConcernDepartment([...concernDepartment, dept]);
                                        } else {
                                          setConcernDepartment(concernDepartment.filter(d => d !== dept));
                                        }
                                      }}
                                    />
                                    <span className="text-sm">{dept}</span>
                                  </label>
                                ))}
                              </>
                            )}
                            {/* Default/show all when no agency selected */}
                            {!regulatoryAgency && (
                              <>
                                <div className="text-xs font-medium text-muted-foreground px-2 py-1">All Departments</div>
                                {["CITET-CPS", "CITET-ETS", "FSD-CACD", "ISD-MSD", "ISD-CWDC", "TSD-DAMD", "TSD-DNOD", "ZONE-ZOS", "OGM", "FSD-CASHIER", "FSD-ACCOUNTING CLERK"].map((dept) => (
                                  <label key={dept} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded-md cursor-pointer">
                                    <Checkbox
                                      checked={concernDepartment.includes(dept)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setConcernDepartment([...concernDepartment, dept]);
                                        } else {
                                          setConcernDepartment(concernDepartment.filter(d => d !== dept));
                                        }
                                      }}
                                    />
                                    <span className="text-sm">{dept}</span>
                                  </label>
                                ))}
                              </>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    
                    {/* Recurrence Section */}
                    <div className="space-y-2">
                      <Label htmlFor="recurrence" className="text-sm font-medium">Recurrence</Label>
                      <Select value={recurrence} onValueChange={setRecurrence}>
                        <SelectTrigger id="recurrence" className="h-10 border border-gray-300 dark:border-gray-600 text-left">
                          <SelectValue placeholder="Select recurrence" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly (Every 3 months)</SelectItem>
                          <SelectItem value="semi-annual">Semi-Annual (Every 6 months)</SelectItem>
                          <SelectItem value="yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Recurrence End Date - only show if recurrence is not none */}
                    {recurrence !== 'none' && (
                      <div className="space-y-2">
                        <Label htmlFor="recurrenceEnd" className="text-sm font-medium">Recurrence End {recurrence === 'yearly' ? 'Year' : 'Date'}</Label>
                        {recurrence === 'yearly' ? (
                          // Yearly: only show year picker
                          <Select value={recurrenceEndDate ? recurrenceEndDate.split('-')[0] : ''} onValueChange={(value) => setRecurrenceEndDate(value + '-01-01')}>
                            <SelectTrigger id="recurrenceEnd" className="h-10 border border-gray-300 dark:border-gray-600 text-left">
                              <SelectValue placeholder="Select end year" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map(year => (
                                <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          // Monthly, Quarterly, Semi-Annual: show month and year picker
                          <Select value={recurrenceEndDate ? recurrenceEndDate.substring(0, 7) : ''} onValueChange={(value) => setRecurrenceEndDate(value + '-01')}>
                            <SelectTrigger id="recurrenceEnd" className="h-10 border border-gray-300 dark:border-gray-600 text-left">
                              <SelectValue placeholder="Select end month and year" />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {(() => {
                                const options: { year: number; month: string; value: string }[] = [];
                                // Use selectedDate if available, otherwise use current date
                                const baseDate = selectedDate || new Date();
                                // Start from the next month after the selected date
                                const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);
                                
                                // Determine the interval based on recurrence type
                                let interval: number;
                                switch (recurrence) {
                                  case 'quarterly':
                                    interval = 3;
                                    break;
                                  case 'semi-annual':
                                    interval = 6;
                                    break;
                                  default:
                                    interval = 1; // monthly
                                }
                                
                                for (let i = 0; i < 60; i++) {
                                  const date = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
                                  const year = date.getFullYear();
                                  const month = date.getMonth() + 1;
                                  
                                  // Only include months that match the recurrence interval
                                  if (recurrence === 'monthly' || (month - 1) % interval === 0) {
                                    const monthStr = String(month).padStart(2, '0');
                                    const value = `${year}-${monthStr}`;
                                    options.push({ year, month: monthStr, value });
                                  }
                                }
                                return options.map(({ year, month, value }) => (
                                  <SelectItem key={value} value={value}>{new Date(year, parseInt(month) - 1).toLocaleString('default', { month: 'long' })} {year}</SelectItem>
                                ));
                              })()}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Reports Detail Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1 h-4 bg-green-500 rounded-full"></span>
                    Report Details
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="reportDetails" className="text-sm font-medium">Reports Detail</Label>
                    <Textarea id="reportDetails" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} placeholder="Details about the report to be submitted" className="resize-none border border-gray-300 dark:border-gray-600" rows={3} />
                  </div>
                </div>

                {/* Deadline Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1 h-4 bg-orange-500 rounded-full"></span>
                    Deadline
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="time" className="text-sm font-medium">Time</Label>
                    <Input 
                      id="time" 
                      type="time" 
                      value={activityTime} 
                      onChange={(e) => setActivityTime(e.target.value)} 
                      className="h-10 border border-gray-300 dark:border-gray-600"
                    />
                    <p className="text-xs text-muted-foreground">Set the time (optional, defaults to end of day)</p>
                  </div>
                </div>

                {/* Remarks Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1 h-4 bg-purple-500 rounded-full"></span>
                    Additional Notes
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="remarks" className="text-sm font-medium">Remarks</Label>
                    <Textarea id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Additional notes or remarks" className="resize-none border border-gray-300 dark:border-gray-600" rows={2} />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="shrink-0 pt-4 border-t mt-4">
              <div className="flex gap-3 w-full justify-end">
                <Button variant="outline" onClick={() => setIsNewActivityOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createActivity.isPending || !title || !regulatoryAgency || concernDepartment.length === 0 || (recurrence !== 'none' && !recurrenceEndDate)}>
                  {createActivity.isPending ? (
                    <>
                      Adding...
                    </>
                  ) : (
                    <>
                      Add Activity
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete All Activities Button - spans full width on mobile, first on desktop */}
        {canDeleteActivities && selectedDate && selectedDateActivities.length > 0 && (
          <Button
            variant="destructive"
            onClick={() => setShowDeleteAllConfirm(true)}
            className="gap-2 whitespace-nowrap w-auto lg:order-1 order-3"
            disabled={isDeletingAll}
          >
            <Trash2 className="w-4 h-4" />
            {isDeletingAll ? "Deleting..." : `Delete All (${selectedDateActivities.length})`}
          </Button>
        )}

        </div>

        {/* Day Activities Modal */}
        {dayActivitiesModalDate && (() => {
          const dayActs = (activities || []).filter(a =>
            isSameDay(getEffectiveActivityDate(a), dayActivitiesModalDate)
          );
          const totalPages = Math.ceil(dayActs.length / dayActivitiesPerPage);
          const paginatedActivities = dayActs.slice(
            (dayActivitiesPage - 1) * dayActivitiesPerPage,
            dayActivitiesPage * dayActivitiesPerPage
          );

          // Check if the date is a holiday or weekend
          const isHoliday = isDateHoliday(dayActivitiesModalDate);
          const isWeekend = isDateWeekend(dayActivitiesModalDate);
          const isHolidayOrWeekend = isWeekend || (holidaysEnabledData && isHoliday);
          
          return (
            <Dialog open={showDayActivitiesModal} onOpenChange={(open) => {
              setShowDayActivitiesModal(open);
              if (!open) {
                setDayActivitiesModalDate(null);
                setDayActivitiesPage(1);
              }
            }}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-visible flex flex-col">
                <DialogHeader className="shrink-0 pb-2">
                  <div className="flex items-center justify-between pr-8">
                    <DialogTitle>
                      Activities for {format(dayActivitiesModalDate, 'MMMM d, yyyy')}
                    </DialogTitle>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isHolidayOrWeekend}
                        onClick={() => {
                          if (dayActivitiesModalDate && !isDateHoliday(dayActivitiesModalDate)) {
                            setHolidayDate(dayActivitiesModalDate);
                            setHolidayName("");
                            setEditingHoliday(null);
                            setShowDayActivitiesModal(false);
                            setIsHolidayModalOpen(true);
                          }
                        }}
                      >
                        <CalendarDays className="w-4 h-4 mr-2" />
                        Make Holiday
                      </Button>
                      <Button
                        size="sm"
                        disabled={isHolidayOrWeekend}
                        onClick={() => {
                          setSelectedDate(dayActivitiesModalDate);
                          setNewActivityFromDayModal(true);
                          setIsNewActivityOpen(true);
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {isHolidayOrWeekend
                          ? `${isHoliday ? 'Holiday' : 'Weekend'}`
                          : 'Add Activity'
                        }
                      </Button>
                    </div>
                  </div>
                  <DialogDescription>
                    Total: {dayActs.length} {dayActs.length === 1 ? "activity" : "activities"}
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-2 py-4 px-4">
                  {paginatedActivities.length === 0 && !isHolidayOrWeekend ? (
                    <p className="text-center text-muted-foreground py-8">No activities for this day</p>
                  ) : paginatedActivities.length === 0 && isHolidayOrWeekend ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="p-6 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md max-w-md mx-auto">
                          <p className="text-lg text-amber-800 dark:text-amber-200 font-medium mb-2">
                            🏖️ {isHoliday ? `Holiday: ${holidays?.find(h => isSameDay(new Date(h.date), dayActivitiesModalDate))?.name}` : 'Weekend'}
                          </p>
                          <p className="text-sm text-amber-700 dark:text-amber-300">
                            Activities cannot be created on {isHoliday ? 'holidays' : 'weekends'} and will be automatically moved to the next working day.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    paginatedActivities.map(activity => (
                      <div
                        key={activity.id}
                        className={cn(
                          "p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors",
                          getStatusBorderColor(activity.status)
                        )}
                        onClick={() => {
                          setSelectedActivity(activity);
                          // Only reset if clicking a different activity
                          setStartingActivityId(current => current === activity.id ? current : null);
                          setDeletingActivityId(current => current === activity.id ? current : null);
                          setActivityFromDayModal(true);
                          setIsActivityModalOpen(true);
                          // Clear previous submissions and show loading
                          setActivitySubmissions([]);
                          setIsLoadingSubmissions(true);
                          // Fetch submissions for this activity when modal opens
                          fetch(`/api/activities/${activity.id}/submissions`)
                            .then(res => res.json())
                            .then(data => {
                              setActivitySubmissions(data);
                              setIsLoadingSubmissions(false);
                            })
                            .catch(err => {
                              console.error('Failed to fetch submissions:', err);
                              setIsLoadingSubmissions(false);
                            });
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{activity.title}</span>
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-xs",
                            activity.status === 'completed' || activity.status === 'late' ? "bg-green-100 text-green-700" :
                            activity.status === 'overdue' ? "bg-red-100 text-red-700" :
                            activity.status === 'in-progress' ? "bg-blue-100 text-blue-700" :
                            "bg-orange-100 text-orange-700"
                          )}>
                            {activity.status}
                          </span>
                        </div>
                        {activity.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {activity.description}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
                </ScrollArea>
                {dayActs.length > dayActivitiesPerPage && (
                  <div className="shrink-0 flex items-center justify-between p-4 border-t bg-muted/10">
                    <p className="text-sm text-muted-foreground">
                      Page {dayActivitiesPage} of {totalPages}
                    </p>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDayActivitiesPage(p => Math.max(1, p - 1))}
                        disabled={dayActivitiesPage === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDayActivitiesPage(p => Math.min(totalPages, p + 1))}
                        disabled={dayActivitiesPage === totalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          );
        })()}

        {/* Activity Submission Modal */}
        <Dialog open={isActivityModalOpen} onOpenChange={(open) => {
          setIsActivityModalOpen(open);
          if (!open) {
            setSelectedFiles([]);
            setSelectedActivity(null);
            setIsLoadingSubmissions(false);
            // Keep startingActivityId when closing modal - it persists for the same activity
            // Reopen day activities modal if it was opened from there
            if (activityFromDayModal && dayActivitiesModalDate) {
              setShowDayActivitiesModal(true);
              setActivityFromDayModal(false);
            }
          }
        }}>
          <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {selectedActivity?.title}
              </DialogTitle>
              <DialogDescription>
                Submit your report for this activity
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 overflow-y-auto max-h-[calc(90vh-180px)] px-3">
              {/* Activity Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Description</h4>
                  <p className="text-sm">{selectedActivity?.description || 'No description provided'}</p>
                </div>
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Deadline</h4>
                  <div className="flex items-start gap-2 flex-col">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {selectedActivity ? format(new Date(selectedActivity.deadlineDate), 'PPP') : ''}
                    </span>
                  </div>
                </div>
                {selectedActivity?.regulatoryAgency && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Regulatory Agency</h4>
                    <p className="text-sm">{selectedActivity.regulatoryAgency}</p>
                  </div>
                )}
                {selectedActivity?.concernDepartment && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Concern Department</h4>
                    <p className="text-sm">{selectedActivity.concernDepartment}</p>
                  </div>
                )}
                {selectedActivity?.reportDetails && (
                  <div className="md:col-span-2">
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Reports Detail</h4>
                    <p className="text-sm">{selectedActivity.reportDetails}</p>
                  </div>
                )}
                {selectedActivity?.remarks && (
                  <div className="md:col-span-2">
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Remarks</h4>
                    <p className="text-sm">{selectedActivity.remarks}</p>
                  </div>
                )}
              </div>

              {/* Status Badge */}
              <div className="flex items-center justify-center">
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2",
                  selectedActivity?.status === 'completed' && "bg-green-100 text-green-700",
                  selectedActivity?.status === 'overdue' && "bg-red-100 text-red-700",
                  selectedActivity?.status === 'in-progress' && "bg-blue-100 text-blue-700",
                  selectedActivity?.status === 'late' && "bg-yellow-100 text-yellow-700",
                  selectedActivity?.status === 'pending' && "bg-orange-100 text-orange-700"
                )}>
                  {selectedActivity?.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                  {selectedActivity?.status === 'overdue' && <AlertCircle className="w-3 h-3" />}
                  {selectedActivity?.status === 'in-progress' && <Clock className="w-3 h-3" />}
                  {selectedActivity?.status === 'late' && <AlertCircle className="w-3 h-3" />}
                  {selectedActivity?.status === 'pending' && <Clock className="w-3 h-3" />}
                  {selectedActivity?.status === 'completed' ? 'Completed' :
                   selectedActivity?.status === 'overdue' ? 'Overdue' :
                   selectedActivity?.status === 'late' ? 'Late Submitted' :
                   selectedActivity?.status === 'in-progress' ? 'In Progress' :
                   selectedActivity?.status === 'pending' ? 'Pending' : 'Unknown'}
                </div>
              </div>

              {/* Submission Date Picker */}
              {(selectedActivity?.status === 'in-progress' || selectedActivity?.status === 'overdue') && (
                <div className="space-y-2">
                  <Label htmlFor="submissionDate" className="text-sm font-medium">Submission Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="submissionDate"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal !border-gray-300 dark:!border-gray-600",
                          !submissionDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {submissionDate ? format(submissionDate, 'PPP') : <span>Pick submission date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={submissionDate}
                        onSelect={(date) => date && setSubmissionDate(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Loading indicator for submissions */}
              {(selectedActivity?.status === 'completed' || selectedActivity?.status === 'late') && isLoadingSubmissions && (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading submitted files...</span>
                </div>
              )}

              {/* Submitted Files Section - Show files that have been submitted */}
              {(selectedActivity?.status === 'completed' || selectedActivity?.status === 'late') && activitySubmissions.length > 0 && !isLoadingSubmissions && (
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Submitted Files</h4>
                  <div className="space-y-2 overflow-y-auto">
                    {activitySubmissions.map((submission: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span 
                            className="text-sm truncate md:whitespace-normal md:max-w-none cursor-pointer hover:text-primary" 
                            title={submission.report?.fileName || submission.title}
                            onClick={() => {
                              if (submission.report?.fileData) {
                                handleFileClick(submission.report.fileData, submission.report.fileName, submission.report.fileType, false);
                              }
                            }}
                          >
                            {submission.report?.fileName || submission.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {submission.submissionDate ? format(new Date(submission.submissionDate), 'PPP') : 'N/A'}
                          </span>
                          {submission.report?.fileData && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleFileClick(submission.report.fileData, submission.report.fileName, submission.report.fileType, true)}
                              title="Download file"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Submission Status */}
              {selectedActivity && (
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {(selectedActivity.status === 'completed' || selectedActivity.status === 'late')
                      ? selectedActivity.status === 'late' 
                        ? "This activity was submitted late."
                        : "You have already submitted this activity."
                      : selectedActivity.status === 'overdue'
                      ? "This activity is overdue. You can still submit but it will be marked as late."
                      : selectedActivity.status === 'in-progress'
                      ? "This activity is in progress. You can submit your report now."
                      : "This activity is pending. Click 'Start Activity' to begin working on it."
                    }
                  </p>
                </div>
              )}

              {/* File Upload Section */}
              {(selectedActivity?.status === 'in-progress' || selectedActivity?.status === 'overdue') && (
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
                    <div className="text-left p-3 bg-muted/30 rounded-lg">
                      <p className="text-sm font-medium mb-2">
                        {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected:
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="text-xs text-muted-foreground flex justify-between items-center">
                            <span className="truncate max-w-[150px] md:max-w-none" title={file.name}>{file.name.length > 15 ? file.name.substring(0, 15) + '...' : file.name}</span>
                            <div className="flex items-center gap-2">
                              <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                              <button
                                type="button"
                                onClick={() => setSelectedFiles(selectedFiles.filter((_, i) => i !== index))}
                                className="p-0.5 hover:bg-destructive hover:text-destructive-foreground rounded transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="flex flex-shrink-0 mt-4">
              {canDeleteActivities && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setActivityToDelete(selectedActivity);
                    setShowDeleteConfirm(true);
                  }}
                  disabled={deletingActivityId === selectedActivity?.id}
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {deletingActivityId === selectedActivity?.id ? 'Deleting Activity...' : 'Delete Activity'}
                </Button>
              )}

              <div className="ml-auto">
                {selectedActivity?.status === 'pending' && (
                  <Button 
                    onClick={() => {
                      setStartingActivityId(selectedActivity.id);
                      startActivity.mutate(selectedActivity.id, {
                        onSuccess: (updatedActivity) => {
                          setStartingActivityId(null);
                          if (updatedActivity) {
                            setSelectedActivity(updatedActivity);
                          }
                        },
                        onError: () => {
                          setStartingActivityId(null);
                        }
                      });
                    }}
                    disabled={startingActivityId !== null}
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    {startingActivityId !== null ? 'Starting...' : 'Start Activity'}
                  </Button>
                )}

                {(selectedActivity?.status === 'in-progress' || selectedActivity?.status === 'overdue') && (
                  <Button
                    className="gap-2"
                    onClick={handleSubmit}
                    disabled={selectedFiles.length === 0 || isSubmitting}
                  >
                    <Upload className="w-4 h-4" />
                    {isSubmitting ? 'Submitting...' : `Submit ${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''}`}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Time Slot Activities Modal - for showing all activities in a time slot */}
        <Dialog open={showTimeSlotActivitiesModal} onOpenChange={(open) => {
          setShowTimeSlotActivitiesModal(open);
          if (!open) {
            setTimeSlotActivitiesModalData(null);
            setTimeSlotActivitiesPage(1);
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-visible flex flex-col">
            <DialogHeader className="shrink-0 pb-2">
              <div className="flex items-center justify-between pr-8">
                <DialogTitle>
                  Activities at {timeSlotActivitiesModalData?.time}
                </DialogTitle>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={timeSlotActivitiesModalData ? (isDateWeekend(timeSlotActivitiesModalData.date) || (holidaysEnabledData && isDateHoliday(timeSlotActivitiesModalData.date))) : false}
                    onClick={() => {
                      if (timeSlotActivitiesModalData && !isDateHoliday(timeSlotActivitiesModalData.date)) {
                        setHolidayDate(timeSlotActivitiesModalData.date);
                        setHolidayName("");
                        setEditingHoliday(null);
                        setShowTimeSlotActivitiesModal(false);
                        setIsHolidayModalOpen(true);
                      }
                    }}
                  >
                    <CalendarDays className="w-4 h-4 mr-2" />
                    Make Holiday
                  </Button>
                  <Button
                    size="sm"
                    disabled={timeSlotActivitiesModalData ? (isDateWeekend(timeSlotActivitiesModalData.date) || (holidaysEnabledData && isDateHoliday(timeSlotActivitiesModalData.date))) : false}
                    onClick={() => {
                      if (timeSlotActivitiesModalData) {
                        setSelectedDate(timeSlotActivitiesModalData.date);
                        setActivityTime(timeSlotActivitiesModalData.time);
                        setNewActivityFromDayModal(true);
                        setShowTimeSlotActivitiesModal(false);
                        setIsNewActivityOpen(true);
                      }
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {timeSlotActivitiesModalData && (isDateWeekend(timeSlotActivitiesModalData.date) || (holidaysEnabledData && isDateHoliday(timeSlotActivitiesModalData.date)))
                      ? `${isDateHoliday(timeSlotActivitiesModalData.date) ? 'Holiday' : 'Weekend'}`
                      : 'Add Activity'
                    }
                  </Button>
                </div>
              </div>
              <DialogDescription>
                {timeSlotActivitiesModalData ? format(timeSlotActivitiesModalData.date, 'MMMM d, yyyy') : ''} - {timeSlotActivitiesModalData?.activities.length} {timeSlotActivitiesModalData?.activities.length === 1 ? 'activity' : 'activities'}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2 py-4 px-4">
                {timeSlotActivitiesModalData?.activities.length === 0 && timeSlotActivitiesModalData && !(isDateWeekend(timeSlotActivitiesModalData.date) || (holidaysEnabledData && isDateHoliday(timeSlotActivitiesModalData.date))) ? (
                  <p className="text-center text-muted-foreground py-8">No activities at this time</p>
                ) : timeSlotActivitiesModalData?.activities.length === 0 && timeSlotActivitiesModalData && (isDateWeekend(timeSlotActivitiesModalData.date) || (holidaysEnabledData && isDateHoliday(timeSlotActivitiesModalData.date))) ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="p-6 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md max-w-md mx-auto">
                        <p className="text-lg text-amber-800 dark:text-amber-200 font-medium mb-2">
                          🏖️ {isDateHoliday(timeSlotActivitiesModalData.date) ? `Holiday: ${holidays?.find(h => isSameDay(new Date(h.date), timeSlotActivitiesModalData.date))?.name}` : 'Weekend'}
                        </p>
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          Activities cannot be created on {isDateHoliday(timeSlotActivitiesModalData.date) ? 'holidays' : 'weekends'} and will be automatically moved to the next working day.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  (() => {
                    const totalPages = Math.ceil((timeSlotActivitiesModalData?.activities.length || 0) / timeSlotActivitiesPerPage);
                    const paginatedActivities = timeSlotActivitiesModalData?.activities.slice(
                      (timeSlotActivitiesPage - 1) * timeSlotActivitiesPerPage,
                      timeSlotActivitiesPage * timeSlotActivitiesPerPage
                    ) || [];
                    return (
                      <>
                        {paginatedActivities.map(activity => (
                          <div
                            key={activity.id}
                            className={cn(
                              "p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors",
                              getStatusBorderColor(activity.status)
                            )}
                            onClick={() => {
                              setShowTimeSlotActivitiesModal(false);
                              setSelectedActivity(activity);
                              setStartingActivityId(current => current === activity.id ? current : null);
                              setDeletingActivityId(current => current === activity.id ? current : null);
                              setActivityFromDayModal(true);
                              setIsActivityModalOpen(true);
                              // Clear previous submissions and show loading
                              setActivitySubmissions([]);
                              setIsLoadingSubmissions(true);
                              // Fetch submissions for this activity when modal opens
                              fetch(`/api/activities/${activity.id}/submissions`)
                                .then(res => res.json())
                                .then(data => {
                                  setActivitySubmissions(data);
                                  setIsLoadingSubmissions(false);
                                })
                                .catch(err => {
                                  console.error('Failed to fetch submissions:', err);
                                  setIsLoadingSubmissions(false);
                                });
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{activity.title}</span>
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-xs",
                                activity.status === 'completed' || activity.status === 'late' ? "bg-green-100 text-green-700" :
                                activity.status === 'overdue' ? "bg-red-100 text-red-700" :
                                activity.status === 'in-progress' ? "bg-blue-100 text-blue-700" :
                                "bg-orange-100 text-orange-700"
                              )}>
                                {activity.status}
                              </span>
                            </div>
                            {activity.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {activity.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </>
                    );
                  })()
                )}
              </div>
            </ScrollArea>
            {(timeSlotActivitiesModalData?.activities.length || 0) > timeSlotActivitiesPerPage && (() => {
              const totalPages = Math.ceil((timeSlotActivitiesModalData?.activities.length || 0) / timeSlotActivitiesPerPage);
              return (
                <div className="shrink-0 flex items-center justify-between p-4 border-t bg-muted/10">
                  <p className="text-sm text-muted-foreground">
                    Page {timeSlotActivitiesPage} of {totalPages}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTimeSlotActivitiesPage(p => Math.max(1, p - 1))}
                      disabled={timeSlotActivitiesPage === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTimeSlotActivitiesPage(p => Math.min(totalPages, p + 1))}
                      disabled={timeSlotActivitiesPage === totalPages}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })()}
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
                    setDeletingActivityId(activityToDelete.id);
                    deleteActivity.mutate(activityToDelete.id, {
                      onSuccess: () => {
                        if (selectedActivity?.id === activityToDelete.id) {
                          setIsActivityModalOpen(false);
                        }
                      },
                      onSettled: () => setDeletingActivityId(null)
                    });
                    setIsActivityModalOpen(false);
                  }
                  setShowDeleteConfirm(false);
                }}
                disabled={deletingActivityId === activityToDelete?.id}
              >
                {deletingActivityId === activityToDelete?.id ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete All Activities by Date Confirmation Modal */}
        <Dialog open={showDeleteAllConfirm} onOpenChange={setShowDeleteAllConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete All Activities</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete all {selectedDateActivities.length} activities for {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : ''}? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteAllConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAllByDate}
                disabled={isDeletingAll}
              >
                {isDeletingAll ? "Deleting..." : "Delete All"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reschedule Confirmation Modal */}
        <Dialog open={showRescheduleConfirm} onOpenChange={setShowRescheduleConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reschedule Activity</DialogTitle>
              <DialogDescription>
                Are you sure you want to move "{draggedActivity?.title}" to {rescheduleTargetDate ? format(rescheduleTargetDate, 'MMMM d, yyyy') : ''}{rescheduleTargetTime ? ` at ${rescheduleTargetTime}` : ''}?
                {draggedActivity?.status === 'pending' && rescheduleTargetDate && isTargetDateTimePast(rescheduleTargetDate, rescheduleTargetTime) && (
                  <span className="block mt-2 text-red-600 font-medium">
                    ⚠️ This will automatically change the status to Overdue because the target date/time has already passed.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowRescheduleConfirm(false);
                setDraggedActivity(null);
                setRescheduleTargetDate(null);
                setRescheduleTargetTime(null);
                setDropTargetDate(null);
                setDropTargetTime(null);
                stopAutoScroll();
              }}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirmReschedule}
                disabled={updateActivity.isPending}
              >
                {updateActivity.isPending ? "Moving..." : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Calendar Header */}
        <div className="flex flex-wrap items-center justify-between p-4 md:p-6 border-b border-gray-200 dark:border-gray-800 bg-muted/20 gap-3">
          <div className="flex items-center gap-2 md:gap-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleGoToToday}
              className="gap-1"
            >
              Today
            </Button>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" onClick={() => {
                if (view === 'day') {
                  setCurrentDate(addDays(currentDate, -1));
                } else if (view === 'week') {
                  setCurrentDate(addWeeks(currentDate, -1));
                } else {
                  setCurrentDate(addMonths(currentDate, -1));
                }
              }}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => {
                if (view === 'day') {
                  setCurrentDate(addDays(currentDate, 1));
                } else if (view === 'week') {
                  setCurrentDate(addWeeks(currentDate, 1));
                } else {
                  setCurrentDate(addMonths(currentDate, 1));
                }
              }}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <h2 className="text-lg md:text-xl font-bold font-display text-primary min-w-[160px]">
              {view === 'day' ? format(currentDate, 'MMMM d, yyyy') :
               view === 'week' ? format(currentDate, 'MMMM yyyy') :
               format(currentDate, 'MMMM yyyy')}
            </h2>
          </div>
          
          {/* View Toggle Buttons */}
          <div className="flex items-center gap-2">
            <div className="flex bg-muted rounded-lg p-1">
              <Button
                variant={view === 'day' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewChange('day')}
                className={cn("gap-1", view !== 'day' && "text-muted-foreground")}
              >
                <CalendarDays className="w-4 h-4" />
                <span className="hidden md:inline">Day</span>
              </Button>
              <Button
                variant={view === 'week' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewChange('week')}
                className={cn("gap-1", view !== 'week' && "text-muted-foreground")}
              >
                <LayoutList className="w-4 h-4" />
                <span className="hidden md:inline">Week</span>
              </Button>
              <Button
                variant={view === 'month' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewChange('month')}
                className={cn("gap-1", view !== 'month' && "text-muted-foreground")}
              >
                <Grid3X3 className="w-4 h-4" />
                <span className="hidden md:inline">Month</span>
              </Button>
            </div>
            
            {/* Activity Filter */}
            <Select value={activityFilter} onValueChange={setActivityFilter}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activities</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Activity counts */}
          <div className="text-sm text-muted-foreground md:w-auto md:flex-none">
            {filteredActivities.length} {activityFilter === 'all' ? 'Total' : activityFilter === 'in-progress' ? 'In Progress' : activityFilter.charAt(0).toUpperCase() + activityFilter.slice(1)} {filteredActivities.length === 1 ? 'Activity' : 'Activities'}
          </div>
        </div>

        {/* Calendar Grid - Month View */}
{view === 'month' && (
  <>
      {/* Header */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-800">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div
            key={day}
            className="py-3 text-center text-sm font-semibold text-muted-foreground border-r last:border-r-0 bg-muted/5 dark:bg-muted/20"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div
        className="grid grid-cols-7 min-h-[600px] auto-rows-fr"
        onClick={() => setSelectedDate(null)}
        key={holidaysKey}
      >
        {/* Padding */}
        {paddingDays.map((_, i) => (
          <div
            key={`padding-${i}`}
            className="bg-muted/5 dark:bg-muted/10 border-b border-r last:border-r-0 border-gray-200 dark:border-gray-800"
          />
        ))}

        {/* Days */}
        {daysInMonth.map((date) => {
          const dayActivities = filteredActivities.filter(a =>
            isSameDay(getEffectiveActivityDate(a), date)
          );

          const indicators = getDateIndicators(date);

          const multiBorder =
            dayActivities.length > 0
              ? getMultiStatusBorderColor(dayActivities)
              : { borderClass: '', style: undefined };

          const isLastDayOfMonth = isSameDay(date, endOfMonth(date));

          return (
            <div
              key={date.toISOString()}
             className={cn(
                 "p-2 border-b border-r min-h-[100px] transition-colors cursor-pointer hover:bg-primary/10 border-gray-200 dark:border-gray-800 relative",
                 !isLastDayOfMonth && "last:border-r-0",
                 selectedDate &&
                   isSameDay(date, selectedDate) &&
                   "ring-2 ring-primary ring-inset bg-primary/5",
                 dropTargetDate &&
                   isSameDay(date, dropTargetDate) &&
                   "bg-primary/20 ring-2 ring-primary",
                 dayActivities.length > 0 && multiBorder.borderClass,
                 indicators.isHoliday && "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
               )}
               style={multiBorder.style}
               onClick={(e) => {
                 e.stopPropagation();
                 handleDateClick(date);
               }}
               onDragOver={(e) => handleDateDragOver(e, date)}
               onDragLeave={() => {
                 setDropTargetDate(null);
                 stopAutoScroll();
               }}
               onDrop={(e) => handleDateDrop(e, date)}
             >
              {/* Date */}
              <div
                className={cn(
                  "w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-2",
                  isToday(date)
                    ? "bg-primary text-white shadow-sm"
                    : indicators.isHoliday
                    ? "bg-red-500 text-white shadow-sm"
                    : "text-muted-foreground"
                )}
              >
                {format(date, 'd')}
              </div>

              {/* Dots */}
              {indicators.hasActivities && (
                <div className="flex gap-1 mb-1 flex-wrap">
                  {dayActivities.slice(0, 3).map((activity) => (
                    <span
                      key={activity.id}
                      className={cn(
                        "w-2 h-2 rounded-full",
                        activity.status === 'completed' ||
                        activity.status === 'late'
                          ? "bg-green-500"
                          : activity.status === 'overdue'
                          ? "bg-red-500"
                          : activity.status === 'in-progress'
                          ? "bg-blue-500"
                          : "bg-orange-500"
                      )}
                    />
                  ))}
                  {indicators.activityCount > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{indicators.activityCount - 3}
                    </span>
                  )}
                </div>
              )}

              {/* Activities */}
              <div className="space-y-1">
                {dayActivities.slice(0, 3).map((activity) => (
                  <div
                    key={activity.id}
                    draggable
                    onDragStart={(e) =>
                      handleActivityDragStart(e, activity)
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedActivity(activity);
                      setStartingActivityId(current => current === activity.id ? current : null);
                      setDeletingActivityId(current => current === activity.id ? current : null);
                      setIsActivityModalOpen(true);
                      // Clear previous submissions and show loading
                      setActivitySubmissions([]);
                      setIsLoadingSubmissions(true);
                      // Fetch submissions for this activity when modal opens
                      fetch(`/api/activities/${activity.id}/submissions`)
                        .then(res => res.json())
                        .then(data => {
                          setActivitySubmissions(data);
                          setIsLoadingSubmissions(false);
                        })
                        .catch(err => {
                          console.error('Failed to fetch submissions:', err);
                          setIsLoadingSubmissions(false);
                        });
                    }}
                    className={cn(
                      "text-xs p-1.5 rounded-md border truncate font-medium text-left cursor-move hover:opacity-80 transition-opacity",
                      getStatusColor(activity.status),
                      getStatusBorderColor?.(activity.status),
                      selectedActivity?.id === activity.id &&
                        "ring-2 ring-primary ring-offset-1",
                      draggedActivity?.id === activity.id &&
                        "opacity-50"
                    )}
                  >
                    {activity.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
  </>
)}

        {/* Calendar Grid - Week View */}
        {view === 'week' && (
          <WeekView 
            key={holidaysKey}
            currentDate={currentDate} 
            activities={filteredActivities}
            onDateSelect={(date) => {
              setSelectedDate(date);
              setCurrentDate(date);
            }}
            selectedDate={selectedDate}
            onActivityClick={(activity) => {
              setStartingActivityId(current => current === activity.id ? current : null);
              setDeletingActivityId(current => current === activity.id ? current : null);
              setSelectedActivity(activity);
              setIsActivityModalOpen(true);
              // Clear previous submissions and show loading
              setActivitySubmissions([]);
              setIsLoadingSubmissions(true);
              // Fetch submissions for this activity when modal opens
              fetch(`/api/activities/${activity.id}/submissions`)
                .then(res => res.json())
                .then(data => {
                  setActivitySubmissions(data);
                  setIsLoadingSubmissions(false);
                })
                .catch(err => {
                  console.error('Failed to fetch submissions:', err);
                  setIsLoadingSubmissions(false);
                });
            }}
            onSelectTimeSlot={handleTimeSlotClick}
            selectedTimeSlot={selectedTimeSlot}
            onClearSelection={handleClearSelection}
            isToday={isToday}
            isSameDay={isSameDay}
            format={format}
            getStatusColor={getStatusColor}
            getStatusBorderColor={getStatusBorderColor}
            getMultiStatusBorderColor={getMultiStatusBorderColor}
            // Drag and drop props
            draggedActivity={draggedActivity}
            dropTargetDate={dropTargetDate}
            dropTargetTime={dropTargetTime}
            onActivityDragStart={handleActivityDragStart}
            onTimeSlotDragOver={handleTimeSlotDragOver}
            onTimeSlotDragLeave={handleTimeSlotDragLeave}
            onTimeSlotDrop={handleTimeSlotDrop}
            onDayClick={handleDayClickInWeekView}
            holidays={holidays}
            holidaysEnabled={holidaysEnabledData}
            // New activity modal handlers
            setIsNewActivityOpen={setIsNewActivityOpen}
            setShowTimeSlotActivitiesModal={setShowTimeSlotActivitiesModal}
            setTimeSlotActivitiesModalData={setTimeSlotActivitiesModalData}
            setSelectedDate={setSelectedDate}
            setActivityTime={setActivityTime}
          />
        )}

        {/* Calendar Grid - Day View */}
        {view === 'day' && (
          <DayView 
            key={holidaysKey}
            currentDate={currentDate} 
            activities={filteredActivities}
            onActivityClick={(activity) => {
              setStartingActivityId(current => current === activity.id ? current : null);
              setDeletingActivityId(current => current === activity.id ? current : null);
              setSelectedActivity(activity);
              setIsActivityModalOpen(true);
              // Clear previous submissions and show loading
              setActivitySubmissions([]);
              setIsLoadingSubmissions(true);
              // Fetch submissions for this activity when modal opens
              fetch(`/api/activities/${activity.id}/submissions`)
                .then(res => res.json())
                .then(data => {
                  setActivitySubmissions(data);
                  setIsLoadingSubmissions(false);
                })
                .catch(err => {
                  console.error('Failed to fetch submissions:', err);
                  setIsLoadingSubmissions(false);
                });
            }}
            onSelectTimeSlot={handleTimeSlotClick}
            selectedTimeSlot={selectedTimeSlot}
            onClearSelection={handleClearSelection}
            isToday={isToday}
            isSameDay={isSameDay}
            format={format}
            getStatusColor={getStatusColor}
            getStatusBorderColor={getStatusBorderColor}
            getMultiStatusBorderColor={getMultiStatusBorderColor}
            // Drag and drop props
            draggedActivity={draggedActivity}
            dropTargetDate={dropTargetDate}
            dropTargetTime={dropTargetTime}
            onActivityDragStart={handleActivityDragStart}
            onTimeSlotDragOver={handleTimeSlotDragOver}
            onTimeSlotDragLeave={handleTimeSlotDragLeave}
            onTimeSlotDrop={handleTimeSlotDrop}
            onDragEnd={() => {
              stopAutoScroll();
              // Only clear if not showing reschedule confirmation
              if (!showRescheduleConfirm) {
                setDraggedActivity(null);
                setDropTargetDate(null);
                setDropTargetTime(null);
                setIsDraggingOverTimeSlot(false);
              }
            }}
            // Touch handlers
            onTouchDragStart={handleTouchDragStart}
            onTouchDragMove={handleTouchDragMove}
            onTouchDragEnd={handleTouchDragEnd}
            // New activity modal handlers
            setIsNewActivityOpen={setIsNewActivityOpen}
            setShowTimeSlotActivitiesModal={setShowTimeSlotActivitiesModal}
            setTimeSlotActivitiesModalData={setTimeSlotActivitiesModalData}
            setSelectedDate={setSelectedDate}
            setActivityTime={setActivityTime}
            holidays={holidays}
            holidaysEnabled={holidaysEnabledData}
          />
        )}
      </div>

       {/* Two-Column Grid for Panels on Desktop */}
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          {/* Upcoming Activities Sidebar */}
      <div className="bg-card rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-visible flex flex-col h-[600px]">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-muted/20">
              <h3 className="font-semibold text-lg">Upcoming Activities</h3>
              <p className="text-sm text-muted-foreground">Next activities and overdue items</p>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 pr-4">
                {/* Overdue Section */}
                {activities && activities.filter(a => a.status === 'overdue').length > 0 && (
                  <div className="mt-0">
                    <h4 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Overdue ({activities.filter(a => a.status === 'overdue').length})
                    </h4>
                    <div className="space-y-2">
                      {activities
                    .filter(a => a.status === 'overdue')
                    .slice(0, 3)
                    .map(activity => (
                      <button
                        key={activity.id}
                        onClick={() => {
                          const activityDate = new Date(activity.deadlineDate);
                          setCurrentDate(activityDate);
                          setSelectedActivity(activity);
                          setStartingActivityId(current => current === activity.id ? current : null);
                          setIsActivityModalOpen(true);
                          // Clear previous submissions and show loading
                          setActivitySubmissions([]);
                          setIsLoadingSubmissions(true);
                          // Fetch submissions for this activity when modal opens
                          fetch(`/api/activities/${activity.id}/submissions`)
                            .then(res => res.json())
                            .then(data => {
                              setActivitySubmissions(data);
                              setIsLoadingSubmissions(false);
                            })
                            .catch(err => {
                              console.error('Failed to fetch submissions:', err);
                              setIsLoadingSubmissions(false);
                            });
                        }}
                        className="w-full text-left p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                      >
                        <div className="font-medium text-sm">{activity.title}</div>
                        <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                          Due: {format(new Date(activity.deadlineDate), 'MMM d, yyyy')}
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Upcoming Section */}
            <div className="mt-0">
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                Coming Up
              </h4>
              {activities && activities.filter(a => a.status !== 'overdue' && a.status !== 'completed' && a.status !== 'late' && new Date(a.deadlineDate) >= new Date()).length > 0 ? (
                <div className="space-y-2">
                  {activities
                    .filter(a => a.status !== 'overdue' && a.status !== 'completed' && a.status !== 'late' && new Date(a.deadlineDate) >= new Date())
                    .sort((a, b) => new Date(a.deadlineDate).getTime() - new Date(b.deadlineDate).getTime())
                    .slice(0, 5)
                    .map(activity => (
                      <button
                        key={activity.id}
                        onClick={() => {
                          const activityDate = new Date(activity.deadlineDate);
                          setCurrentDate(activityDate);
                          setSelectedActivity(activity);
                          setStartingActivityId(current => current === activity.id ? current : null);
                          setIsActivityModalOpen(true);
                          // Clear previous submissions and show loading
                          setActivitySubmissions([]);
                          setIsLoadingSubmissions(true);
                          // Fetch submissions for this activity when modal opens
                          fetch(`/api/activities/${activity.id}/submissions`)
                            .then(res => res.json())
                            .then(data => {
                              setActivitySubmissions(data);
                              setIsLoadingSubmissions(false);
                            })
                            .catch(err => {
                              console.error('Failed to fetch submissions:', err);
                              setIsLoadingSubmissions(false);
                            });
                        }}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors",
                          getStatusColor(activity.status),
                          getStatusBorderColor(activity.status)
                        )}
                      >
                        <div className="font-medium text-sm">{activity.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(new Date(activity.deadlineDate), 'EEE, MMM d')}
                        </div>
                      </button>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming activities</p>
              )}
              </div>
            </div>
          </ScrollArea>
        </div>

      {/* Agency & Department Filter Panel */}
      <div className="bg-card rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-visible flex flex-col h-[600px]">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-muted/20">
          <h3 className="font-semibold text-lg">Activities by Agency & Department</h3>
          <p className="text-sm text-muted-foreground">Filter activities by regulatory agency and concern department</p>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filter Dropdowns */}
          <div className="flex gap-3 mb-4 flex-shrink-0 px-4 pt-4">
            <div className="flex-1">
              <label htmlFor="filterAgency" className="text-sm font-medium mb-1 block">Regulatory Agency</label>
              <Select value={filterAgency || 'all'} onValueChange={(value) => { setFilterAgency(value === 'all' ? '' : value); setFilterDepartment(''); }}>
                <SelectTrigger id="filterAgency" className="w-full">
                  <SelectValue placeholder="All Agencies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agencies</SelectItem>
                  <SelectItem value="DOE">DOE</SelectItem>
                  <SelectItem value="ERC">ERC</SelectItem>
                  <SelectItem value="NEA">NEA</SelectItem>
                  <SelectItem value="NEA-WEB PORTAL">NEA-WEB PORTAL</SelectItem>
                  <SelectItem value="IEMOP">IEMOP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {enableRoleFiltering && user?.role !== 'admin' ? (
              // When role-based filtering is enabled and user is not admin, show auto-filtered department
              <div className="flex-1">
                <label htmlFor="filterDepartmentDisabled" className="text-sm font-medium mb-1 block">Concern Department</label>
                <Select value={filterDepartment || 'all'} onValueChange={(value) => setFilterDepartment(value === 'all' ? '' : value)} disabled={true}>
                  <SelectTrigger id="filterDepartmentDisabled" className="w-full">
                    <SelectValue placeholder="Auto-filtered" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {user?.role === 'cps' && (
                      <>
                        <SelectItem value="CITET-CPS">CITET-CPS</SelectItem>
                        <SelectItem value="FSD-CACD">FSD-CACD</SelectItem>
                        <SelectItem value="ISD-MSD">ISD-MSD</SelectItem>
                        <SelectItem value="ISD-CWDC">ISD-CWDC</SelectItem>
                        <SelectItem value="TSD-DAMD">TSD-DAMD</SelectItem>
                        <SelectItem value="TSD-DNOD">TSD-DNOD</SelectItem>
                        <SelectItem value="ZONE-ZOS">ZONE-ZOS</SelectItem>
                        <SelectItem value="OGM">OGM</SelectItem>
                        <SelectItem value="FSD-CASHIER">FSD-CASHIER</SelectItem>
                        <SelectItem value="FSD-ACCOUNTING CLERK">FSD-ACCOUNTING CLERK</SelectItem>
                      </>
                    )}
                    {user?.role === 'ets' && (
                      <>
                        <SelectItem value="CITET-ETS">CITET-ETS</SelectItem>
                        <SelectItem value="CITET-CPS">CITET-CPS</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex-1">
                <label htmlFor="filterDepartmentEnabled" className="text-sm font-medium mb-1 block">Concern Department</label>
                <Select value={filterDepartment || 'all'} onValueChange={(value) => setFilterDepartment(value === 'all' ? '' : value)} disabled={!filterAgency}>
                  <SelectTrigger id="filterDepartmentEnabled" className="w-full">
                    <SelectValue placeholder={filterAgency ? "All Departments" : "Select Agency First"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {filterAgency === 'DOE' && (
                      <>
                        <SelectItem value="CITET-ETS">CITET-ETS</SelectItem>
                        <SelectItem value="CITET-CPS">CITET-CPS</SelectItem>
                      </>
                    )}
                    {filterAgency === 'ERC' && (
                      <>
                        <SelectItem value="FSD-CACD">FSD-CACD</SelectItem>
                        <SelectItem value="ISD-MSD">ISD-MSD</SelectItem>
                        <SelectItem value="CITET-ETS">CITET-ETS</SelectItem>
                        <SelectItem value="ISD-CWDC">ISD-CWDC</SelectItem>
                        <SelectItem value="TSD-DNOD">TSD-DNOD</SelectItem>
                        <SelectItem value="TSD-DAMD">TSD-DAMD</SelectItem>
                      </>
                    )}
                    {filterAgency === 'NEA' && (
                      <>
                        <SelectItem value="CITET-ETS">CITET-ETS</SelectItem>
                        <SelectItem value="TSD-DAMD">TSD-DAMD</SelectItem>
                      </>
                    )}
                    {filterAgency === 'NEA-WEB PORTAL' && (
                      <>
                        <SelectItem value="TSD-DAMD">TSD-DAMD</SelectItem>
                        <SelectItem value="ISD-MSD">ISD-MSD</SelectItem>
                        <SelectItem value="FSD-GAD">FSD-GAD</SelectItem>
                        <SelectItem value="ZONE-ZOS">ZONE-ZOS</SelectItem>
                        <SelectItem value="OGM">OGM</SelectItem>
                        <SelectItem value="TSD-DNOD">TSD-DNOD</SelectItem>
                        <SelectItem value="CITET-ETS">CITET-ETS</SelectItem>
                      </>
                    )}
                    {filterAgency === 'IEMOP' && (
                      <>
                        <SelectItem value="FSD-CASHIER">FSD-CASHIER</SelectItem>
                        <SelectItem value="FSD-ACCOUNTING CLERK">FSD-ACCOUNTING CLERK</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          {/* Filtered Activities List */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activities && (() => {
              const filtered = activities.filter(a => {
                const matchesAgency = !filterAgency || a.regulatoryAgency === filterAgency;
                
                // Apply role-based department filtering
                let matchesDept = true;
                if (filterDepartment) {
                  // Check if the stored department string contains the filter department
                  matchesDept = a.concernDepartment?.includes(filterDepartment) ?? false;
                } else if (enableRoleFiltering && user?.role && user.role !== 'admin') {
                  // Auto-filter based on user role when role-based filtering is enabled
                  // Now departments are stored as comma-separated values
                  if (user.role === 'cps') {
                    matchesDept = a.concernDepartment?.includes('CITET-CPS') ?? false;
                  } else if (user.role === 'ets') {
                    matchesDept = a.concernDepartment?.includes('CITET-ETS') ?? false;
                  }
                }
                
                return matchesAgency && matchesDept;
              });
              
              const itemsPerPage = 10;
              const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
              const validPage = Math.min(agencyFilterPage, totalPages);
              const paginatedActivities = filtered.slice(
                (validPage - 1) * itemsPerPage,
                validPage * itemsPerPage
              );
              
              if (filtered.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {filterAgency ? "No activities found" : "Select an agency to filter activities"}
                  </p>
                );
              }
              
              return (
                <>
                <ScrollArea className="flex-1 px-4 pb-2">
                  <div className="space-y-2 pb-2">
                    {paginatedActivities.map(activity => (
                      <button
                        key={activity.id}
                        onClick={() => {
                          const activityDate = new Date(activity.deadlineDate);
                          setCurrentDate(activityDate);
                          setSelectedActivity(activity);
                          setStartingActivityId(current => current === activity.id ? current : null);
                          setIsActivityModalOpen(true);
                          // Clear previous submissions and show loading
                          setActivitySubmissions([]);
                          setIsLoadingSubmissions(true);
                          // Fetch submissions for this activity when modal opens
                          fetch(`/api/activities/${activity.id}/submissions`)
                            .then(res => res.json())
                            .then(data => {
                              setActivitySubmissions(data);
                              setIsLoadingSubmissions(false);
                            })
                            .catch(err => {
                              console.error('Failed to fetch submissions:', err);
                              setIsLoadingSubmissions(false);
                            });
                        }}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors",
                          getStatusColor(activity.status),
                          getStatusBorderColor(activity.status)
                        )}
                      >
                        <div className="font-medium text-sm">{activity.title}</div>
                        <div className="flex gap-2 mt-1">
                          {activity.regulatoryAgency && (
                            <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">
                              {activity.regulatoryAgency}
                            </span>
                          )}
                          {activity.concernDepartment && (
                            <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">
                              {activity.concernDepartment}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Due: {format(new Date(activity.deadlineDate), 'MMM d, yyyy')}
                        </div>
                      </button>
                    ))}
                  </div>
                   </ScrollArea>
                   
                    {/* Pagination - only show if more than 10 activities */}
                    {filtered.length > itemsPerPage && (
                      <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-800 bg-muted/10">
                       <p className="text-sm text-muted-foreground">
                         Page {validPage} of {totalPages}
                       </p>
                       <div className="flex gap-1">
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={() => setAgencyFilterPage(p => Math.max(1, p - 1))}
                           disabled={agencyFilterPage === 1}
                         >
                           <ChevronLeft className="w-4 h-4" />
                         </Button>
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={() => setAgencyFilterPage(p => Math.min(totalPages, p + 1))}
                           disabled={agencyFilterPage === totalPages}
                         >
                           <ChevronRight className="w-4 h-4" />
                         </Button>
                       </div>
                     </div>
                   )}
                 </>
               );
             })()}
           </div>
         </div>
       </div>
        </div>

        {/* Holiday Management & Recurring Activity Deletion Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          {/* Holiday Management Panel - Left Column */}
          {canManageHolidays && (
          <div className="bg-card rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-visible lg:col-span-2">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    Holiday Management
                  </h3>
                  <p className="text-sm text-muted-foreground">Add or edit holidays. Activities will be automatically moved to the previous working day if they fall on holidays.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="holidays-enabled-panel"
                    checked={holidaysEnabledData}
                    onCheckedChange={(checked) => updateHolidaysEnabled.mutate(checked)}
                  />
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Add New Holiday Form - Top */}
              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
                  <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                  {editingHoliday ? 'Edit Holiday' : 'Add New Holiday'}
                </h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="holidayNamePanel" className="text-sm font-medium">Holiday Name</Label>
                    <Input
                      id="holidayNamePanel"
                      value={holidayName}
                      onChange={(e) => setHolidayName(e.target.value)}
                      placeholder="New Year's Day"
                      className="h-10 border border-gray-300 dark:border-gray-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="holidayDatePanel" className="text-sm font-medium">Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                         <Button id="holidayDatePanel" variant="outline" className="h-10 w-full justify-start text-left font-normal !border-gray-300">
                          {holidayDate ? format(holidayDate, 'PPP') : <span className="text-muted-foreground">Pick a date</span>}
                         </Button>
                      </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={holidayDate}
                            onSelect={setHolidayDate}
                            initialFocus
                            holidays={holidays}
                            holidaysEnabled={holidaysEnabledData}
                          />
                        </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={async () => {
                        if (!holidayName || !holidayDate) return;

                        // Check if holiday date already exists (only when adding, not when editing)
                        if (!editingHoliday) {
                          const holidayExists = holidays?.some(h => isSameDay(new Date(h.date), holidayDate));
                          if (holidayExists) {
                            toast({
                              title: "Holiday already exists",
                              description: "A holiday is already configured for this date.",
                              variant: "destructive"
                            });
                            return;
                          }
                        } else {
                          // When editing, check if another holiday has this date
                          const holidayExists = holidays?.some(h => h.id !== editingHoliday.id && isSameDay(new Date(h.date), holidayDate));
                          if (holidayExists) {
                            toast({
                              title: "Holiday already exists",
                              description: "Another holiday is already configured for this date.",
                              variant: "destructive"
                            });
                            return;
                          }
                        }

                        setIsAddingHoliday(true);
                        try {
                          if (editingHoliday) {
                            await updateHoliday.mutateAsync({
                              id: editingHoliday.id,
                              data: {
                                name: holidayName,
                                date: holidayDate
                              }
                            });
                          } else {
                            await createHoliday.mutateAsync({
                              name: holidayName,
                              date: holidayDate
                            });
                          }
                          setHolidayName("");
                          setHolidayDate(undefined);
                          setEditingHoliday(null);
                        } catch (error) {
                          // Error handled by mutation
                        } finally {
                          setIsAddingHoliday(false);
                        }
                      }}
                      disabled={!holidayName || !holidayDate || isAddingHoliday || (editingHoliday && !hasHolidayChanges)}
                      className="gap-2"
                    >
                      {isAddingHoliday ? (
                        <>
                          {editingHoliday ? 'Updating...' : 'Adding...'}
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          {editingHoliday ? 'Update Holiday' : 'Add Holiday'}
                        </>
                      )}
                    </Button>
                    {editingHoliday && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setHolidayName("");
                          setHolidayDate(undefined);
                          setEditingHoliday(null);
                        }}
                        disabled={isAddingHoliday}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Existing Holidays List - Below Add Form */}
              {holidays && holidays.length > 0 && (
                <div className="border rounded-lg p-4">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
                    <span className="w-1 h-4 bg-green-500 rounded-full"></span>
                    Existing Holidays
                  </h4>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2 pr-4">
                      {(() => {
                        const totalPages = Math.ceil((holidays?.length || 0) / holidaysPerPage);
                        const paginatedHolidays = holidays?.slice(
                          (holidayPage - 1) * holidaysPerPage,
                          holidayPage * holidaysPerPage
                        ) || [];

                        return (
                          <>
                            {paginatedHolidays.map((holiday: any) => (
                              <div key={holiday.id} className="flex items-center justify-between p-3 border rounded-md">
                                <div>
                                  <p className="font-medium">{holiday.name}</p>
                                  <p className="text-sm text-muted-foreground">{format(new Date(holiday.date), 'PPP')}</p>
                                </div>
                                <div className="flex gap-2">
                                   <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setEditingHoliday(holiday);
                                        setHolidayName(holiday.name);
                                        setHolidayDate(new Date(holiday.date));
                                      }}
                                    >
                                      Edit
                                   </Button>
                                   <Button
                                     variant="destructive"
                                     size="sm"
                                     onClick={() => {
                                       setHolidayToDelete(holiday);
                                       setShowDeleteHolidayConfirm(true);
                                     }}
                                   >
                                     <Trash2 className="w-4 h-4" />
                                   </Button>
                                </div>
                              </div>
                            ))}
                            {/* Pagination - only show if more than 5 holidays */}
                            {(holidays?.length || 0) > holidaysPerPage && (
                              <div className="flex items-center justify-between pt-4 border-t mt-4">
                                <p className="text-sm text-muted-foreground">
                                  Page {holidayPage} of {totalPages}
                                </p>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setHolidayPage(p => Math.max(1, p - 1))}
                                    disabled={holidayPage === 1}
                                  >
                                    <ChevronLeft className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setHolidayPage(p => Math.min(totalPages, p + 1))}
                                    disabled={holidayPage === totalPages}
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Delete Recurring Activities Panel - Right Column */}
          <div className="bg-card rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-visible lg:col-span-1 lg:self-start">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-muted/20">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                Delete Recurring Activities
              </h3>
              <p className="text-sm text-muted-foreground">Delete all occurrences of a recurring activity type for a specific year.</p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Recurrence Type Selector */}
              <div className="space-y-2">
                <Label htmlFor="deleteRecurType" className="text-sm font-medium">Recurrence Type</Label>
                <Select value={deleteRecurType} onValueChange={(value) => { setDeleteRecurType(value); setDeleteRecurYear(""); setDeleteRecurPreview([]); }}>
                  <SelectTrigger id="deleteRecurType" className="h-10 border border-gray-300 dark:border-gray-600">
                    <SelectValue placeholder="Select recurrence type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="semi-annual">Semi-Annual</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Year Selector */}
              <div className="space-y-2">
                <Label htmlFor="deleteRecurYear" className="text-sm font-medium">Year</Label>
                <Select value={deleteRecurYear} onValueChange={(value) => { setDeleteRecurYear(value); setDeleteRecurPreview([]); }} disabled={!deleteRecurType}>
                  <SelectTrigger id="deleteRecurYear" className="h-10 border border-gray-300 dark:border-gray-600">
                    <SelectValue placeholder={deleteRecurType ? "Select year" : "Select recurrence type first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      if (!deleteRecurType || !activities) return [];
                      // Filter activities by recurrence type and extract unique years
                      const yearsWithActivities = activities
                        .filter(a => a.recurrence === deleteRecurType)
                        .map(a => new Date(a.deadlineDate).getFullYear())
                        .filter((year, index, arr) => arr.indexOf(year) === index) // Remove duplicates
                        .sort((a, b) => b - a); // Sort in descending order (most recent first)
                      return yearsWithActivities.map(year => (
                        <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>

              {/* Preview Button */}
              <Button
                variant="outline"
                className="w-full gap-2"
                style={{ borderColor: '#94a3b8' }}
                disabled={!deleteRecurType || !deleteRecurYear}
                 onClick={() => {
                   if (!deleteRecurType || !deleteRecurYear) return;
                   const year = parseInt(deleteRecurYear);
                   const matched = (activities || []).filter(a => {
                     if (a.recurrence !== deleteRecurType) return false;
                     const actDate = new Date(a.deadlineDate);
                     return actDate.getFullYear() === year;
                   });
                   setDeleteRecurPreview(matched);
                 }}
              >
                Preview Activities ({deleteRecurPreview.length > 0 || (deleteRecurType && deleteRecurYear) ? (() => {
                  const year = parseInt(deleteRecurYear || "0");
                  return (activities || []).filter(a => a.recurrence === deleteRecurType && new Date(a.deadlineDate).getFullYear() === year).length;
                })() : 0})
              </Button>

              {/* Preview List */}
              {deleteRecurPreview.length > 0 && (
                <div className="border rounded-lg p-3 space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {deleteRecurPreview.length} {deleteRecurPreview.length === 1 ? 'activity' : 'activities'} found
                  </h4>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-1 pr-4">
                      {deleteRecurPreview.map((activity: any) => (
                        <div key={activity.id} className="flex items-center justify-between p-2 border rounded-md text-sm">
                          <div>
                            <p className="font-medium truncate max-w-[200px]">{activity.title}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(activity.deadlineDate), 'MMM d, yyyy')}</p>
                          </div>
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-xs",
                            activity.status === 'completed' || activity.status === 'late' ? "bg-green-100 text-green-700" :
                            activity.status === 'overdue' ? "bg-red-100 text-red-700" :
                            activity.status === 'in-progress' ? "bg-blue-100 text-blue-700" :
                            "bg-orange-100 text-orange-700"
                          )}>
                            {activity.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {deleteRecurType && deleteRecurYear && deleteRecurPreview.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg">
                  No {deleteRecurType} activities found for {deleteRecurYear}
                </p>
              )}

              {/* Delete Button */}
              <Button
                variant="destructive"
                className="w-full gap-2"
                disabled={deleteRecurPreview.length === 0 || isDeletingRecurring}
                onClick={() => setShowDeleteRecurConfirm(true)}
              >
                <Trash2 className="w-4 h-4" />
                {isDeletingRecurring ? "Deleting..." : `Delete All ${deleteRecurType ? deleteRecurType.charAt(0).toUpperCase() + deleteRecurType.slice(1) : ''} Activities for ${deleteRecurYear || '...'}`}
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

// Week View Component
function WeekView({
  currentDate,
  activities,
  onDateSelect,
  selectedDate,
  onActivityClick,
  onSelectTimeSlot,
  selectedTimeSlot,
  isToday,
  isSameDay,
  format,
  getStatusColor,
  onClearSelection,
  // Drag and drop props
  draggedActivity,
  dropTargetDate,
  dropTargetTime,
  onActivityDragStart,
  onTimeSlotDragOver,
  onTimeSlotDragLeave,
  onTimeSlotDrop,
  onDragEnd,
  // Touch handlers
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  onDayClick,
  getStatusBorderColor,
  getMultiStatusBorderColor,
  holidays,
  holidaysEnabled,
  // New activity modal handlers
  setIsNewActivityOpen,
  setShowTimeSlotActivitiesModal,
  setTimeSlotActivitiesModalData,
  setSelectedDate,
  setActivityTime
}: {
  currentDate: Date;
  activities: any[];
  onDateSelect: (date: Date) => void;
  selectedDate: Date | null;
  onActivityClick: (activity: any) => void;
  onSelectTimeSlot: (date: Date, time: string) => void;
  selectedTimeSlot: string | null;
  isToday: (date: Date) => boolean;
  isSameDay: (date1: Date, date2: Date) => boolean;
  format: (date: Date, formatStr: string) => string;
  getStatusColor: (status: string | null) => string;
  getStatusBorderColor?: (status: string | null) => string;
  getMultiStatusBorderColor?: (activities: any[]) => { borderClass: string; style?: React.CSSProperties };
  onClearSelection?: () => void;
  // Drag and drop props
  draggedActivity?: any;
  dropTargetDate?: Date | null;
  dropTargetTime?: string | null;
  onActivityDragStart?: (e: React.DragEvent, activity: any) => void;
  onTimeSlotDragOver?: (e: React.DragEvent, date: Date, time: string) => void;
  onTimeSlotDragLeave?: (e: React.DragEvent) => void;
  onTimeSlotDrop?: (e: React.DragEvent, date: Date, time: string) => void;
  onDragEnd?: () => void;
  // Touch handlers
  onTouchDragStart?: (activity: any, e: React.TouchEvent) => void;
  onTouchDragMove?: (e: React.TouchEvent) => void;
  onTouchDragEnd?: (e: React.TouchEvent) => void;
  onDayClick?: (date: Date) => void;
  holidays?: any[];
  holidaysEnabled?: boolean;
  // New activity modal handlers
  setIsNewActivityOpen?: (open: boolean) => void;
  setShowTimeSlotActivitiesModal?: (open: boolean) => void;
  setTimeSlotActivitiesModalData?: (data: { date: Date; time: string; activities: any[] } | null) => void;
  setSelectedDate?: (date: Date | null) => void;
  setActivityTime?: (time: string) => void;
}) {
  const weekStart = startOfWeek(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Helper to get activity's scheduled hour (default to 23 if no specific time)
  const getActivityHour = (activity: any): number => {
    const deadlineDate = new Date(activity.deadlineDate);
    return deadlineDate.getHours();
  };

  return (
    <ScrollArea className="h-[700px] pr-4">
      <div className="h-full">
        {/* Week header */}
        <div className="grid grid-cols-8 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-background z-10">
          <div className="p-2 text-center text-sm font-semibold text-muted-foreground border-r" />
          {weekDays.map((day) => {
            const isHoliday = holidaysEnabled && holidays?.some(holiday => isSameDay(new Date(holiday.date), day));
            const isWeekend = day.getDay() === 0 || day.getDay() === 6; // Sunday = 0, Saturday = 6

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "p-2 text-center border-r last:border-r-0 cursor-pointer hover:bg-muted/50 transition-colors",
                  isToday(day) && "bg-primary/10",
                  isHoliday && "bg-red-50 dark:bg-red-950/20"
                )}
                onClick={() => onDayClick?.(day)}
              >
                <div className={cn(
                  "text-xs font-semibold",
                  isToday(day) ? "text-primary" : isHoliday ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                )}>{format(day, 'EEE')}</div>
                <div className={cn(
                  "text-lg font-semibold",
                  isToday(day) && "bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center mx-auto",
                  !isToday(day) && isHoliday && "text-red-600 dark:text-red-400"
                )}>
                  {format(day, 'd')}
                </div>
              </div>
            );
          })}
      </div>
      
      {/* Time slots */}
      <div 
        className="relative cursor-default"
        onClick={(e) => {
          // Check if clicking directly on the container (not on a child element)
          if (e.target === e.currentTarget) {
            onClearSelection?.();
          }
        }}
      >
        {hours.map((hour) => {
          const timeString = `${hour.toString().padStart(2, '0')}:00`;
          
          return (
            <div key={hour} className="grid grid-cols-8 border-b border-gray-100 dark:border-gray-800">
              <div className="p-2 text-xs text-muted-foreground text-right pr-3 border-r">
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </div>
              {weekDays.map((day) => {
                // Filter activities for this specific day AND hour
                const dayHourActivities = activities
                  .filter(a => isSameDay(getEffectiveActivityDate(a), day) && getActivityHour(a) === hour);
                
                return (
                   <div 
                     key={`${day.toISOString()}-${hour}`}
                     data-date={day.toISOString()}
                     data-time-slot={timeString}
                     className={cn(
                       "p-1 border-r last:border-r-0 min-h-[50px] hover:bg-muted/30 cursor-pointer transition-colors",
                       isToday(day) && "bg-primary/5",
                       selectedDate && isSameDay(day, selectedDate) && "bg-primary/10",
                       selectedTimeSlot === timeString && selectedDate && isSameDay(day, selectedDate) && "bg-blue-200 dark:bg-blue-800 ring-2 ring-blue-500",
                       // Drag over visual feedback
                       dropTargetDate && isSameDay(day, dropTargetDate) && dropTargetTime === timeString && "bg-primary/20 ring-2 ring-primary ring-inset",
                       dayHourActivities.length > 0 && getMultiStatusBorderColor?.(dayHourActivities)?.borderClass
                     )}
                     style={getMultiStatusBorderColor?.(dayHourActivities)?.style}
                     onClick={() => {
                       onDateSelect(day);
                       // Select time slot (highlight) instead of opening modal
                       onSelectTimeSlot(day, timeString);
                     }}
                     onDragOver={(e) => onTimeSlotDragOver?.(e, day, timeString)}
                     onDragLeave={onTimeSlotDragLeave}
                     onDrop={(e) => onTimeSlotDrop?.(e, day, timeString)}
                   >
                    {/* Activities for this specific hour - show max 3 */}
                    {dayHourActivities.slice(0, 3).map(activity => (
                      <div
                        key={activity.id}
                        draggable
                        onDragStart={(e) => onActivityDragStart?.(e, activity)}
                        onDragEnd={onDragEnd}
                        onTouchStart={(e) => onTouchDragStart?.(activity, e)}
                        onTouchMove={onTouchDragMove}
                        onTouchEnd={(e) => onTouchDragEnd?.(e)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onActivityClick(activity);
                        }}
                        className={cn(
                          "text-xs p-1 rounded border truncate font-medium cursor-move hover:opacity-80 transition-opacity select-none",
                          getStatusColor(activity.status),
                          getStatusBorderColor?.(activity.status),
                          draggedActivity?.id === activity.id && "opacity-50 scale-95",
                          activity.status === 'completed' || activity.status === 'late' ? "opacity-75" : ""
                        )}
                      >
                        {activity.title}
                      </div>
                    ))}
                    {/* Show +X more if there are more than 3 activities */}
                    {dayHourActivities.length > 3 && (
                      <div 
                        className="text-xs text-muted-foreground font-medium cursor-pointer hover:text-primary px-1 py-0.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Open a modal showing all activities for this time slot
                          setShowTimeSlotActivitiesModal?.(true);
                          setTimeSlotActivitiesModalData?.({ date: day, time: timeString, activities: dayHourActivities });
                        }}
                      >
                        +{dayHourActivities.length - 3} more
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      </div>
    </ScrollArea>
  );
}

// Day View Component
function DayView({
  currentDate,
  activities,
  onActivityClick,
  onSelectTimeSlot,
  selectedTimeSlot,
  isToday,
  isSameDay,
  format,
  getStatusColor,
  getStatusBorderColor,
  getMultiStatusBorderColor,
  onClearSelection,
  // Drag and drop props
  draggedActivity,
  dropTargetDate,
  dropTargetTime,
  onActivityDragStart,
  onTimeSlotDragOver,
  onTimeSlotDragLeave,
  onTimeSlotDrop,
  onDragEnd,
  // Touch handlers
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  holidays,
  holidaysEnabled,
  // New activity modal handlers
  setIsNewActivityOpen,
  setShowTimeSlotActivitiesModal,
  setTimeSlotActivitiesModalData,
  setSelectedDate,
  setActivityTime
}: {
  currentDate: Date;
  activities: any[];
  onActivityClick: (activity: any) => void;
  onSelectTimeSlot: (date: Date, time: string) => void;
  selectedTimeSlot: string | null;
  isToday: (date: Date) => boolean;
  isSameDay: (date1: Date, date2: Date) => boolean;
  format: (date: Date, formatStr: string) => string;
  getStatusColor: (status: string | null) => string;
  getStatusBorderColor?: (status: string | null) => string;
  getMultiStatusBorderColor?: (activities: any[]) => { borderClass: string; style?: React.CSSProperties };
  onClearSelection?: () => void;
  // Drag and drop props
  draggedActivity?: any;
  dropTargetDate?: Date | null;
  dropTargetTime?: string | null;
  onActivityDragStart?: (e: React.DragEvent, activity: any) => void;
  onTimeSlotDragOver?: (e: React.DragEvent, date: Date, time: string) => void;
  onTimeSlotDragLeave?: (e: React.DragEvent) => void;
  onTimeSlotDrop?: (e: React.DragEvent, date: Date, time: string) => void;
  onDragEnd?: () => void;
  // Touch handlers
  onTouchDragStart?: (activity: any, e: React.TouchEvent) => void;
  onTouchDragMove?: (e: React.TouchEvent) => void;
  onTouchDragEnd?: (e: React.TouchEvent) => void;
  holidays?: any[];
  holidaysEnabled?: boolean;
  // New activity modal handlers
  setIsNewActivityOpen?: (open: boolean) => void;
  setShowTimeSlotActivitiesModal?: (open: boolean) => void;
  setTimeSlotActivitiesModalData?: (data: { date: Date; time: string; activities: any[] } | null) => void;
  setSelectedDate?: (date: Date | null) => void;
  setActivityTime?: (time: string) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const dayActivities = activities.filter(a => isSameDay(getEffectiveActivityDate(a), currentDate));

  // Helper to get activity's scheduled hour (default to 23 if no time)
  const getActivityHour = (activity: any): number => {
    const deadlineDate = new Date(activity.deadlineDate);
    // Check if time is set (hour will be 0-23, if uninitialized it defaults to midnight)
    return deadlineDate.getHours();
  };

  return (
    <ScrollArea className="h-[700px] pr-4">
      <div className="h-full">
        {/* Day header */}
        <div className={cn(
          "p-4 border-b border-gray-200 dark:border-gray-800 bg-muted/20",
          (() => {
            const isHoliday = holidaysEnabled && holidays?.some(holiday => isSameDay(new Date(holiday.date), currentDate));
            const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
            return (isHoliday || isWeekend) ? "bg-red-50 dark:bg-red-950/20" : "";
          })()
        )}>
          <div className="flex items-center justify-between pl-4">
            <div className="flex flex-col items-center">
              <div className={cn(
                "text-xs font-bold uppercase tracking-wider",
                (() => {
                  const isHoliday = holidaysEnabled && holidays?.some(holiday => isSameDay(new Date(holiday.date), currentDate));
                  const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
                  return isHoliday ? "text-red-600 dark:text-red-400" : isToday(currentDate) ? "text-primary" : "text-muted-foreground";
                })()
              )}>{format(currentDate, 'EEE')}</div>
              <div className={cn(
                "text-4xl font-bold",
                (() => {
                  const isHoliday = holidaysEnabled && holidays?.some(holiday => isSameDay(new Date(holiday.date), currentDate));
                  const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
                  return isHoliday ? "text-red-600 dark:text-red-400" : "";
                })()
              )}>{format(currentDate, 'd')}</div>
              {(() => {
                const isHoliday = holidaysEnabled && holidays?.some(holiday => isSameDay(new Date(holiday.date), currentDate));
                const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
                if (isHoliday) {
                  const holidayName = holidays?.find(h => isSameDay(new Date(h.date), currentDate))?.name;
                  return <div className="text-xs text-red-600 dark:text-red-400 mt-1">🏖️ {holidayName}</div>;
                } else if (isWeekend) {
                  return <div className="text-xs text-red-600 dark:text-red-400 mt-1">🏖️ Weekend</div>;
                }
                return null;
              })()}
            </div>
            <div className="text-muted-foreground text-sm">{dayActivities.length} {dayActivities.length === 1 ? 'activity' : 'activities'}</div>
          </div>
        </div>
      
      {/* Time slots */}
      <div 
        className="relative cursor-default"
        onClick={(e) => {
          // Check if clicking directly on the container (not on a child element)
          if (e.target === e.currentTarget) {
            onClearSelection?.();
          }
        }}
      >
        {hours.map((hour) => {
          const hourActivities = dayActivities.filter(activity => getActivityHour(activity) === hour);
          const timeString = `${hour.toString().padStart(2, '0')}:00`;
          
          return (
            <div key={hour} className="grid grid-cols-[80px_1fr] border-b border-gray-100 dark:border-gray-800">
              <div className="p-2 text-xs text-muted-foreground text-right pr-3 border-r">
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </div>
               <div 
                 className={cn(
                   "p-1 min-h-[80px] hover:bg-muted/30 transition-colors cursor-pointer",
                   selectedTimeSlot === timeString && "bg-blue-200 dark:bg-blue-800 ring-2 ring-blue-500",
                   // Drag over visual feedback
                   dropTargetDate && isSameDay(dropTargetDate, currentDate) && dropTargetTime === timeString && "bg-primary/20 ring-2 ring-primary ring-inset",
                   hourActivities.length > 0 && getMultiStatusBorderColor?.(hourActivities)?.borderClass
                 )}
                 style={getMultiStatusBorderColor?.(hourActivities)?.style}
                 data-date={currentDate.toISOString()}
                 data-time-slot={timeString}
                 onClick={() => onSelectTimeSlot(currentDate, timeString)}
                 onDragOver={(e) => onTimeSlotDragOver?.(e, currentDate, timeString)}
                 onDragLeave={onTimeSlotDragLeave}
                 onDrop={(e) => onTimeSlotDrop?.(e, currentDate, timeString)}
               >
                {/* Activities for this specific hour - show max 3 */}
                {hourActivities.slice(0, 3).map(activity => (
                  <div
                    key={activity.id}
                    draggable
                    onDragStart={(e) => onActivityDragStart?.(e, activity)}
                    onDragEnd={onDragEnd}
                    onTouchStart={(e) => onTouchDragStart?.(activity, e)}
                    onTouchMove={onTouchDragMove}
                    onTouchEnd={(e) => onTouchDragEnd?.(e)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onActivityClick(activity);
                    }}
                    className={cn(
                      "text-sm p-2 rounded-md border mb-1 font-medium cursor-move hover:opacity-80 transition-opacity select-none",
                      getStatusColor(activity.status),
                      getStatusBorderColor?.(activity.status),
                      draggedActivity?.id === activity.id && "opacity-50 scale-95",
                      activity.status === 'completed' || activity.status === 'late' ? "opacity-75" : ""
                    )}
                  >
                    <div className="font-semibold">{activity.title}</div>
                    {activity.description && (
                      <div className="text-xs mt-1 opacity-80">{activity.description}</div>
                    )}
                  </div>
                ))}
                {/* Show +X more if there are more than 3 activities */}
                {hourActivities.length > 3 && (
                  <div 
                    className="text-sm text-muted-foreground font-medium cursor-pointer hover:text-primary px-2 py-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTimeSlotActivitiesModal?.(true);
                      setTimeSlotActivitiesModalData?.({ date: currentDate, time: timeString, activities: hourActivities });
                    }}
                  >
                    +{hourActivities.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </ScrollArea>
  );
}
