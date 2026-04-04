import { useState, useEffect, useCallback, useRef } from "react";
import { LayoutWrapper, useSidebar } from "@/components/layout-wrapper";
import { useIsMobile } from "@/hooks/use-mobile";
import { format, isSameDay, isSameMonth, eachDayOfInterval, startOfMonth, endOfMonth, addDays, addWeeks, addMonths, startOfWeek, differenceInDays, isToday } from "date-fns";
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
import { type InsertActivity } from "@shared/schema";
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

// Helper function to move a date to the previous working day while preserving time
const adjustToPreviousWorkingDay = (date: Date): Date => {
  const adjustedDate = new Date(date);

  while (isDateWeekend(adjustedDate) || isDateHoliday(adjustedDate)) {
    adjustedDate.setDate(adjustedDate.getDate() - 1);
  }

  return adjustedDate;
};

const buildRecurringDeadlineForMonth = (year: number, month: number, originalDate: Date): Date => {
  const maxDayInMonth = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(originalDate.getDate(), maxDayInMonth);
  const deadlineDate = new Date(year, month, clampedDay);
  deadlineDate.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0);
  return adjustToPreviousWorkingDay(deadlineDate);
};

// Helper function to generate recurring activities for a specific year based on an original activity
const generateRecurringActivitiesForYear = (originalActivity: any, year: number): any[] => {
  const activities: any[] = [];
  const recurrence = originalActivity.recurrence;

  if (!recurrence) return activities;

  // Ensure deadlineDate is a Date object
  const originalDate = new Date(originalActivity.deadlineDate);

  switch (recurrence) {
    case 'monthly':
      // Create 12 activities, one for each month
      for (let month = 0; month < 12; month++) {
        activities.push({
          ...originalActivity,
          deadlineDate: buildRecurringDeadlineForMonth(year, month, originalDate),
          startDate: new Date(year, month, 1), // Start of the month
          id: undefined, // Will be assigned by backend
        });
      }
      break;

    case 'quarterly':
      // Create 4 activities, one for each quarter
      const quarters = [0, 3, 6, 9]; // January, April, July, October
      quarters.forEach(month => {
        activities.push({
          ...originalActivity,
          deadlineDate: buildRecurringDeadlineForMonth(year, month, originalDate),
          startDate: new Date(year, month, 1),
          id: undefined,
        });
      });
      break;

    case 'semi-annual':
      // Create 2 activities, one for each half of the year
      const halves = [0, 6]; // January, July
      halves.forEach(month => {
        activities.push({
          ...originalActivity,
          deadlineDate: buildRecurringDeadlineForMonth(year, month, originalDate),
          startDate: new Date(year, month, 1),
          id: undefined,
        });
      });
      break;

    case 'yearly':
      // Create 1 activity for the year
      activities.push({
        ...originalActivity,
        deadlineDate: buildRecurringDeadlineForMonth(year, originalDate.getMonth(), originalDate),
        startDate: new Date(year, 0, 1), // Start of the year
        id: undefined,
      });
      break;
  }

  return activities;
};

// Helper function to get the count of activities that would be created for a year
const getActivitiesCountForYear = (originalActivity: any, year: number): number => {
  const recurrence = originalActivity.recurrence;

  if (!recurrence) return 0;

  switch (recurrence) {
    case 'monthly': return 12;
    case 'quarterly': return 4;
    case 'semi-annual': return 2;
    case 'yearly': return 1;
    default: return 0;
  }
};

const getTargetMonthsForRecurrence = (recurrence: string | null | undefined, originalMonth: number): number[] => {
  switch (recurrence) {
    case 'yearly':
      return [originalMonth];
    case 'semi-annual':
      return [originalMonth, (originalMonth + 6) % 12];
    case 'quarterly':
      return [originalMonth, (originalMonth + 3) % 12, (originalMonth + 6) % 12, (originalMonth + 9) % 12];
    case 'monthly':
      return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    default:
      return [];
  }
};

const getCreatedActivitiesCount = (
  startDate: Date,
  deadlineDate: Date,
  recurrence: string,
  recurrenceEndDate?: Date | null,
): number => {
  if (!recurrence || recurrence === 'none' || !recurrenceEndDate) {
    return 1;
  }

  const originalDay = deadlineDate.getDate();
  const originalMonth = deadlineDate.getMonth();
  const originalDeadlineYear = deadlineDate.getFullYear();
  const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endYear = recurrenceEndDate.getFullYear();
  const endMonth = recurrenceEndDate.getMonth();
  const currentYear = new Date().getFullYear();
  const startYear = Math.max(currentYear, originalDeadlineYear);
  const targetMonths = getTargetMonthsForRecurrence(recurrence, originalMonth);

  let count = 1;

  for (let year = startYear; year <= endYear; year++) {
    for (const month of targetMonths) {
      if (year === originalDeadlineYear && month === originalMonth) {
        continue;
      }

      const maxDayInMonth = new Date(year, month + 1, 0).getDate();
      const day = Math.min(originalDay, maxDayInMonth);
      const generatedDeadline = adjustToPreviousWorkingDay(new Date(year, month, day));
      const generatedDateOnly = new Date(
        generatedDeadline.getFullYear(),
        generatedDeadline.getMonth(),
        generatedDeadline.getDate(),
      );

      if (generatedDateOnly < startDateOnly) {
        continue;
      }

      if (
        generatedDeadline.getFullYear() > endYear ||
        (generatedDeadline.getFullYear() === endYear && generatedDeadline.getMonth() > endMonth)
      ) {
        continue;
      }

      count++;
    }
  }

  return count;
};

const chunkArray = <T,>(items: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
};

const getActivityCreatedSortValue = (activity: { createdAt?: string | Date | null; id?: number }) => {
  if (activity.createdAt) {
    const createdAtTime = new Date(activity.createdAt).getTime();
    if (!Number.isNaN(createdAtTime)) {
      return createdAtTime;
    }
  }

  return activity.id ?? 0;
};

const sortActivitiesByLatestCreated = <T extends { createdAt?: string | Date | null; id?: number }>(items: T[]) =>
  [...items].sort((left, right) => {
    const createdAtDifference = getActivityCreatedSortValue(right) - getActivityCreatedSortValue(left);
    if (createdAtDifference !== 0) {
      return createdAtDifference;
    }

    return (right.id ?? 0) - (left.id ?? 0);
  });

const getConcernDepartmentTokens = (value?: string | null): string[] =>
  value
    ? value.split(",").map((department) => department.trim()).filter(Boolean)
    : [];

const matchesConcernDepartmentFilter = (
  concernDepartmentValue: string | null | undefined,
  filterValue: string,
  agency?: string,
): boolean => {
  const tokens = getConcernDepartmentTokens(concernDepartmentValue);
  if (tokens.length === 0) return false;

  if (filterValue === "FSD") return tokens.some((token) => token === "FSD" || token.startsWith("FSD"));
  if (filterValue === "ISD" || filterValue === "SD") return tokens.some((token) => token === filterValue || token === "ISD" || token === "SD" || token.startsWith("ISD"));
  if (filterValue === "TSD") return tokens.some((token) => token === "TSD" || token.startsWith("TSD"));
  if (filterValue === "CITET") return tokens.some((token) => token === "CITET" || token.startsWith("CITET"));
  if (filterValue === "ZOD") return tokens.some((token) => token === "ZOD" || token.startsWith("ZONE"));

  return tokens.some((token) => token === filterValue);
};

const sortDepartmentOptions = (departments: string[]) => [...departments].sort((a, b) => a.localeCompare(b));

const AGENCY_DEPARTMENT_OPTIONS: Record<string, string[]> = {
  DOE: sortDepartmentOptions(["CITET", "CITET-CPS", "CITET-ETS"]),
  ERC: sortDepartmentOptions(["CITET", "CITET-ETS", "FSD", "FSD-BUDGET OFFICER", "FSD-CACD", "FSD-GAD", "ISD", "ISD-CWDC", "ISD-MSD", "TSD", "TSD-DAMD", "TSD-DNOD"]),
  NEA: sortDepartmentOptions(["CITET", "CITET-CPS", "CITET-ETS", "FSD", "FSD-CACD", "FSD-CASHIER", "FSD-GAD", "FSD-ACCOUNTING CLERK", "ISD", "ISD-HRADD", "ISD-MSD", "ISD-CWDC", "TSD", "TSD-DAMD", "TSD-DNOD", "ZOD", "ZONE-ZOS"]),
  "NEA-WEB PORTAL": sortDepartmentOptions(["CITET", "CITET-ETS", "FSD", "FSD-GAD", "ISD", "ISD-HRADD", "ISD-MSD", "OGM", "TSD", "TSD-DAMD", "TSD-DNOD", "ZOD", "ZONE-ZOS"]),
  PSALM: sortDepartmentOptions(["FSD", "FSD-GAD"]),
  NGCP: sortDepartmentOptions(["TSD", "TSD-DAMD", "TSD-DNOD"]),
  IEMOP: sortDepartmentOptions(["FSD", "FSD-CASHIER", "FSD-ACCOUNTING CLERK"]),
};

const MONTH_VIEW_VISIBLE_ACTIVITIES = 2;
const TIME_SLOT_VISIBLE_ACTIVITIES = 1;

