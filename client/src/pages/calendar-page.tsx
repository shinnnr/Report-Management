import { LayoutWrapper, useSidebar } from "@/components/layout-wrapper";
import { useIsMobile } from "@/hooks/use-mobile";
import { useActivities, useCreateActivity, useDeleteActivity, useStartActivity, useUpdateActivity } from "@/hooks/use-activities";
import { 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  format, 
  isSameMonth, 
  isToday,
  isSameDay,
  addDays,
  startOfWeek,
  endOfWeek,
  addWeeks,
  differenceInDays,
  isBefore,
  isAfter,
  isPast
} from "date-fns";
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Upload, FileText, Clock, CheckCircle, AlertCircle, Menu, X, Grid3X3, LayoutList, CalendarDays, Loader2 } from "lucide-react";
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
import { api, buildUrl } from "@shared/routes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  const isMobile = useIsMobile();
  const { data: activities } = useActivities();
  const createActivity = useCreateActivity();
  const deleteActivity = useDeleteActivity();
  const startActivity = useStartActivity();
  const updateActivity = useUpdateActivity();
  const { toast } = useToast();
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
    isSameMonth(new Date(a.deadlineDate), currentDate)
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
  
  // Clear concern department when regulatory agency changes
  useEffect(() => {
    setConcernDepartment([]);
  }, [regulatoryAgency]);
  
  const [reportDetails, setReportDetails] = useState("");
  const [remarks, setRemarks] = useState("");

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
        // Auto-switch to month view when navigating from notification
        setView('month');
        // Clear the URL parameter after handling
        setLocation('/calendar', { replace: true });
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
        // Clear selection when pressing Escape in Day or Week view
        if (view === 'day' || view === 'week') {
          setSelectedDate(null);
          setSelectedTimeSlot(null);
        }
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

  // Helper to get date indicators
  const getDateIndicators = (date: Date) => {
    const dayActivities = filteredActivities.filter(a => 
      isSameDay(new Date(a.deadlineDate), date)
    );
    return {
      hasOverdue: dayActivities.some(a => a.status === 'overdue'),
      hasDueSoon: dayActivities.some(a => isDueSoon(a.deadlineDate)),
      hasActivities: dayActivities.length > 0,
      activityCount: dayActivities.length
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

  // Calculate padding days for grid alignment
  const startDay = startOfMonth(currentDate).getDay();
  const paddingDays = Array.from({ length: startDay });

  const handleCreate = async () => {
    if (!title || !selectedDate) return;
    
    // Combine selected date with activity time
    const [hours, minutes] = activityTime.split(':').map(Number);
    const deadlineWithTime = new Date(selectedDate);
    deadlineWithTime.setHours(hours, minutes, 0, 0);
    
    await createActivity.mutateAsync({
      title,
      description,
      startDate: new Date(),
      deadlineDate: deadlineWithTime,
      status: 'pending',
      regulatoryAgency: regulatoryAgency || null,
      concernDepartment: concernDepartment.length > 0 ? concernDepartment.join(", ") : null,
      reportDetails: reportDetails || null,
      remarks: remarks || null,
    });
    setIsNewActivityOpen(false);
    setSelectedDate(null);
    setTitle("");
    setDescription("");
    setActivityTime("23:59");
    setRegulatoryAgency("");
    setConcernDepartment([]);
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
    ? activities?.filter(a => isSameDay(new Date(a.deadlineDate), selectedDate)) || []
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

    setIsSubmitting(true);
    try {
      // Submit all files without creating notifications
      const uploadPromises = selectedFiles.map(async (file) => {
        return new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = reader.result as string;

            try {
              // Suppress all notifications - we'll create one after all uploads
              // Also send the deadline year/month to ensure correct folder creation
              const deadlineDate = new Date(selectedActivity.deadlineDate);
              const deadlineYear = deadlineDate.getFullYear();
              const deadlineMonth = deadlineDate.getMonth() + 1;
              
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
                  suppressNotification: true,
                  deadlineYear,
                  deadlineMonth,
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

      // Create a single notification after all uploads complete
      // Fetch the list of users to notify (excluding the submitter)
      const usersResponse = await fetch(api.users.list.path);
      const users = await usersResponse.json();
      
      // Create notifications for all other users
      for (const recipient of users) {
        if (recipient.id !== user?.id) {
          await fetch(api.notifications.create.path, {
            method: api.notifications.create.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: recipient.id,
              activityId: selectedActivity.id,
              title: 'Activity Submitted',
              content: `${user?.fullName || 'A user'} submitted ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} for: ${selectedActivity.title}`,
              isRead: false
            })
          });
        }
      }

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
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
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
        <div className="flex flex-row items-center gap-2">
          {/* Delete All Activities Button - shows when date is selected with activities */}
          {selectedDate && selectedDateActivities.length > 0 && (
            <Button
              variant="destructive"
              onClick={() => setShowDeleteAllConfirm(true)}
              className="gap-2 whitespace-nowrap"
              disabled={isDeletingAll}
            >
              <Trash2 className="w-4 h-4" />
              {isDeletingAll ? "Deleting..." : `Delete All (${selectedDateActivities.length})`}
            </Button>
          )}

          <Dialog open={isNewActivityOpen} onOpenChange={(open) => {
            setIsNewActivityOpen(open);
            if (!open) {
              // Reset form state
              setTitle("");
              setDescription("");
              setActivityTime("23:59");
              setRegulatoryAgency("");
              setConcernDepartment([]);
              setReportDetails("");
              setRemarks("");
            }
          }}>
          <DialogTrigger asChild>
            <Button
              className="gap-2 shadow-lg shadow-primary/20 bg-primary whitespace-nowrap"
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
              {selectedDate ? `Add Activity for ${format(selectedDate, 'MMMM d')}` : 'Select Date'}
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
                        <SelectTrigger className="h-10 border border-gray-300 dark:border-gray-600">
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
                      <Label className="text-sm font-medium">Concern Department</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-10 w-full justify-start border border-gray-300 dark:border-gray-600 font-normal">
                            {concernDepartment.length > 0 ? (
                              <span className="truncate">
                                {concernDepartment.join(", ")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Select departments</span>
                            )}
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
                <Button onClick={handleCreate} disabled={createActivity.isPending || !title || !regulatoryAgency || concernDepartment.length === 0}>
                  {createActivity.isPending ? (
                    <>
                      Creating...
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
        </div>

        {/* Day Activities Modal */}
        {dayActivitiesModalDate && (() => {
          const dayActs = (activities || []).filter(a => 
            isSameDay(new Date(a.deadlineDate), dayActivitiesModalDate)
          );
          const totalPages = Math.ceil(dayActs.length / dayActivitiesPerPage);
          const paginatedActivities = dayActs.slice(
            (dayActivitiesPage - 1) * dayActivitiesPerPage,
            dayActivitiesPage * dayActivitiesPerPage
          );
          
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
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedDate(dayActivitiesModalDate);
                        setNewActivityFromDayModal(true);
                        setIsNewActivityOpen(true);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Activity
                    </Button>
                  </div>
                  <DialogDescription>
                    Total: {dayActs.length} {dayActs.length === 1 ? "activity" : "activities"}
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-2 py-4 px-4">
                  {paginatedActivities.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No activities for this day</p>
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
                          setActivityFromDayModal(true);
                          setIsActivityModalOpen(true);
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

            <div className="space-y-6 overflow-y-auto max-h-[calc(90vh-180px)] pr-2">
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
              {selectedActivity?.status === 'pending' && (
                <Button 
                  onClick={() => startActivity.mutate(selectedActivity.id, {
                    onSuccess: (updatedActivity) => {
                      if (updatedActivity) {
                        setSelectedActivity(updatedActivity);
                      }
                    }
                  })}
                  disabled={startActivity.isPending}
                  className="w-full"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  {startActivity.isPending ? 'Starting...' : 'Start Activity'}
                </Button>
              )}

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
                            <span className="truncate max-w-[150px]" title={file.name}>{file.name.length > 15 ? file.name.substring(0, 15) + '...' : file.name}</span>
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

            <DialogFooter className="flex justify-between flex-shrink-0 mt-4">
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
                <Button
                  size="sm"
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
                  Add Activity
                </Button>
              </div>
              <DialogDescription>
                {timeSlotActivitiesModalData ? format(timeSlotActivitiesModalData.date, 'MMMM d, yyyy') : ''} - {timeSlotActivitiesModalData?.activities.length} {timeSlotActivitiesModalData?.activities.length === 1 ? 'activity' : 'activities'}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2 py-4 px-4">
                {timeSlotActivitiesModalData?.activities.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No activities at this time</p>
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
                              setActivityFromDayModal(true);
                              setIsActivityModalOpen(true);
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
                    deleteActivity.mutate(activityToDelete.id);
                    setIsActivityModalOpen(false);
                  }
                  setShowDeleteConfirm(false);
                }}
                disabled={deleteActivity.isPending}
              >
                {deleteActivity.isPending ? "Deleting..." : "Delete"}
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
                const newDate = new Date(currentDate);
                if (view === 'day') newDate.setDate(newDate.getDate() - 1);
                else if (view === 'week') newDate.setDate(newDate.getDate() - 7);
                else newDate.setMonth(newDate.getMonth() - 1);
                setCurrentDate(newDate);
              }}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => {
                const newDate = new Date(currentDate);
                if (view === 'day') newDate.setDate(newDate.getDate() + 1);
                else if (view === 'week') newDate.setDate(newDate.getDate() + 7);
                else newDate.setMonth(newDate.getMonth() + 1);
                setCurrentDate(newDate);
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
            isSameDay(new Date(a.deadlineDate), date)
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
                dayActivities.length > 0 && multiBorder.borderClass
              )}
              style={multiBorder.style}
              onClick={(e) => {
                e.stopPropagation();
                if (selectedDate && isSameDay(date, selectedDate)) {
                  setSelectedDate(null);
                } else {
                  setSelectedDate(date);
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setDayActivitiesModalDate(date);
                setDayActivitiesPage(1);
                setShowDayActivitiesModal(true);
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
                      setIsActivityModalOpen(true);
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
            currentDate={currentDate} 
            activities={filteredActivities}
            onDateSelect={(date) => {
              setSelectedDate(date);
              setCurrentDate(date);
            }}
            selectedDate={selectedDate}
            onActivityClick={(activity) => {
              setSelectedActivity(activity);
              setIsActivityModalOpen(true);
            }}
            onSelectTimeSlot={handleSelectTimeSlot}
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
              // Only clear if not showing reschedule confirmation (check rescheduleTargetDate)
              if (!rescheduleTargetDate) {
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
            onDayClick={handleDayClickInWeekView}
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
            currentDate={currentDate} 
            activities={filteredActivities}
            onActivityClick={(activity) => {
              setSelectedActivity(activity);
              setIsActivityModalOpen(true);
            }}
            onSelectTimeSlot={handleSelectTimeSlot}
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
          />
        )}
      </div>

      {/* Upcoming Activities Sidebar */}
      <div className="mt-8 bg-card rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-muted/20">
          <h3 className="font-semibold text-lg">Upcoming Activities</h3>
          <p className="text-sm text-muted-foreground">Next activities and overdue items</p>
        </div>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4 px-4 pb-4">
            {/* Overdue Section */}
            {activities && activities.filter(a => a.status === 'overdue').length > 0 && (
              <div className="mt-4">
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
                          setIsActivityModalOpen(true);
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
            <div>
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
                          setIsActivityModalOpen(true);
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
      <div className="mt-8 bg-card rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-muted/20">
          <h3 className="font-semibold text-lg">Activities by Agency & Department</h3>
          <p className="text-sm text-muted-foreground">Filter activities by regulatory agency and concern department</p>
        </div>
        <div className="p-4">
          {/* Filter Dropdowns */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">Regulatory Agency</label>
              <Select value={filterAgency || 'all'} onValueChange={(value) => { setFilterAgency(value === 'all' ? '' : value); setFilterDepartment(''); }}>
                <SelectTrigger className="w-full">
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
                <label className="text-sm font-medium mb-1 block">Concern Department</label>
                <Select value={filterDepartment || 'all'} onValueChange={(value) => setFilterDepartment(value === 'all' ? '' : value)} disabled={true}>
                  <SelectTrigger className="w-full">
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
                <label className="text-sm font-medium mb-1 block">Concern Department</label>
                <Select value={filterDepartment || 'all'} onValueChange={(value) => setFilterDepartment(value === 'all' ? '' : value)} disabled={!filterAgency}>
                  <SelectTrigger className="w-full">
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
          <div className="space-y-2">
            {activities && (() => {
              const filtered = activities.filter(a => {
                const matchesAgency = !filterAgency || a.regulatoryAgency === filterAgency;
                
                // Apply role-based department filtering
                let matchesDept = true;
                if (filterDepartment) {
                  // Check if the stored department string contains the filter department
                  matchesDept = a.concernDepartment?.includes(filterDepartment);
                } else if (enableRoleFiltering && user?.role && user.role !== 'admin') {
                  // Auto-filter based on user role when role-based filtering is enabled
                  // Now departments are stored as comma-separated values
                  if (user.role === 'cps') {
                    matchesDept = a.concernDepartment?.includes('CITET-CPS');
                  } else if (user.role === 'ets') {
                    matchesDept = a.concernDepartment?.includes('CITET-ETS');
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
                <ScrollArea className="h-[300px] p-4 space-y-2">
                  <div className="space-y-2">
                    {paginatedActivities.map(activity => (
                      <button
                        key={activity.id}
                        onClick={() => {
                          const activityDate = new Date(activity.deadlineDate);
                          setCurrentDate(activityDate);
                          setSelectedActivity(activity);
                          setIsActivityModalOpen(true);
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
                  
                  {/* Pagination - moved to footer outside ScrollArea */}
                  {filtered.length > 0 && (
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
          {weekDays.map((day) => (
          <div 
            key={day.toISOString()} 
            className={cn(
              "p-2 text-center border-r last:border-r-0 cursor-pointer hover:bg-muted/50 transition-colors",
              isToday(day) && "bg-primary/10"
            )}
            onClick={() => onDayClick?.(day)}
          >
            <div className={cn(
              "text-xs font-semibold",
              isToday(day) ? "text-primary" : "text-muted-foreground"
            )}>{format(day, 'EEE')}</div>
            <div className={cn(
              "text-lg font-semibold",
              isToday(day) && "bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center mx-auto"
            )}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
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
                  .filter(a => isSameDay(new Date(a.deadlineDate), day) && getActivityHour(a) === hour);
                
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
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onSelectTimeSlot(day, timeString);
                      // Set selected date and time for the modal
                      setSelectedDate?.(day);
                      setActivityTime?.(timeString);
                      setTimeSlotActivitiesModalData?.({ date: day, time: timeString, activities: dayHourActivities });
                      setShowTimeSlotActivitiesModal?.(true);
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
  // New activity modal handlers
  setIsNewActivityOpen?: (open: boolean) => void;
  setShowTimeSlotActivitiesModal?: (open: boolean) => void;
  setTimeSlotActivitiesModalData?: (data: { date: Date; time: string; activities: any[] } | null) => void;
  setSelectedDate?: (date: Date | null) => void;
  setActivityTime?: (time: string) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const dayActivities = activities.filter(a => isSameDay(new Date(a.deadlineDate), currentDate));

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
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-muted/20">
          <div className="flex items-center justify-between pl-4">
            <div className="flex flex-col items-center">
              <div className="text-xs font-bold text-primary uppercase tracking-wider">{format(currentDate, 'EEE')}</div>
              <div className="text-4xl font-bold">{format(currentDate, 'd')}</div>
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
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onSelectTimeSlot(currentDate, timeString);
                  setSelectedDate?.(currentDate);
                  setActivityTime?.(timeString);
                  setTimeSlotActivitiesModalData?.({ date: currentDate, time: timeString, activities: hourActivities });
                  setShowTimeSlotActivitiesModal?.(true);
                }}
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