const getCalendarDisplayDate = (activity: any): Date => {
  return new Date(activity.deadlineDate);
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

const shouldPreserveCalendarMouseDown = (target: EventTarget | null): boolean => {
  return target instanceof HTMLElement && Boolean(
    target.closest('[draggable="true"], button, a, input, textarea, select, [role="button"]')
  );
};

const handleCalendarCellMouseDown = (e: React.MouseEvent<HTMLElement>) => {
  if (shouldPreserveCalendarMouseDown(e.target)) {
    return;
  }

  e.preventDefault();
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
    isSameMonth(getCalendarDisplayDate(a), currentDate)
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deletingAllDateKeys, setDeletingAllDateKeys] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [startingActivityId, setStartingActivityId] = useState<number | null>(null);
  const [confirmDeletingActivityId, setConfirmDeletingActivityId] = useState<number | null>(null);
  const [manuallyClosedWhileAdding, setManuallyClosedWhileAdding] = useState(false);
  
  // Day Activities Modal State
  const [showDayActivitiesModal, setShowDayActivitiesModal] = useState(false);
  const [dayActivitiesModalDate, setDayActivitiesModalDate] = useState<Date | null>(null);
  const [dayActivitiesPage, setDayActivitiesPage] = useState(1);
  const [selectedDayActivityIds, setSelectedDayActivityIds] = useState<number[]>([]);
  const [newActivityReturnModal, setNewActivityReturnModal] = useState<null | 'day' | 'time'>(null);
  const [holidayReturnModal, setHolidayReturnModal] = useState<null | 'day' | 'time'>(null);
  const dayActivitiesPerPage = 10;
  const [selectedTimeSlotActivityIds, setSelectedTimeSlotActivityIds] = useState<number[]>([]);
  const [deleteSelectionContext, setDeleteSelectionContext] = useState<null | {
    type: 'day' | 'time';
    ids: number[];
    label: string;
  }>(null);
  const [confirmDeletingSelectionType, setConfirmDeletingSelectionType] = useState<null | 'day' | 'time'>(null);

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
  const holidayModalFormRef = useRef<HTMLDivElement | null>(null);

  // Check if holiday fields have changed from original values
  const hasHolidayChanges = editingHoliday && (
    holidayName !== editingHoliday.name || 
    (holidayDate && editingHoliday.date && !isSameDay(new Date(holidayDate), new Date(editingHoliday.date)))
  );
  const selectedSubmissionHoliday = holidaysEnabledData
    ? holidays?.find((holiday: any) => isSameDay(new Date(holiday.date), submissionDate))
    : undefined;
  const holidaySubmissionToastDescription = "The selected submission date matches a configured holiday.";
  const selectedDateRef = useRef<Date | null>(null);

  const scrollHolidayModalToForm = () => {
    requestAnimationFrame(() => {
      holidayModalFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // Delete Recurring Activities State
  const [deleteRecurTypes, setDeleteRecurTypes] = useState<string[]>([]);
  const [deleteRecurTitles, setDeleteRecurTitles] = useState<string[]>([]);
  const [deleteRecurYears, setDeleteRecurYears] = useState<string[]>([]);
  const [deleteRecurPreview, setDeleteRecurPreview] = useState<any[]>([]);
  const [showDeleteRecurConfirm, setShowDeleteRecurConfirm] = useState(false);
  const [isDeletingRecurring, setIsDeletingRecurring] = useState(false);

  // Add Recurring Activities State
  const [addRecurTypes, setAddRecurTypes] = useState<string[]>([]);
  const [addRecurTitles, setAddRecurTitles] = useState<string[]>([]);
  const [addRecurYears, setAddRecurYears] = useState<string[]>([]);
  const [addRecurPreview, setAddRecurPreview] = useState<any[]>([]);
  const [isAddingRecurring, setIsAddingRecurring] = useState(false);
  
  // Clear concern department when regulatory agency changes
  useEffect(() => {
    setConcernDepartment([]);
  }, [regulatoryAgency]);

  useEffect(() => {
    if (!canDeleteActivities) {
      setSelectedDayActivityIds([]);
      setSelectedTimeSlotActivityIds([]);
    }
  }, [canDeleteActivities]);

  useEffect(() => {
    if (isActivityModalOpen && selectedActivity?.id) {
      setSubmissionDate(new Date());
    }
  }, [isActivityModalOpen, selectedActivity?.id]);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const handleRecurrenceChange = (value: string) => {
    setRecurrence(value);
    setRecurrenceEndDate("");
  };
  
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
      isSameDay(getCalendarDisplayDate(a), date)
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

  const resetDragInteractionState = useCallback(() => {
    setDraggedActivity(null);
    setDropTargetDate(null);
    setDropTargetTime(null);
    setIsDraggingOverTimeSlot(false);
    stopAutoScroll();
  }, [stopAutoScroll]);

  const performActivityReschedule = useCallback(async (
    activityToMove: any,
    targetDate: Date,
    targetTime?: string | null,
  ) => {
    const restrictedStatuses = ['completed', 'late', 'in-progress'];
    if (restrictedStatuses.includes(activityToMove.status)) {
      toast({
        title: "Cannot reschedule",
        description: `Activities with status "${activityToMove.status}" cannot be rescheduled.`,
        variant: "destructive"
      });
      return;
    }

    try {
      const deadlineDateStr = new Date(targetDate);
      if (targetTime) {
        const [hours, minutes] = targetTime.split(':').map(Number);
        deadlineDateStr.setHours(hours, minutes, 0, 0);
      } else {
        const originalDate = new Date(activityToMove.deadlineDate);
        deadlineDateStr.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0);
      }

      const { activity: updatedActivity } = await updateActivity.mutateAsync({
        id: activityToMove.id,
        data: {
          deadlineDate: deadlineDateStr,
          applyToSeries: Boolean(activityToMove.recurrence && activityToMove.recurrence !== 'none'),
        },
        suppressSuccessToast: true,
      });

      if (selectedActivity?.id === activityToMove.id) {
        setSelectedActivity(updatedActivity);
      }

      const finalDeadline = new Date(updatedActivity.deadlineDate);
      const finalDateLabel = format(finalDeadline, 'MMMM d, yyyy');
      const timeStr = targetTime ? ` at ${format(finalDeadline, 'HH:mm')}` : '';
      const statusChangeMsg = updatedActivity.status === 'overdue' ? ' Status changed to Overdue.' : '';
      const wasAdjustedToPreviousWorkingDay = !isSameDay(finalDeadline, targetDate);
      const adjustmentMsg = wasAdjustedToPreviousWorkingDay ? ' Adjusted to the previous working day.' : '';
      toast({
        title: activityToMove.recurrence && activityToMove.recurrence !== 'none'
          ? "Reschedule all activities"
          : "Activity rescheduled",
        description: activityToMove.recurrence && activityToMove.recurrence !== 'none'
          ? "Moved all recurring activities"
          : `Moved to ${finalDateLabel}${timeStr}.${statusChangeMsg}${adjustmentMsg}`
      });
    } catch (error) {
      // Error handled by mutation
    }
  }, [selectedActivity, toast, updateActivity]);

  // Handle drop on time slot (Week/Day view)
  const handleTimeSlotDrop = (e: React.DragEvent, date: Date, time: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverTimeSlot(false);

    const activityToMove = draggedActivity;
    resetDragInteractionState();

    if (activityToMove) {
      const currentDeadline = new Date(activityToMove.deadlineDate);
      const targetDateTime = new Date(date);
      const [hours, minutes] = time.split(':').map(Number);
      targetDateTime.setHours(hours, minutes, 0, 0);
      
      const hasDateChanged = !isSameDay(currentDeadline, date);
      const hasTimeChanged = currentDeadline.getHours() !== hours || currentDeadline.getMinutes() !== minutes;
      
      if (hasDateChanged || hasTimeChanged) {
        void performActivityReschedule(activityToMove, date, time);
        return;
      }
    }
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
          resetDragInteractionState();
          setIsTouchDragging(false);
          touchDragRef.current = null;
          void performActivityReschedule(activity, targetDate, targetTimeStr);
          return;
        }
      }
    }
    
    resetDragInteractionState();
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

    const activityToMove = draggedActivity;
    resetDragInteractionState();

    if (activityToMove) {
      const currentDeadline = new Date(activityToMove.deadlineDate);
      if (!isSameDay(currentDeadline, date)) {
        void performActivityReschedule(activityToMove, date);
        return;
      }
    }
  };

  const handleActivityDragEnd = useCallback(() => {
    resetDragInteractionState();
  }, [resetDragInteractionState]);

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
  const trailingPaddingCount = (7 - ((paddingDays.length + daysInMonth.length) % 7)) % 7;
  const trailingPaddingDays = Array.from({ length: trailingPaddingCount });

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
      const dayActivities = (activities || []).filter(a => isSameDay(getCalendarDisplayDate(a), date));
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
    const adjustedDeadline = adjustToPreviousWorkingDay(deadlineWithTime);
    const recurrenceEndDateValue =
      recurrence !== 'none' && recurrenceEndDate ? new Date(recurrenceEndDate) : null;
    const createdActivitiesCount = getCreatedActivitiesCount(
      selectedDate,
      adjustedDeadline,
      recurrence,
      recurrenceEndDateValue,
    );

    if (adjustedDeadline.getTime() !== deadlineWithTime.getTime()) {
      toast({
        title: "Date adjusted",
        description: `Activity date was moved to ${format(adjustedDeadline, 'MMMM d, yyyy')} because the selected date falls on a weekend or holiday.`,
      });
    }

    await createActivity.mutateAsync({
      data: {
        title,
        description,
        startDate: selectedDate,
        deadlineDate: adjustedDeadline,
        status: 'pending',
        regulatoryAgency: regulatoryAgency || null,
        concernDepartment: concernDepartment.length > 0 ? concernDepartment.join(", ") : null,
        reportDetails: reportDetails || null,
        remarks: remarks || null,
        recurrence: recurrence !== 'none' ? recurrence : null,
        recurrenceEndDate: recurrenceEndDateValue,
      },
      suppressSuccessToast: true,
    });

    toast({
      title: "Success",
      description: createdActivitiesCount === 1
        ? "Activity created"
        : `Created ${createdActivitiesCount} activities`,
    });

    // Reset the flag
    setManuallyClosedWhileAdding(false);
  };

  const createActivitiesFast = async (activitiesToCreate: InsertActivity[]) => {
    const errors: string[] = [];

    for (const activityBatch of chunkArray(activitiesToCreate, 10)) {
      const results = await Promise.allSettled(
        activityBatch.map(async (activity) => {
          const response = await fetch(api.activities.create.path, {
            method: api.activities.create.method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(activity),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: "Failed to create activity" }));
            throw new Error(errorData?.message || "Failed to create activity");
          }

          return api.activities.create.responses[201].parse(await response.json());
        })
      );

      results.forEach((result) => {
        if (result.status === "rejected") {
          errors.push(result.reason instanceof Error ? result.reason.message : "Failed to create activity");
        }
      });
    }

    if (errors.length > 0) {
      throw new Error(errors[0]);
    }

    await queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });
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

  // Get the left stripe style for a day cell with one or more activities
  const getDayCellStatusStripe = (activities: any[]): { stripeClass: string; style?: React.CSSProperties } => {
    if (!activities || activities.length === 0) return { stripeClass: '', style: undefined };

    const statuses = Array.from(new Set(activities.map(a => a.status)));

    if (statuses.length === 0) return { stripeClass: '', style: undefined };

    const colorMap: Record<string, { className: string; hex: string }> = {
      'completed': { className: 'bg-emerald-500', hex: '#10b981' },
      'overdue': { className: 'bg-red-500', hex: '#ef4444' },
      'late': { className: 'bg-orange-500', hex: '#f97316' },
      'in-progress': { className: 'bg-blue-500', hex: '#3b82f6' },
      'pending': { className: 'bg-amber-500', hex: '#f59e0b' },
    };

    if (statuses.length === 1) {
      const stripe = colorMap[statuses[0]] || colorMap.pending;
      return { stripeClass: stripe.className, style: undefined };
    }

    const colors = statuses.map(status => (colorMap[status] || colorMap.pending).hex);
    const stripeWidth = 100 / colors.length;
    const gradientStops = colors.map((color, i) =>
      `${color} ${i * stripeWidth}% ${(i + 1) * stripeWidth}%`
    ).join(', ');

    return {
      stripeClass: '',
      style: {
        background: `linear-gradient(to bottom, ${gradientStops})`,
      }
    };
  };

  // Get multi-colored border for week/day time slots with multiple activities
  const getMultiStatusBorderColor = (activities: any[]): { borderClass: string; style?: React.CSSProperties } => {
    if (!activities || activities.length === 0) return { borderClass: '', style: undefined };

    const statuses = Array.from(new Set(activities.map(a => a.status)));

    if (statuses.length === 0) return { borderClass: '', style: undefined };
    if (statuses.length === 1) {
      return { borderClass: getStatusBorderColor(statuses[0]), style: undefined };
    }

    const colorMap: Record<string, string> = {
      'completed': '#10b981',
      'overdue': '#ef4444',
      'late': '#f97316',
      'in-progress': '#3b82f6',
      'pending': '#f59e0b',
    };

    const colors = statuses.map(status => colorMap[status] || colorMap.pending);
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
    ? activities?.filter(a => isSameDay(getCalendarDisplayDate(a), selectedDate)) || []
    : [];
  const getDeleteAllDateKey = (date: Date | null) => date ? format(date, 'yyyy-MM-dd') : null;
  const selectedDateDeleteKey = getDeleteAllDateKey(selectedDate);
  const isDeletingSelectedDate = selectedDateDeleteKey ? deletingAllDateKeys.includes(selectedDateDeleteKey) : false;

  const handleDeleteAllByDate = async () => {
    if (!selectedDate) return;

    const targetDate = selectedDate;
    const targetDateKey = getDeleteAllDateKey(targetDate);
    const targetDateActivities = [...selectedDateActivities];
    if (!targetDateKey) return;

    setDeletingAllDateKeys(prev => prev.includes(targetDateKey) ? prev : [...prev, targetDateKey]);
    try {
      // Delete all activities for the selected date using direct API calls to avoid multiple toasts
      const deleteResults = await Promise.all(
        targetDateActivities.map(async (activity) => {
          const url = buildUrl(api.activities.delete.path, { id: activity.id });
          const response = await fetch(url, { method: api.activities.delete.method });
          return { id: activity.id, success: response.ok };
        })
      );
      
      const failedCount = deleteResults.filter(r => !r.success).length;
      
      // Invalidate queries to refresh the list
      queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });

      if (getDeleteAllDateKey(selectedDateRef.current) === targetDateKey) {
        setShowDeleteAllConfirm(false);
        setSelectedDate(null);
      }
      
      if (failedCount === 0) {
        toast({
          title: "Deleted",
          description: `All ${targetDateActivities.length} activities for ${format(targetDate, 'MMMM d, yyyy')} have been deleted`,
        });
      } else if (targetDateActivities.length - failedCount > 0) {
        toast({
          title: "Partially Deleted",
          description: `${targetDateActivities.length - failedCount} activities deleted. ${failedCount} failed to delete.`,
        });
      } else {
        toast({ title: "Error", description: "Failed to delete activities. Please try again.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Failed to delete activities:", error);
      toast({ title: "Error", description: "Failed to delete activities. Please try again.", variant: "destructive" });
    } finally {
      setDeletingAllDateKeys(prev => prev.filter(key => key !== targetDateKey));
    }
  };

  const toggleDayActivitySelection = (id: number) => {
    setSelectedDayActivityIds(prev =>
      prev.includes(id) ? prev.filter(activityId => activityId !== id) : [...prev, id]
    );
  };

  const toggleTimeSlotActivitySelection = (id: number) => {
    setSelectedTimeSlotActivityIds(prev =>
      prev.includes(id) ? prev.filter(activityId => activityId !== id) : [...prev, id]
    );
  };

  const handleDeleteSelectedActivities = async (selectionType: 'day' | 'time', ids: number[]) => {
    if (ids.length === 0) return;

    setConfirmDeletingSelectionType(selectionType);
    try {
      const deleteResults = await Promise.all(
        ids.map(async (id) => {
          const url = buildUrl(api.activities.delete.path, { id });
          const response = await fetch(url, { method: api.activities.delete.method });
          return { id, success: response.ok };
        })
      );

      const successCount = deleteResults.filter(result => result.success).length;
      const failedCount = deleteResults.length - successCount;

      queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });

      if (selectedActivity && ids.includes(selectedActivity.id)) {
        setIsActivityModalOpen(false);
        setSelectedActivity(null);
      }

      if (selectionType === 'day') {
        setSelectedDayActivityIds([]);
      } else {
        setSelectedTimeSlotActivityIds([]);
      }

      setDeleteSelectionContext(null);
      setShowDeleteConfirm(false);

      if (failedCount === 0) {
        toast({
          title: "Deleted",
          description: successCount === 1 ? "Activity removed" : "Activities removed",
        });
      } else {
        toast({
          title: "Partially Deleted",
          description: `${successCount} deleted, ${failedCount} failed.`,
        });
      }
    } catch (error) {
      console.error("Failed to delete selected activities:", error);
      toast({
        title: "Error",
        description: "Failed to delete selected activities. Please try again.",
        variant: "destructive",
      });
    } finally {
      setConfirmDeletingSelectionType(null);
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
    if (selectedSubmissionHoliday) {
      toast({
        title: "Submission date is a holiday",
        description: holidaySubmissionToastDescription,
        variant: "destructive"
      });
      return;
    }

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
          submissionDateKey: format(submissionDate, 'yyyy-MM-dd'),
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
      const isHolidaySubmissionError = error?.message === "Submission date is a holiday";
      toast({
        title: isHolidaySubmissionError ? "Submission date is a holiday" : "Submission failed",
        description: isHolidaySubmissionError ? holidaySubmissionToastDescription : (error.message || 'Submission failed. Please try again.'),
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
              Are you sure you want to delete all occurrences of the selected activities? This action cannot be undone.
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
                  setDeleteRecurTypes([]);
                  setDeleteRecurTitles([]);
                  setDeleteRecurYears([]);
                   if (failedCount === 0) {
                      toast({
                        title: "Deleted",
                        description: `All ${deleteResults.length} activities have been deleted`,
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
                if (holidayReturnModal === 'day' && dayActivitiesModalDate) {
                  setShowDayActivitiesModal(true);
                } else if (holidayReturnModal === 'time' && timeSlotActivitiesModalData) {
                  setShowTimeSlotActivitiesModal(true);
                }
                setHolidayReturnModal(null);
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
             <DialogContent
               className="max-w-2xl max-h-[90vh] overflow-visible flex flex-col"
               onCloseAutoFocus={(event) => event.preventDefault()}
             >
              <DialogHeader className="shrink-0 pb-4 border-b">
                <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                  <CalendarDays className="w-5 h-5" />
                  Holiday Management
                </DialogTitle>
                <DialogDescription className="text-sm">
                  Add or update holidays. Activities scheduled on holidays will be automatically moved to the previous working day.
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
                  <div ref={holidayModalFormRef} className="space-y-4">
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
                      <div className="text-sm font-medium">Date</div>
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
                    <div className="flex flex-wrap gap-2">
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
                          className="shrink-0"
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

              {/* Existing Holidays - Right Column */}
              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
                  <span className="w-1 h-4 bg-green-500 rounded-full"></span>
                  EXISTING HOLIDAYS
                </h4>
                {holidays && holidays.length > 0 ? (
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
                                      scrollHolidayModalToForm();
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
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No holidays configured yet
                  </p>
                )}
              </div>
                </div>
              </div>
             </DialogContent>
           </Dialog>
          )}

           {/* Add Activity Button - second on mobile, second on desktop */}
          <Dialog open={isNewActivityOpen} onOpenChange={(open) => {
            setIsNewActivityOpen(open);
            if (!open) {
              // If adding is in progress, reset the mutation to cancel it
              if (createActivity.isPending) {
                createActivity.reset();
                setManuallyClosedWhileAdding(true);
              }
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
              if (newActivityReturnModal === 'day' && dayActivitiesModalDate) {
                setShowDayActivitiesModal(true);
              } else if (newActivityReturnModal === 'time' && timeSlotActivitiesModalData) {
                setShowTimeSlotActivitiesModal(true);
              }
              setNewActivityReturnModal(null);
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
          <DialogContent
            className="max-w-2xl max-h-[90vh] overflow-visible flex flex-col"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
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
                      <div className="text-sm font-medium">Regulatory Agency</div>
                      <Select value={regulatoryAgency} onValueChange={setRegulatoryAgency}>
                        <SelectTrigger id="regulatoryAgency" className="h-10 border border-gray-300 dark:border-gray-600">
                          <SelectValue placeholder="Select agency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DOE">DOE</SelectItem>
                          <SelectItem value="ERC">ERC</SelectItem>
                          <SelectItem value="NEA">NEA</SelectItem>
                          <SelectItem value="NEA-WEB PORTAL">NEA-WEB PORTAL</SelectItem>
                          <SelectItem value="PSALM">PSALM</SelectItem>
                          <SelectItem value="NGCP">NGCP</SelectItem>
                          <SelectItem value="IEMOP">IEMOP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Concern Department</div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            id="concernDepartment"
                            variant="outline"
                            disabled={!regulatoryAgency}
                            className="h-10 w-full justify-between border border-gray-300 dark:border-gray-600 bg-background hover:bg-background text-foreground font-normal disabled:cursor-not-allowed disabled:opacity-100"
                            style={{ borderColor: 'rgb(209 213 219)' }}
                          >
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
                        {regulatoryAgency && (
                        <PopoverContent className="w-[300px] p-2" align="start">
                          <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                              {regulatoryAgency} Departments
                            </div>
                            <div
                              className={cn(
                                "space-y-1 pr-1 overscroll-contain",
                                (AGENCY_DEPARTMENT_OPTIONS[regulatoryAgency]?.length ?? 0) > 8 &&
                                  "max-h-[260px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent",
                              )}
                              onWheelCapture={(event) => {
                                const currentTarget = event.currentTarget;
                                if (currentTarget.scrollHeight <= currentTarget.clientHeight) {
                                  return;
                                }

                                event.preventDefault();
                                currentTarget.scrollTop += event.deltaY;
                              }}
                            >
                              {AGENCY_DEPARTMENT_OPTIONS[regulatoryAgency]?.map((dept) => (
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
                            </div>
                          </div>
                        </PopoverContent>
                        )}
                      </Popover>
                    </div>
                    
                    {/* Recurrence Section */}
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Recurrence</div>
                      <Select value={recurrence} onValueChange={handleRecurrenceChange}>
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
                        <div className="text-sm font-medium">Recurrence End {recurrence === 'yearly' ? 'Year' : 'Date'}</div>
                        {recurrence === 'yearly' ? (
                          // Yearly: only show year picker
                          <Select value={recurrenceEndDate ? recurrenceEndDate.split('-')[0] : ''} onValueChange={(value) => setRecurrenceEndDate(value + '-12-31')}>
                            <SelectTrigger id="recurrenceEnd" className="h-10 border border-gray-300 dark:border-gray-600 text-left">
                              <SelectValue placeholder="Select end year" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 10 }, (_, i) => ((selectedDate || new Date()).getFullYear() + 1) + i).map(year => (
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
          >
            <Trash2 className="w-4 h-4" />
            {`Delete All (${selectedDateActivities.length})`}
          </Button>
        )}

        </div>

        {/* Day Activities Modal */}
        {dayActivitiesModalDate && (() => {
          const dayActs = (activities || []).filter(a =>
            isSameDay(getCalendarDisplayDate(a), dayActivitiesModalDate)
          );
          const sortedDayActs = sortActivitiesByLatestCreated(dayActs);
          const totalPages = Math.ceil(sortedDayActs.length / dayActivitiesPerPage);
          const paginatedActivities = sortedDayActs.slice(
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
                setSelectedDayActivityIds([]);
              }
            }}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-visible flex flex-col">
                <DialogHeader className="shrink-0 pb-2">
                  <div className="flex flex-col gap-3 pr-8">
                    <DialogTitle className="leading-tight">
                      <span className="whitespace-nowrap">
                        Activities for {format(dayActivitiesModalDate, 'MMMM d, yyyy')}
                      </span>
                    </DialogTitle>
                    <div className="flex w-full flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isHolidayOrWeekend}
                        onClick={() => {
                          if (dayActivitiesModalDate && !isDateHoliday(dayActivitiesModalDate)) {
                            setHolidayReturnModal('day');
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
                          setNewActivityReturnModal('day');
                          setSelectedDate(dayActivitiesModalDate);
                          setShowDayActivitiesModal(false);
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
                <div className="h-[300px] overflow-y-auto overflow-x-hidden">
                  <div className="box-border w-full space-y-2 py-4 pl-4 pr-4">
                  {paginatedActivities.length === 0 && !isHolidayOrWeekend ? (
                    <p className="text-center text-muted-foreground py-8">No activities for this day</p>
                  ) : paginatedActivities.length === 0 && isHolidayOrWeekend ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="w-full max-w-md">
                        <div className="p-6 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md text-left">
                          <p className="text-lg text-amber-800 dark:text-amber-200 font-medium mb-2">
                             {isHoliday ? `Holiday: ${holidays?.find(h => isSameDay(new Date(h.date), dayActivitiesModalDate))?.name}` : 'Weekend'}
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
                          "w-full min-w-0 overflow-hidden p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors",
                          getStatusBorderColor(activity.status)
                        )}
                        onClick={() => {
                          setSelectedActivity(activity);
                          // Only reset if clicking a different activity
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
                      >
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {canDeleteActivities && (
                              <Checkbox
                                checked={selectedDayActivityIds.includes(activity.id)}
                                onCheckedChange={() => toggleDayActivitySelection(activity.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0"
                              />
                            )}
                            <span className="block min-w-0 flex-1 truncate font-medium">{activity.title}</span>
                          </div>
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-xs shrink-0",
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
                </div>
                <div className="shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-4 border-t bg-muted/10">
                  <div className="flex items-center gap-2">
                    {dayActs.length > dayActivitiesPerPage && (
                      <>
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
                      </>
                    )}
                  </div>
                  <div className="ml-auto flex items-center gap-4 justify-end self-end sm:self-auto">
                    {canDeleteActivities && (
                      <>
                        <span className={cn(
                          "text-sm text-muted-foreground min-w-[72px] text-right",
                          selectedDayActivityIds.length === 0 && "invisible"
                        )}>
                          {selectedDayActivityIds.length} selected
                        </span>
                        <Button
                          variant="destructive"
                          size="sm"
                          className={cn(selectedDayActivityIds.length === 0 && "invisible pointer-events-none")}
                          onClick={() => {
                            setDeleteSelectionContext({
                              type: 'day',
                              ids: [...selectedDayActivityIds],
                              label: `${selectedDayActivityIds.length} selected ${selectedDayActivityIds.length === 1 ? 'activity' : 'activities'} for ${format(dayActivitiesModalDate, 'MMMM d, yyyy')}`,
                            });
                            setActivityToDelete(null);
                            setShowDeleteConfirm(true);
                          }}
                        >
                          Delete Selected
                        </Button>
                      </>
                    )}
                  </div>
                </div>
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
                        holidays={holidays}
                        holidaysEnabled={holidaysEnabledData}
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
                  disabled={confirmDeletingActivityId === selectedActivity?.id}
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {confirmDeletingActivityId === selectedActivity?.id ? 'Deleting Activity...' : 'Delete Activity'}
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
            setSelectedTimeSlotActivityIds([]);
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-visible flex flex-col">
            <DialogHeader className="shrink-0 pb-2">
              <div className="flex flex-col gap-3 pr-8">
                <DialogTitle className="whitespace-nowrap">
                  Activities at {timeSlotActivitiesModalData?.time}
                </DialogTitle>
                <div className="flex w-full flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={timeSlotActivitiesModalData ? (isDateWeekend(timeSlotActivitiesModalData.date) || (holidaysEnabledData && isDateHoliday(timeSlotActivitiesModalData.date))) : false}
                    onClick={() => {
                      if (timeSlotActivitiesModalData && !isDateHoliday(timeSlotActivitiesModalData.date)) {
                        setHolidayReturnModal('time');
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
                        setNewActivityReturnModal('time');
                        setSelectedDate(timeSlotActivitiesModalData.date);
                        setActivityTime(timeSlotActivitiesModalData.time);
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
            <div className="h-[300px] overflow-y-auto overflow-x-hidden">
              <div className="box-border w-full space-y-2 py-4 pl-4 pr-4">
                {timeSlotActivitiesModalData?.activities.length === 0 && timeSlotActivitiesModalData && !(isDateWeekend(timeSlotActivitiesModalData.date) || (holidaysEnabledData && isDateHoliday(timeSlotActivitiesModalData.date))) ? (
                  <p className="text-center text-muted-foreground py-8">No activities at this time</p>
                ) : timeSlotActivitiesModalData?.activities.length === 0 && timeSlotActivitiesModalData && (isDateWeekend(timeSlotActivitiesModalData.date) || (holidaysEnabledData && isDateHoliday(timeSlotActivitiesModalData.date))) ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-full max-w-md">
                      <div className="p-6 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md text-left">
                        <p className="text-lg text-amber-800 dark:text-amber-200 font-medium mb-2">
                          {isDateHoliday(timeSlotActivitiesModalData.date) ? `Holiday: ${holidays?.find(h => isSameDay(new Date(h.date), timeSlotActivitiesModalData.date))?.name}` : 'Weekend'}
                        </p>
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          Activities cannot be created on {isDateHoliday(timeSlotActivitiesModalData.date) ? 'holidays' : 'weekends'} and will be automatically moved to the next working day.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  (() => {
                    const sortedActivities = sortActivitiesByLatestCreated(timeSlotActivitiesModalData?.activities || []);
                    const totalPages = Math.ceil(sortedActivities.length / timeSlotActivitiesPerPage);
                    const paginatedActivities = sortedActivities.slice(
                      (timeSlotActivitiesPage - 1) * timeSlotActivitiesPerPage,
                      timeSlotActivitiesPage * timeSlotActivitiesPerPage
                    );
                    return (
                      <>
                        {paginatedActivities.map(activity => (
                          <div
                            key={activity.id}
                            className={cn(
                              "w-full min-w-0 overflow-hidden p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors",
                              getStatusBorderColor(activity.status)
                            )}
                            onClick={() => {
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
                          >
                            <div className="flex min-w-0 items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {canDeleteActivities && (
                                  <Checkbox
                                    checked={selectedTimeSlotActivityIds.includes(activity.id)}
                                    onCheckedChange={() => toggleTimeSlotActivitySelection(activity.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="shrink-0"
                                  />
                                )}
                                <span className="block min-w-0 flex-1 truncate font-medium">{activity.title}</span>
                              </div>
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-xs shrink-0",
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
            </div>
            {timeSlotActivitiesModalData && (() => {
              const totalPages = Math.ceil((timeSlotActivitiesModalData?.activities.length || 0) / timeSlotActivitiesPerPage);
              return (
                <div className="shrink-0 flex flex-col sm:flex-row items-start sm:items-center gap-2 p-4 border-t bg-muted/10">
                  <div className="flex items-center gap-2">
                    {(timeSlotActivitiesModalData?.activities.length || 0) > timeSlotActivitiesPerPage && (
                      <>
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
                      </>
                    )}
                  </div>
                  <div className="flex w-full sm:w-auto items-center justify-end gap-4 sm:ml-auto">
                    {canDeleteActivities && (
                      <>
                        <span className={cn(
                          "text-sm text-muted-foreground min-w-[72px] text-right",
                          selectedTimeSlotActivityIds.length === 0 && "invisible"
                        )}>
                          {selectedTimeSlotActivityIds.length} selected
                        </span>
                        <Button
                          variant="destructive"
                          size="sm"
                          className={cn(selectedTimeSlotActivityIds.length === 0 && "invisible pointer-events-none")}
                          onClick={() => {
                            setDeleteSelectionContext({
                              type: 'time',
                              ids: [...selectedTimeSlotActivityIds],
                              label: `${selectedTimeSlotActivityIds.length} selected ${selectedTimeSlotActivityIds.length === 1 ? 'activity' : 'activities'} at ${timeSlotActivitiesModalData?.time || ''}`,
                            });
                            setActivityToDelete(null);
                            setShowDeleteConfirm(true);
                          }}
                        >
                          Delete Selected
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Modal */}
        <Dialog open={showDeleteConfirm} onOpenChange={(open) => {
          setShowDeleteConfirm(open);
          if (!open) {
            setActivityToDelete(null);
            setDeleteSelectionContext(null);
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Activity</DialogTitle>
              <DialogDescription>
                {deleteSelectionContext
                  ? `Are you sure you want to delete ${deleteSelectionContext.label}? This action cannot be undone.`
                  : `Are you sure you want to delete the activity "${activityToDelete?.title}"? This action cannot be undone.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setActivityToDelete(null);
                  setDeleteSelectionContext(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deleteSelectionContext) {
                    handleDeleteSelectedActivities(deleteSelectionContext.type, deleteSelectionContext.ids);
                    return;
                  }

                  if (activityToDelete) {
                    setConfirmDeletingActivityId(activityToDelete.id);
                    deleteActivity.mutate(activityToDelete.id, {
                      onSuccess: () => {
                        if (selectedActivity?.id === activityToDelete.id) {
                          setIsActivityModalOpen(false);
                        }
                        setShowDeleteConfirm(false);
                        setActivityToDelete(null);
                      },
                      onSettled: () => setConfirmDeletingActivityId(null)
                    });
                  }
                }}
                disabled={confirmDeletingActivityId === activityToDelete?.id || confirmDeletingSelectionType !== null}
              >
                {confirmDeletingSelectionType !== null || confirmDeletingActivityId === activityToDelete?.id ? "Deleting..." : "Delete"}
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
                disabled={isDeletingSelectedDate}
              >
                {isDeletingSelectedDate ? "Deleting..." : "Delete All"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/*
        
                Are you sure you want to move "{draggedActivity?.title}" to {rescheduleTargetDate ? format(rescheduleTargetDate, 'MMMM d, yyyy') : ''}{rescheduleTargetTime ? ` at ${rescheduleTargetTime}` : ''}?
                {draggedActivity?.status === 'pending' && rescheduleTargetDate && isTargetDateTimePast(rescheduleTargetDate, rescheduleTargetTime) && (
                  <span className="block mt-2 text-red-600 font-medium">
                    ⚠️ This will automatically change the status to Overdue because the target date/time has already passed.
                  </span>
                )}
        */}
      </div>

      <div className="bg-card rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Calendar Header */}
        <div className="border-b border-gray-200 bg-muted/20 p-4 dark:border-gray-800 md:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-4 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] 2xl:items-center">
              <div className="flex min-w-0 flex-[1_1_30rem] flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex shrink-0 items-center gap-2">
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
                </div>
                <h2 className="min-w-0 basis-0 grow text-left text-lg font-bold font-display text-primary sm:min-w-[10rem] md:text-xl">
                  {view === 'day' ? format(currentDate, 'MMMM d, yyyy') :
                   view === 'week' ? format(currentDate, 'MMMM yyyy') :
                   format(currentDate, 'MMMM yyyy')}
                </h2>
              </div>

              {/* View Toggle Buttons */}
              <div className="flex shrink-0 flex-wrap items-center gap-2 2xl:justify-self-center">
                <div className="flex shrink-0 rounded-lg bg-muted p-1">
                  <Button
                    variant={view === 'day' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => handleViewChange('day')}
                    aria-label="Day view"
                    className={cn("gap-1", view !== 'day' && "text-muted-foreground")}
                  >
                    <CalendarDays className="w-4 h-4" />
                    <span className="hidden sm:inline">Day</span>
                  </Button>
                  <Button
                    variant={view === 'week' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => handleViewChange('week')}
                    aria-label="Week view"
                    className={cn("gap-1", view !== 'week' && "text-muted-foreground")}
                  >
                    <LayoutList className="w-4 h-4" />
                    <span className="hidden sm:inline">Week</span>
                  </Button>
                  <Button
                    variant={view === 'month' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => handleViewChange('month')}
                    aria-label="Month view"
                    className={cn("gap-1", view !== 'month' && "text-muted-foreground")}
                  >
                    <Grid3X3 className="w-4 h-4" />
                    <span className="hidden sm:inline">Month</span>
                  </Button>
                </div>

                {/* Activity Filter */}
                <Select value={activityFilter} onValueChange={setActivityFilter}>
                  <SelectTrigger className="h-9 w-[130px] sm:w-[160px]">
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

              <div className="hidden min-w-0 text-right text-sm text-muted-foreground 2xl:block 2xl:justify-self-end 2xl:whitespace-nowrap">
                {filteredActivities.length} {activityFilter === 'all' ? 'Total' : activityFilter === 'in-progress' ? 'In Progress' : activityFilter.charAt(0).toUpperCase() + activityFilter.slice(1)} {filteredActivities.length === 1 ? 'Activity' : 'Activities'}
              </div>
            </div>

            {/* Activity counts */}
            <div className="w-full text-left text-sm text-muted-foreground 2xl:hidden">
              {filteredActivities.length} {activityFilter === 'all' ? 'Total' : activityFilter === 'in-progress' ? 'In Progress' : activityFilter.charAt(0).toUpperCase() + activityFilter.slice(1)} {filteredActivities.length === 1 ? 'Activity' : 'Activities'}
            </div>
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
        className="grid grid-cols-7 min-h-[600px] auto-rows-fr select-none"
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
            isSameDay(getCalendarDisplayDate(a), date)
          );

          const indicators = getDateIndicators(date);

          const dayCellStripe =
            dayActivities.length > 0
              ? getDayCellStatusStripe(dayActivities)
              : { stripeClass: '', style: undefined };

          const isLastDayOfMonth = isSameDay(date, endOfMonth(date));

          return (
            <div
              key={date.toISOString()}
             className={cn(
                 "h-[132px] overflow-hidden border-b border-r px-2 py-2 transition-colors cursor-pointer hover:bg-primary/10 border-gray-200 dark:border-gray-800 bg-muted/5 dark:bg-muted/10 relative flex flex-col select-none",
                  !isLastDayOfMonth && "last:border-r-0",
                  selectedDate &&
                    isSameDay(date, selectedDate) &&
                    "bg-primary/5",
                  dropTargetDate &&
                    isSameDay(date, dropTargetDate) &&
                    "bg-primary/20 ring-2 ring-primary",
                  indicators.isHoliday && "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                )}
                onMouseDown={handleCalendarCellMouseDown}
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
               {dayActivities.length > 0 && (
                 <div
                   aria-hidden="true"
                   className={cn("pointer-events-none absolute inset-y-0 left-0 w-1", dayCellStripe.stripeClass)}
                   style={dayCellStripe.style}
                 />
               )}
               {selectedDate && isSameDay(date, selectedDate) && (
                 <div
                   aria-hidden="true"
                   className="pointer-events-none absolute inset-0 z-10 border-2 border-primary"
                 />
               )}
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

              {/* Activities */}
              <div className="mt-1 flex-1 overflow-hidden">
                {dayActivities.slice(0, MONTH_VIEW_VISIBLE_ACTIVITIES).map((activity) => (
                  <div
                    key={activity.id}
                    draggable
                    onDragStart={(e) =>
                      handleActivityDragStart(e, activity)
                    }
                    onDragEnd={handleActivityDragEnd}
                    onClick={(e) => {
                      e.stopPropagation();
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
                      "mb-1 h-6 text-xs px-1.5 py-1 rounded-md border truncate font-medium text-left cursor-move hover:opacity-80 transition-opacity",
                      getStatusColor(activity.status),
                      "bg-muted/30 dark:bg-muted/20 border-gray-200 dark:border-gray-700",
                      getStatusBorderColor?.(activity.status),
                      draggedActivity?.id === activity.id &&
                        "opacity-50"
                    )}
                  >
                    {activity.title}
                  </div>
                ))}
                {dayActivities.length > MONTH_VIEW_VISIBLE_ACTIVITIES && (
                  <button
                    type="button"
                    className="block h-5 select-none text-xs text-muted-foreground font-medium hover:text-primary transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDayActivitiesModalDate(date);
                      setDayActivitiesPage(1);
                      setShowDayActivitiesModal(true);
                    }}
                  >
                    +{dayActivities.length - MONTH_VIEW_VISIBLE_ACTIVITIES} more
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Trailing Padding */}
        {trailingPaddingDays.map((_, i) => (
          <div
            key={`trailing-padding-${i}`}
            className="bg-muted/5 dark:bg-muted/10 border-b border-r last:border-r-0 border-gray-200 dark:border-gray-800"
          />
        ))}
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
            onDragEnd={handleActivityDragEnd}
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
            onDragEnd={handleActivityDragEnd}
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
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Upcoming Activities
              </h3>
              <p className="text-sm text-muted-foreground">Next activities and overdue items</p>
            </div>
            <div className="flex-1 min-h-0 p-4">
              <div className="h-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-4 pr-4">
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
                        className={cn(
                          "w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors",
                          getStatusColor(activity.status),
                          "bg-muted/30 dark:bg-muted/20 border-gray-200 dark:border-gray-700",
                          getStatusBorderColor(activity.status)
                        )}
                      >
                        <div className="font-medium text-sm">{activity.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">
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
                          "bg-muted/30 dark:bg-muted/20 border-gray-200 dark:border-gray-700",
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
            </div>
        </div>

      {/* Agency & Department Filter Panel */}
      <div className="bg-card rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-visible flex flex-col h-[600px]">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-muted/20">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Activities by Agency & Department
          </h3>
          <p className="text-sm text-muted-foreground">Filter activities by regulatory agency and concern department</p>
        </div>
        <div className="flex-1 min-h-0 p-4">
          <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          {/* Filter Dropdowns */}
          <div className="flex gap-3 flex-shrink-0 p-4">
            <div className="flex-1">
              <div className="text-sm font-medium mb-1 block">Regulatory Agency</div>
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
                  <SelectItem value="PSALM">PSALM</SelectItem>
                  <SelectItem value="NGCP">NGCP</SelectItem>
                  <SelectItem value="IEMOP">IEMOP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {enableRoleFiltering && user?.role !== 'admin' ? (
              // When role-based filtering is enabled and user is not admin, show auto-filtered department
              <div className="flex-1">
                <div className="text-sm font-medium mb-1 block">Concern Department</div>
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
                <div className="text-sm font-medium mb-1 block">Concern Department</div>
                <Select value={filterDepartment || 'all'} onValueChange={(value) => setFilterDepartment(value === 'all' ? '' : value)} disabled={!filterAgency}>
                  <SelectTrigger id="filterDepartmentEnabled" className="w-full">
                    <SelectValue placeholder={filterAgency ? "All Departments" : "Select Agency First"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="all">All Departments</SelectItem>
                    {filterAgency && (AGENCY_DEPARTMENT_OPTIONS[filterAgency] || []).map((department) => (
                      <SelectItem key={department} value={department}>{department}</SelectItem>
                    ))}
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
                  matchesDept = matchesConcernDepartmentFilter(a.concernDepartment, filterDepartment, filterAgency || undefined);
                } else if (enableRoleFiltering && user?.role && user.role !== 'admin') {
                  const departmentTokens = getConcernDepartmentTokens(a.concernDepartment);
                  if (user.role === 'cps') {
                    matchesDept = departmentTokens.some((token) => token === 'CITET-CPS' || token === 'CITET');
                  } else if (user.role === 'ets') {
                    matchesDept = departmentTokens.some((token) => token === 'CITET-ETS' || token === 'CITET');
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
                          "bg-muted/30 dark:bg-muted/20 border-gray-200 dark:border-gray-700",
                          getStatusBorderColor(activity.status)
                        )}
                      >
                        <div className="font-medium text-sm">{activity.title}</div>
                        <div className="mt-1 flex items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
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
                          <div className="shrink-0 pt-0.5 text-right text-xs text-muted-foreground">
                            Due: {format(new Date(activity.deadlineDate), 'MMM d, yyyy')}
                          </div>
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
        </div>

        {/* Holiday Management & Recurring Activity Deletion Panel */}
        <div className="flex flex-col gap-8 mt-8">
          {/* Holiday Management Panel */}
          {canManageHolidays && (
          <div className="bg-card rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-visible">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <CalendarDays className="w-5 h-5" />
                    Holiday Management
                  </h3>
                  <p className="text-sm text-muted-foreground">Add or update holidays. Activities scheduled on holidays will be automatically moved to the previous working day.</p>
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
            
            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Add New Holiday Form - Left Column */}
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
                    <div className="text-sm font-medium">Date</div>
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
                  <div className="flex flex-wrap gap-2">
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
                        className="shrink-0"
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

              {/* Edit Existing Holiday - Right Column */}
              <div className="border rounded-lg p-4">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
                    <span className="w-1 h-4 bg-green-500 rounded-full"></span>
                    EXISTING HOLIDAYS
                  </h4>
                {holidays && holidays.length > 0 ? (
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
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No holidays configured yet
                  </p>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Manage Recurring Activities Panel */}
          {canDeleteActivities && (
          <div className="bg-card rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-visible">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-muted/20">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <LayoutList className="w-5 h-5" />
                Manage Recurring Activities
              </h3>
              <p className="text-sm text-muted-foreground">Add or delete recurring activities for specific years.</p>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Add Recurring Activities - Left Column */}
              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
                  <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                  Add Recurring Activities
                </h4>
                <div className="space-y-4">
                  {/* Recurrence Type Selector */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Recurrence Type</p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-between text-left font-normal border border-gray-300 dark:border-gray-600 text-muted-foreground"
                        >
                          {addRecurTypes.length === 0
                            ? "Select recurrence types"
                            : `${addRecurTypes.length} selected`}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="start">
                        <div className="p-2">
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {[
                              { value: "monthly", label: "Monthly" },
                              { value: "quarterly", label: "Quarterly" },
                              { value: "semi-annual", label: "Semi-Annual" },
                              { value: "yearly", label: "Yearly" }
                            ].map(type => (
                              <div key={type.value} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                                <Checkbox
                                  id={`add-recurrence-${type.value}`}
                                  checked={addRecurTypes.includes(type.value)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setAddRecurTypes(prev => [...prev, type.value]);
                                    } else {
                                      setAddRecurTypes(prev => prev.filter(t => t !== type.value));
                                    }
                                    setAddRecurTitles([]);
                                    setAddRecurYears([]);
                                    setAddRecurPreview([]);
                                  }}
                                />
                                <Label
                                  htmlFor={`add-recurrence-${type.value}`}
                                  className="text-sm font-normal cursor-pointer flex-1"
                                >
                                  {type.label}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Activity Selector */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Activity</p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-between text-left font-normal border border-gray-300 dark:border-gray-600 text-muted-foreground"
                        >
                          {addRecurTitles.length === 0
                            ? "Select activities"
                            : `${addRecurTitles.length} selected`}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="start">
                        <div className="p-2">
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {(() => {
                              if (addRecurTypes.length === 0 || !activities) return <p className="text-sm text-muted-foreground p-2">Select recurrence type first</p>;
                              // Filter activities by selected recurrence types and extract unique titles
                              const titlesWithRecurrence = activities
                                .filter(a => a.recurrence && addRecurTypes.includes(a.recurrence))
                                .map(a => a.title)
                                .filter((title): title is string => title !== null && title !== undefined)
                                .filter((title, index, arr) => arr.indexOf(title) === index) // Remove duplicates
                                .sort(); // Sort alphabetically

                              if (titlesWithRecurrence.length === 0) {
                                return <p className="text-sm text-muted-foreground p-2">No activities found</p>;
                              }

                              return titlesWithRecurrence.map(title => (
                                <div key={title} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                                  <Checkbox
                                    id={`add-activity-${title}`}
                                    checked={addRecurTitles.includes(title)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setAddRecurTitles(prev => [...prev, title]);
                                      } else {
                                        setAddRecurTitles(prev => prev.filter(t => t !== title));
                                      }
                                      setAddRecurYears([]);
                                      setAddRecurPreview([]);
                                    }}
                                  />
                                  <Label
                                    htmlFor={`add-activity-${title}`}
                                    className="text-sm font-normal cursor-pointer flex-1"
                                  >
                                    {title}
                                  </Label>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Year Selector - Future years only */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Year</p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-between text-left font-normal border border-gray-300 dark:border-gray-600 text-muted-foreground"
                        >
                          {addRecurYears.length === 0
                            ? "Select years"
                            : `${addRecurYears.length} selected`}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="start">
                        <div className="p-2">
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {(() => {
                              if (addRecurTypes.length === 0 && addRecurTitles.length === 0) {
                                return <p className="text-sm text-muted-foreground p-2">Select recurrence type and activity first</p>;
                              }
                              if (addRecurTypes.length === 0) {
                                return <p className="text-sm text-muted-foreground p-2">Select recurrence type first</p>;
                              }
                              if (addRecurTitles.length === 0) {
                                return <p className="text-sm text-muted-foreground p-2">Select activity first</p>;
                              }

                              const selectedTemplateActivities = (activities || []).filter(a =>
                                a.title &&
                                addRecurTitles.includes(a.title) &&
                                a.recurrence &&
                                addRecurTypes.includes(a.recurrence)
                              );
                              const selectedYears = selectedTemplateActivities
                                .map(a => new Date(a.deadlineDate).getFullYear());
                              const baseYear = selectedYears.length > 0
                                ? Math.max(...selectedYears)
                                : new Date().getFullYear();
                              const futureYears = Array.from({ length: 5 }, (_, i) => baseYear + i + 1);

                              if (futureYears.length === 0) {
                                return <p className="text-sm text-muted-foreground p-2">No available years for the selected activities</p>;
                              }

                              return futureYears.map(year => (
                                <div key={year} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                                  <Checkbox
                                    id={`add-year-${year}`}
                                    checked={addRecurYears.includes(String(year))}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setAddRecurYears(prev => [...prev, String(year)]);
                                      } else {
                                        setAddRecurYears(prev => prev.filter(y => y !== String(year)));
                                      }
                                      setAddRecurPreview([]);
                                    }}
                                  />
                                  <Label
                                    htmlFor={`add-year-${year}`}
                                    className="text-sm font-normal cursor-pointer flex-1"
                                  >
                                    {year}
                                  </Label>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Preview Button */}
                  <Button
                    variant="outline"
                    className="gap-2"
                    style={{ borderColor: '#94a3b8' }}
                    disabled={addRecurTypes.length === 0 || addRecurTitles.length === 0 || addRecurYears.length === 0}
                     onClick={() => {
                       if (addRecurTypes.length === 0 || addRecurTitles.length === 0 || addRecurYears.length === 0) return;

                       // Generate preview of activities that would be created
                       const previewActivities: any[] = [];
                       const years = addRecurYears.map(y => parseInt(y));

                       years.forEach(year => {
                         addRecurTitles.forEach(title => {
                           // Find the original activity to get its template
                           const originalActivity = activities?.find(a =>
                             a.title === title &&
                             a.recurrence &&
                             addRecurTypes.includes(a.recurrence)
                           );

                           if (originalActivity) {
                             // Generate activities based on recurrence type
                             const activitiesForYear = generateRecurringActivitiesForYear(originalActivity, year);
                             previewActivities.push(...activitiesForYear);
                           }
                         });
                       });

                       setAddRecurPreview(previewActivities);
                     }}
                  >
                    Preview Activities ({addRecurPreview.length > 0 || (addRecurTypes.length > 0 && addRecurTitles.length > 0 && addRecurYears.length > 0) ? (() => {
                      let count = 0;
                      const years = addRecurYears.map(y => parseInt(y || "0"));
                      years.forEach(year => {
                        addRecurTitles.forEach(title => {
                          const originalActivity = activities?.find(a =>
                            a.title === title &&
                            a.recurrence &&
                            addRecurTypes.includes(a.recurrence)
                          );
                          if (originalActivity) {
                            count += getActivitiesCountForYear(originalActivity, year);
                          }
                        });
                      });
                      return count;
                    })() : 0})
                  </Button>

                  {/* Preview List */}
                  <div className="border rounded-lg p-3 space-y-2 max-h-60 overflow-y-auto">
                    {addRecurPreview.length > 0 ? (
                      <>
                        <h5 className="text-sm font-medium text-muted-foreground">
                          {addRecurPreview.length} {addRecurPreview.length === 1 ? 'activity' : 'activities'} will be created
                        </h5>
                        <div className="space-y-1">
                          {addRecurPreview.map((activity: any, index: number) => (
                            <div key={index} className="flex items-center justify-between p-2 border rounded-md text-sm">
                              <div>
                                <p className="font-medium truncate max-w-[150px]">{activity.title}</p>
                                <p className="text-xs text-muted-foreground">{format(new Date(activity.deadlineDate), 'MMM d, yyyy')}</p>
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                                New
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        {addRecurTypes.length > 0 && addRecurTitles.length > 0 && addRecurYears.length > 0
                          ? "Click 'Preview Activities' to see activities that will be created"
                          : "Select recurrence types, activities, and years to preview"}
                      </p>
                    )}
                  </div>

                  {/* Add Button */}
                  <Button
                    className="gap-2"
                    disabled={addRecurPreview.length === 0 || isAddingRecurring}
                    onClick={async () => {
                      if (addRecurPreview.length === 0) return;

                      setIsAddingRecurring(true);
                      try {
                        const adjustedActivitiesCount = addRecurPreview.filter(activity => {
                          const originalDeadline = new Date(activity.deadlineDate);
                          const adjustedDeadline = adjustToPreviousWorkingDay(originalDeadline);
                          return adjustedDeadline.getTime() !== originalDeadline.getTime();
                        }).length;

                        const activitiesToCreate: InsertActivity[] = addRecurPreview.map((activity) => ({
                          title: activity.title,
                          description: activity.description,
                          startDate: activity.startDate,
                          deadlineDate: adjustToPreviousWorkingDay(new Date(activity.deadlineDate)),
                          status: 'pending',
                          regulatoryAgency: activity.regulatoryAgency || null,
                          concernDepartment: activity.concernDepartment || null,
                          reportDetails: activity.reportDetails || null,
                          remarks: activity.remarks || null,
                          recurrence: activity.recurrence || null,
                          recurrenceEndDate: null,
                        }));

                        await createActivitiesFast(activitiesToCreate);

                        // Clear form
                        setAddRecurTypes([]);
                        setAddRecurTitles([]);
                        setAddRecurYears([]);
                        setAddRecurPreview([]);

                        toast({
                          title: "Success",
                          description: `Created ${addRecurPreview.length} recurring activities`,
                        });

                        if (adjustedActivitiesCount > 0) {
                          toast({
                            title: "Dates adjusted",
                            description: `${adjustedActivitiesCount} recurring ${adjustedActivitiesCount === 1 ? 'activity was' : 'activities were'} moved to the previous working day because they fell on a weekend or holiday.`,
                          });
                        }
                      } catch (error) {
                        console.error('Failed to create recurring activities:', error);
                        toast({
                          title: "Error",
                          description: "Failed to create some activities. Please try again.",
                          variant: "destructive"
                        });
                      } finally {
                        setIsAddingRecurring(false);
                      }
                    }}
                  >
                    {isAddingRecurring ? (
                      <>Creating...</>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Create Activities
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Delete Recurring Activities - Right Column */}
              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
                  <span className="w-1 h-4 bg-red-500 rounded-full"></span>
                  Delete Recurring Activities
                </h4>
                <div className="space-y-4">
                  {/* Recurrence Type Selector */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Recurrence Type</p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-between text-left font-normal border border-gray-300 dark:border-gray-600 text-muted-foreground"
                        >
                          {deleteRecurTypes.length === 0
                            ? "Select recurrence types"
                            : `${deleteRecurTypes.length} selected`}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="start">
                        <div className="p-2">
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {[
                              { value: "monthly", label: "Monthly" },
                              { value: "quarterly", label: "Quarterly" },
                              { value: "semi-annual", label: "Semi-Annual" },
                              { value: "yearly", label: "Yearly" }
                            ].map(type => (
                              <div key={type.value} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                                <Checkbox
                                  id={`recurrence-${type.value}`}
                                  checked={deleteRecurTypes.includes(type.value)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setDeleteRecurTypes(prev => [...prev, type.value]);
                                    } else {
                                      setDeleteRecurTypes(prev => prev.filter(t => t !== type.value));
                                    }
                                    setDeleteRecurTitles([]);
                                    setDeleteRecurYears([]);
                                    setDeleteRecurPreview([]);
                                  }}
                                />
                                <Label
                                  htmlFor={`recurrence-${type.value}`}
                                  className="text-sm font-normal cursor-pointer flex-1"
                                >
                                  {type.label}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Activity Selector */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Activity</p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-between text-left font-normal border border-gray-300 dark:border-gray-600 text-muted-foreground"
                        >
                          {deleteRecurTitles.length === 0
                            ? "Select activities"
                            : `${deleteRecurTitles.length} selected`}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="start">
                        <div className="p-2">
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {(() => {
                              if (deleteRecurTypes.length === 0 || !activities) return <p className="text-sm text-muted-foreground p-2">Select recurrence type first</p>;
                              // Filter activities by selected recurrence types and extract unique titles
                              const titlesWithRecurrence = activities
                                .filter(a => a.recurrence && deleteRecurTypes.includes(a.recurrence))
                                .map(a => a.title)
                                .filter((title): title is string => title !== null && title !== undefined)
                                .filter((title, index, arr) => arr.indexOf(title) === index) // Remove duplicates
                                .sort(); // Sort alphabetically

                              if (titlesWithRecurrence.length === 0) {
                                return <p className="text-sm text-muted-foreground p-2">No activities found</p>;
                              }

                              return titlesWithRecurrence.map(title => (
                                <div key={title} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                                  <Checkbox
                                    id={`activity-${title}`}
                                    checked={deleteRecurTitles.includes(title)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setDeleteRecurTitles(prev => [...prev, title]);
                                      } else {
                                        setDeleteRecurTitles(prev => prev.filter(t => t !== title));
                                      }
                                      setDeleteRecurYears([]);
                                      setDeleteRecurPreview([]);
                                    }}
                                  />
                                  <Label
                                    htmlFor={`activity-${title}`}
                                    className="text-sm font-normal cursor-pointer flex-1"
                                  >
                                    {title}
                                  </Label>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Year Selector */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Year</p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-between text-left font-normal border border-gray-300 dark:border-gray-600 text-muted-foreground"
                        >
                          {deleteRecurYears.length === 0
                            ? "Select years"
                            : `${deleteRecurYears.length} selected`}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="start">
                        <div className="p-2">
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {(() => {
                              if (deleteRecurTypes.length === 0 && deleteRecurTitles.length === 0) {
                                return <p className="text-sm text-muted-foreground p-2">Select recurrence type and activity first</p>;
                              }
                              if (deleteRecurTypes.length === 0) {
                                return <p className="text-sm text-muted-foreground p-2">Select recurrence type first</p>;
                              }
                              if (deleteRecurTitles.length === 0) {
                                return <p className="text-sm text-muted-foreground p-2">Select activity first</p>;
                              }
                              if (!activities) return <p className="text-sm text-muted-foreground p-2">No activities available</p>;

                              // Filter activities by selected recurrence types and titles, then extract unique years
                              const yearsWithActivities = activities
                                .filter(a => a.recurrence && a.title && deleteRecurTypes.includes(a.recurrence) && deleteRecurTitles.includes(a.title))
                                .map(a => new Date(a.deadlineDate).getFullYear())
                                .filter((year, index, arr) => arr.indexOf(year) === index) // Remove duplicates
                                .sort((a, b) => b - a); // Sort in descending order (most recent first)

                              if (yearsWithActivities.length === 0) {
                                return <p className="text-sm text-muted-foreground p-2">No years found</p>;
                              }

                              return yearsWithActivities.map(year => (
                                <div key={year} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                                  <Checkbox
                                    id={`year-${year}`}
                                    checked={deleteRecurYears.includes(String(year))}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setDeleteRecurYears(prev => [...prev, String(year)]);
                                      } else {
                                        setDeleteRecurYears(prev => prev.filter(y => y !== String(year)));
                                      }
                                      setDeleteRecurPreview([]);
                                    }}
                                  />
                                  <Label
                                    htmlFor={`year-${year}`}
                                    className="text-sm font-normal cursor-pointer flex-1"
                                  >
                                    {year}
                                  </Label>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Preview Button */}
                  <Button
                    variant="outline"
                    className="gap-2"
                    style={{ borderColor: '#94a3b8' }}
                    disabled={deleteRecurTypes.length === 0 || deleteRecurTitles.length === 0 || deleteRecurYears.length === 0}
                     onClick={() => {
                       if (deleteRecurTypes.length === 0 || deleteRecurTitles.length === 0 || deleteRecurYears.length === 0) return;
                       const years = deleteRecurYears.map(y => parseInt(y));
                        const matched = (activities || []).filter(a => {
                          if (!a.recurrence || !a.title || !deleteRecurTypes.includes(a.recurrence) || !deleteRecurTitles.includes(a.title)) return false;
                          const actDate = new Date(a.deadlineDate);
                          return years.includes(actDate.getFullYear());
                        });
                       setDeleteRecurPreview(matched);
                     }}
                  >
                    Preview Activities ({deleteRecurPreview.length > 0 || (deleteRecurTypes.length > 0 && deleteRecurTitles.length > 0 && deleteRecurYears.length > 0) ? (() => {
                      const years = deleteRecurYears.map(y => parseInt(y || "0"));
                      return (activities || []).filter(a => a.recurrence && a.title && deleteRecurTypes.includes(a.recurrence) && deleteRecurTitles.includes(a.title) && years.includes(new Date(a.deadlineDate).getFullYear())).length;
                    })() : 0})
                  </Button>

                  {/* Preview List */}
                  <div className="border rounded-lg p-3 space-y-2 max-h-60 overflow-y-auto">
                    {deleteRecurPreview.length > 0 ? (
                      <>
                        <h5 className="text-sm font-medium text-muted-foreground">
                          {deleteRecurPreview.length} {deleteRecurPreview.length === 1 ? 'activity' : 'activities'} found
                        </h5>
                        <div className="space-y-1">
                          {deleteRecurPreview.map((activity: any) => (
                            <div key={activity.id} className="flex items-center justify-between p-2 border rounded-md text-sm">
                              <div>
                                <p className="font-medium truncate max-w-[150px]">{activity.title}</p>
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
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        {deleteRecurTypes.length > 0 && deleteRecurTitles.length > 0 && deleteRecurYears.length > 0
                          ? "Click 'Preview Activities' to see matching activities"
                          : "Select recurrence types, activities, and years to preview"}
                      </p>
                    )}
                  </div>

                  {/* Delete Button */}
                  <Button
                    variant="destructive"
                    className="gap-2"
                    disabled={deleteRecurPreview.length === 0}
                    onClick={() => setShowDeleteRecurConfirm(true)}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete All
                  </Button>
                </div>
              </div>
            </div>
          </div>
          )}
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

  const getTimeSlotStatusStripe = (slotActivities: any[]): { stripeClass: string; style?: React.CSSProperties } => {
    if (!slotActivities || slotActivities.length === 0) return { stripeClass: '', style: undefined };

    const statuses = Array.from(new Set(slotActivities.map(a => a.status)));

    if (statuses.length === 0) return { stripeClass: '', style: undefined };

    const colorMap: Record<string, { className: string; hex: string }> = {
      'completed': { className: 'bg-emerald-500', hex: '#10b981' },
      'overdue': { className: 'bg-red-500', hex: '#ef4444' },
      'late': { className: 'bg-orange-500', hex: '#f97316' },
      'in-progress': { className: 'bg-blue-500', hex: '#3b82f6' },
      'pending': { className: 'bg-amber-500', hex: '#f59e0b' },
    };

    if (statuses.length === 1) {
      const stripe = colorMap[statuses[0]] || colorMap.pending;
      return { stripeClass: stripe.className, style: undefined };
    }

    const colors = statuses.map(status => (colorMap[status] || colorMap.pending).hex);
    const stripeWidth = 100 / colors.length;
    const gradientStops = colors.map((color, i) =>
      `${color} ${i * stripeWidth}% ${(i + 1) * stripeWidth}%`
    ).join(', ');

    return {
      stripeClass: '',
      style: {
        background: `linear-gradient(to bottom, ${gradientStops})`,
      }
    };
  };

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
                  "p-2 text-center border-r last:border-r-0 cursor-pointer hover:bg-muted/50 transition-colors select-none",
                  isToday(day) && "bg-primary/10",
                  isHoliday && "bg-red-50 dark:bg-red-950/20"
                )}
                onMouseDown={(e) => e.preventDefault()}
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
        className="relative cursor-default select-none"
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
                  .filter(a => isSameDay(getCalendarDisplayDate(a), day) && getActivityHour(a) === hour);
                const timeSlotStripe = getTimeSlotStatusStripe(dayHourActivities);
                
                return (
                   <div 
                     key={`${day.toISOString()}-${hour}`}
                     data-date={day.toISOString()}
                     data-time-slot={timeString}
                      className={cn(
                        "relative h-[72px] overflow-hidden border-r last:border-r-0 p-1 cursor-pointer transition-colors select-none hover:bg-primary/10 hover:ring-1 hover:ring-primary/30",
                        isToday(day) && "bg-primary/5",
                        selectedDate && isSameDay(day, selectedDate) && "bg-primary/10",
                        selectedTimeSlot === timeString && selectedDate && isSameDay(day, selectedDate) && "bg-primary/5",
                        // Drag over visual feedback
                        dropTargetDate && isSameDay(day, dropTargetDate) && dropTargetTime === timeString && "bg-primary/20 ring-2 ring-primary ring-inset"
                      )}
                     onMouseDown={handleCalendarCellMouseDown}
                     onClick={() => {
                       onDateSelect(day);
                       // Select time slot (highlight) instead of opening modal
                       onSelectTimeSlot(day, timeString);
                     }}
                     onDragOver={(e) => onTimeSlotDragOver?.(e, day, timeString)}
                     onDragLeave={onTimeSlotDragLeave}
                     onDrop={(e) => onTimeSlotDrop?.(e, day, timeString)}
                    >
                     {dayHourActivities.length > 0 && (
                      <div
                        aria-hidden="true"
                        className={cn("pointer-events-none absolute inset-y-0 left-0 w-1", timeSlotStripe.stripeClass)}
                        style={timeSlotStripe.style}
                      />
                    )}
                    {selectedTimeSlot === timeString && selectedDate && isSameDay(day, selectedDate) && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 z-10 border-2 border-primary"
                      />
                    )}
                    <div className="flex h-full flex-col justify-center gap-1 px-1">
                      {/* Activities for this specific hour */}
                      {dayHourActivities.slice(0, TIME_SLOT_VISIBLE_ACTIVITIES).map(activity => (
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
                            "bg-muted/30 dark:bg-muted/20 border-gray-200 dark:border-gray-700",
                            getStatusBorderColor?.(activity.status),
                            draggedActivity?.id === activity.id && "opacity-50 scale-95",
                            activity.status === 'completed' || activity.status === 'late' ? "opacity-75" : ""
                          )}
                        >
                          {activity.title}
                        </div>
                      ))}
                      {dayHourActivities.length > TIME_SLOT_VISIBLE_ACTIVITIES && (
                        <div 
                          className="select-none text-xs text-muted-foreground font-medium cursor-pointer hover:text-primary px-1 py-0.5"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Open a modal showing all activities for this time slot
                            setShowTimeSlotActivitiesModal?.(true);
                            setTimeSlotActivitiesModalData?.({ date: day, time: timeString, activities: dayHourActivities });
                          }}
                        >
                          +{dayHourActivities.length - TIME_SLOT_VISIBLE_ACTIVITIES} more
                        </div>
                      )}
                    </div>
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
  const dayActivities = activities.filter(a => isSameDay(getCalendarDisplayDate(a), currentDate));

  const getTimeSlotStatusStripe = (slotActivities: any[]): { stripeClass: string; style?: React.CSSProperties } => {
    if (!slotActivities || slotActivities.length === 0) return { stripeClass: '', style: undefined };

    const statuses = Array.from(new Set(slotActivities.map(a => a.status)));

    if (statuses.length === 0) return { stripeClass: '', style: undefined };

    const colorMap: Record<string, { className: string; hex: string }> = {
      'completed': { className: 'bg-emerald-500', hex: '#10b981' },
      'overdue': { className: 'bg-red-500', hex: '#ef4444' },
      'late': { className: 'bg-orange-500', hex: '#f97316' },
      'in-progress': { className: 'bg-blue-500', hex: '#3b82f6' },
      'pending': { className: 'bg-amber-500', hex: '#f59e0b' },
    };

    if (statuses.length === 1) {
      const stripe = colorMap[statuses[0]] || colorMap.pending;
      return { stripeClass: stripe.className, style: undefined };
    }

    const colors = statuses.map(status => (colorMap[status] || colorMap.pending).hex);
    const stripeWidth = 100 / colors.length;
    const gradientStops = colors.map((color, i) =>
      `${color} ${i * stripeWidth}% ${(i + 1) * stripeWidth}%`
    ).join(', ');

    return {
      stripeClass: '',
      style: {
        background: `linear-gradient(to bottom, ${gradientStops})`,
      }
    };
  };

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
        )}>
          <div className="flex items-center justify-between pl-4">
            <div className="flex flex-col items-center">
              <div className={cn(
                "text-xs font-bold uppercase tracking-wider",
                isToday(currentDate) ? "text-primary" : "text-muted-foreground"
              )}>{format(currentDate, 'EEE')}</div>
              <div className="text-4xl font-bold">{format(currentDate, 'd')}</div>
            </div>
            <div className="text-muted-foreground text-sm">{dayActivities.length} {dayActivities.length === 1 ? 'activity' : 'activities'}</div>
          </div>
        </div>
      
      {/* Time slots */}
      <div 
        className="relative cursor-default select-none"
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
          const timeSlotStripe = getTimeSlotStatusStripe(hourActivities);
          
          return (
            <div key={hour} className="grid grid-cols-[80px_1fr] border-b border-gray-100 dark:border-gray-800">
              <div className="p-2 text-xs text-muted-foreground text-right pr-3 border-r">
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </div>
               <div 
                 className={cn(
                    "relative h-[88px] overflow-hidden p-1 transition-colors cursor-pointer select-none hover:bg-primary/10 hover:ring-1 hover:ring-primary/30",
                    selectedTimeSlot === timeString && "bg-primary/5",
                    // Drag over visual feedback
                    dropTargetDate && isSameDay(dropTargetDate, currentDate) && dropTargetTime === timeString && "bg-primary/20 ring-2 ring-primary ring-inset"
                  )}
                  data-date={currentDate.toISOString()}
                  data-time-slot={timeString}
                  onMouseDown={handleCalendarCellMouseDown}
                  onClick={() => onSelectTimeSlot(currentDate, timeString)}
                  onDragOver={(e) => onTimeSlotDragOver?.(e, currentDate, timeString)}
                  onDragLeave={onTimeSlotDragLeave}
                  onDrop={(e) => onTimeSlotDrop?.(e, currentDate, timeString)}
                >
                 {hourActivities.length > 0 && (
                  <div
                    aria-hidden="true"
                    className={cn("pointer-events-none absolute inset-y-0 left-0 w-1", timeSlotStripe.stripeClass)}
                    style={timeSlotStripe.style}
                  />
                )}
                {selectedTimeSlot === timeString && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-10 border-2 border-primary"
                  />
                )}
                <div className="flex h-full flex-col justify-center gap-1 px-1">
                  {/* Activities for this specific hour */}
                  {hourActivities.slice(0, TIME_SLOT_VISIBLE_ACTIVITIES).map(activity => (
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
                        "bg-muted/30 dark:bg-muted/20 border-gray-200 dark:border-gray-700",
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
                  {hourActivities.length > TIME_SLOT_VISIBLE_ACTIVITIES && (
                    <div 
                      className="select-none text-sm text-muted-foreground font-medium cursor-pointer hover:text-primary px-2 py-1"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowTimeSlotActivitiesModal?.(true);
                        setTimeSlotActivitiesModalData?.({ date: currentDate, time: timeString, activities: hourActivities });
                      }}
                    >
                      +{hourActivities.length - TIME_SLOT_VISIBLE_ACTIVITIES} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </ScrollArea>
  );
}
