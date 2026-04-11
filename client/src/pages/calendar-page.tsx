import { useState, useEffect, useCallback, useDeferredValue, useMemo, useRef } from "react";
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
import { useHolidays, usePhilippineHolidays, useCreateHoliday, useUpdateHoliday, useDeleteHoliday } from "@/hooks/use-holidays";
import { useAuth } from "@/hooks/use-auth";
import { useSystemSettings, useSystemSettingsPolling } from "@/hooks/use-settings";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { api, buildUrl } from "@shared/routes";
import { type InsertActivity } from "@shared/schema";
import { useLocation } from "wouter";
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
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// Helper functions defined outside component for accessibility
const HOLIDAYS_ENABLED_STORAGE_KEY = "calendar-holidays-enabled";
const SHOW_PHILIPPINE_HOLIDAYS_STORAGE_KEY = "calendar-show-philippine-holidays";
const PHILIPPINE_HOLIDAY_RESTORE_DATES_STORAGE_KEY = "calendar-philippine-holiday-restore-dates";

const readStoredBoolean = (key: string): boolean | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(key);
  if (storedValue === null) {
    return null;
  }

  return storedValue === "true";
};

const writeStoredBoolean = (key: string, value: boolean) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, value.toString());
};

const getRecurringActivityTitles = (
  activities: Array<{ recurrence?: string | null; title?: string | null }> | undefined,
  recurrenceTypes: string[],
) => {
  if (!activities || recurrenceTypes.length === 0) {
    return [];
  }

  return activities
    .filter((activity) => activity.recurrence && recurrenceTypes.includes(activity.recurrence))
    .map((activity) => activity.title)
    .filter((title): title is string => title !== null && title !== undefined)
    .filter((title, index, arr) => arr.indexOf(title) === index)
    .sort();
};

const formatTimeDisplay = (time: string) => {
  const [rawHours = "23", rawMinutes = "59"] = time.split(":");
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return time;
  }

  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

const parseTimeValue = (time: string) => {
  const [rawHours = "23", rawMinutes = "59"] = time.split(":");
  const hours24 = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (Number.isNaN(hours24) || Number.isNaN(minutes)) {
    return { hour12: "11", minute: "59", period: "PM" as const };
  }

  const period = hours24 >= 12 ? "PM" as const : "AM" as const;
  const hour12 = hours24 % 12 || 12;

  return {
    hour12: String(hour12).padStart(2, "0"),
    minute: String(minutes).padStart(2, "0"),
    period,
  };
};

const buildTimeValue = (hour12: string, minute: string, period: "AM" | "PM") => {
  const parsedHour12 = Number(hour12);
  const parsedMinute = Number(minute);

  if (Number.isNaN(parsedHour12) || Number.isNaN(parsedMinute)) {
    return "23:59";
  }

  const normalizedHour12 = parsedHour12 % 12 || 12;
  const hours24 = period === "PM"
    ? (normalizedHour12 % 12) + 12
    : normalizedHour12 % 12;

  return `${String(hours24).padStart(2, "0")}:${String(parsedMinute).padStart(2, "0")}`;
};

const handlePopoverScrollAreaWheel = (event: React.WheelEvent<HTMLDivElement>) => {
  const viewport = event.currentTarget.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
  if (!viewport || viewport.scrollHeight <= viewport.clientHeight) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  viewport.scrollTop += event.deltaY;
};

type TimePickerPopoverProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

const TimePickerPopover = ({ id, value, onChange, placeholder = "Pick a time" }: TimePickerPopoverProps) => {
  const quickTimes = ["08:00", "12:00", "17:00", "23:59"];
  const { hour12, minute, period } = parseTimeValue(value);
  const hours = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
  const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
  const periods: Array<"AM" | "PM"> = ["AM", "PM"];

  const handleHourChange = (nextHour: string) => {
    onChange(buildTimeValue(nextHour, minute, period));
  };

  const handleMinuteChange = (nextMinute: string) => {
    onChange(buildTimeValue(hour12, nextMinute, period));
  };

  const handlePeriodChange = (nextPeriod: "AM" | "PM") => {
    onChange(buildTimeValue(hour12, minute, nextPeriod));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn(
            "h-10 w-full justify-start text-left font-normal !border-gray-300 dark:!border-gray-600",
            !value && "text-muted-foreground"
          )}
        >
          <Clock className="mr-2 h-4 w-4" />
          {value ? <span>{formatTimeDisplay(value)}</span> : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="space-y-3">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">{value ? formatTimeDisplay(value) : placeholder}</div>
            <div className="text-xs text-muted-foreground">Choose hour, minute, and period</div>
          </div>
          <div className="grid grid-cols-[88px_88px_72px] gap-3 px-4 pt-4">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Hour</div>
              <ScrollArea className="h-56 rounded-md border border-border" onWheelCapture={handlePopoverScrollAreaWheel}>
                <div className="space-y-1 p-2">
                  {hours.map((entry) => (
                    <Button
                      key={entry}
                      type="button"
                      variant={hour12 === entry ? "default" : "ghost"}
                      className="h-9 w-full justify-center"
                      onClick={() => handleHourChange(entry)}
                    >
                      {entry}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Minute</div>
              <ScrollArea className="h-56 rounded-md border border-border" onWheelCapture={handlePopoverScrollAreaWheel}>
                <div className="space-y-1 p-2">
                  {minutes.map((entry) => (
                    <Button
                      key={entry}
                      type="button"
                      variant={minute === entry ? "default" : "ghost"}
                      className="h-9 w-full justify-center"
                      onClick={() => handleMinuteChange(entry)}
                    >
                      {entry}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Period</div>
              <ScrollArea className="h-56 rounded-md border border-border" onWheelCapture={handlePopoverScrollAreaWheel}>
                <div className="space-y-1 p-2">
                  {periods.map((entry) => (
                    <Button
                      key={entry}
                      type="button"
                      variant={period === entry ? "default" : "ghost"}
                      className="h-9 w-full justify-center"
                      onClick={() => handlePeriodChange(entry)}
                    >
                      {entry}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 px-4 pb-4">
            {quickTimes.map((quickTime) => (
              <Button
                key={quickTime}
                type="button"
                variant={value === quickTime ? "default" : "outline"}
                className="h-9"
                onClick={() => onChange(quickTime)}
              >
                {formatTimeDisplay(quickTime)}
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const readStoredPhilippineHolidayRestoreDates = (): Record<string, string> => {
  if (typeof window === "undefined") {
    return {};
  }

  const storedValue = window.localStorage.getItem(PHILIPPINE_HOLIDAY_RESTORE_DATES_STORAGE_KEY);
  if (!storedValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(storedValue);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
};

const writeStoredPhilippineHolidayRestoreDates = (value: Record<string, string>) => {
  if (typeof window === "undefined") {
    return;
  }

  if (Object.keys(value).length === 0) {
    window.localStorage.removeItem(PHILIPPINE_HOLIDAY_RESTORE_DATES_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(PHILIPPINE_HOLIDAY_RESTORE_DATES_STORAGE_KEY, JSON.stringify(value));
};

let holidaysData: any[] = [];
let holidaysEnabledDataData: boolean = readStoredBoolean(HOLIDAYS_ENABLED_STORAGE_KEY) ?? false;
let showPhilippineHolidaysDataData: boolean = readStoredBoolean(SHOW_PHILIPPINE_HOLIDAYS_STORAGE_KEY) ?? false;
let holidayDateKeysData = new Set<string>();
let holidayLabelsByDateKeyData = new Map<string, string>();

const getDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isHolidayAdjustmentEnabled = () => holidaysEnabledDataData;

const hasHolidayDate = (date: Date) => {
  return holidayDateKeysData.has(getDateKey(date));
};

// Helper function to check if a date is a holiday
const isDateHoliday = (date: Date) => {
  if (!isHolidayAdjustmentEnabled()) return false;
  return hasHolidayDate(date);
};

// Helper function to check if a date is a weekend
const isDateWeekend = (date: Date) => {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
};

const parseDateOnlyString = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const getHolidayLabelForDate = (_holidays: any[] | undefined, date: Date) => {
  return holidayLabelsByDateKeyData.get(getDateKey(date)) || "";
};

const getRecurrenceLabel = (recurrence: string | null | undefined) => {
  switch (recurrence) {
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    case "semi-annual":
      return "Semi-Annual";
    case "yearly":
      return "Yearly";
    default:
      return "None";
  }
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

const isExistingRecurringMatch = (existingActivity: any, generatedActivity: any) => (
  existingActivity.title === generatedActivity.title &&
  existingActivity.recurrence === generatedActivity.recurrence &&
  existingActivity.regulatoryAgency === generatedActivity.regulatoryAgency &&
  existingActivity.concernDepartment === generatedActivity.concernDepartment &&
  existingActivity.userId === generatedActivity.userId &&
  isSameDay(new Date(existingActivity.deadlineDate), new Date(generatedActivity.deadlineDate))
);

const filterMissingRecurringActivities = (generatedActivities: any[], allActivities?: any[]) => {
  if (!allActivities || allActivities.length === 0) {
    return generatedActivities;
  }

  return generatedActivities.filter((generatedActivity) =>
    !allActivities.some((existingActivity) => isExistingRecurringMatch(existingActivity, generatedActivity))
  );
};

// Helper function to generate recurring activities for a specific year based on an original activity
const generateRecurringActivitiesForYear = (originalActivity: any, year: number, allActivities?: any[]): any[] => {
  const activities: any[] = [];

  if (!originalActivity.recurrence) return activities;

  // Ensure deadlineDate is a Date object
  const originalDate = new Date(originalActivity.deadlineDate);
  const monthlyPatternWeekday = getMonthlyPatternWeekday(originalActivity, allActivities);

  switch (originalActivity.recurrence) {
    case 'monthly':
      if (monthlyPatternWeekday !== null) {
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
        return filterMissingRecurringActivities(getMonthlyWeekdayOccurrences(
          yearStart,
          originalDate,
          yearEnd,
          monthlyPatternWeekday,
        ).map((occurrence) => ({
          ...originalActivity,
          startDate: occurrence.startDate,
          deadlineDate: adjustToPreviousWorkingDay(occurrence.deadlineDate),
          id: undefined,
        })), allActivities);
      }

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

  return filterMissingRecurringActivities(activities, allActivities);
};

// Helper function to get the count of activities that would be created for a year
const getActivitiesCountForYear = (originalActivity: any, year: number, allActivities?: any[]): number => {
  return generateRecurringActivitiesForYear(originalActivity, year, allActivities).length;
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

const WEEKDAY_OPTIONS = [
  { value: "date", label: "Same date each month" },
  { value: "1", label: "Every Monday" },
  { value: "2", label: "Every Tuesday" },
  { value: "3", label: "Every Wednesday" },
  { value: "4", label: "Every Thursday" },
  { value: "5", label: "Every Friday" },
] as const;

const getMonthlyWeekdayOccurrences = (
  startDate: Date,
  deadlineDate: Date,
  recurrenceEndDate: Date,
  weekdayOption: string,
) => {
  if (weekdayOption === "date") {
    return [];
  }

  const targetWeekday = Number(weekdayOption);
  if (Number.isNaN(targetWeekday)) {
    return [];
  }

  const occurrences: { startDate: Date; deadlineDate: Date }[] = [];
  const startBoundary = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  startBoundary.setHours(0, 0, 0, 0);

  const deadlineHours = deadlineDate.getHours();
  const deadlineMinutes = deadlineDate.getMinutes();
  const deadlineSeconds = deadlineDate.getSeconds();
  const deadlineMilliseconds = deadlineDate.getMilliseconds();

  for (
    let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    cursor <= recurrenceEndDate;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const occurrenceStart = new Date(year, month, day);
      if (occurrenceStart.getDay() !== targetWeekday) {
        continue;
      }

      if (occurrenceStart < startBoundary) {
        continue;
      }

      const occurrenceDeadline = new Date(occurrenceStart);
      occurrenceDeadline.setHours(deadlineHours, deadlineMinutes, deadlineSeconds, deadlineMilliseconds);
      occurrences.push({
        startDate: occurrenceStart,
        deadlineDate: occurrenceDeadline,
      });
    }
  }

  return occurrences;
};

const getMonthlyPatternWeekday = (
  originalActivity: any,
  allActivities?: any[],
): string | null => {
  if (
    originalActivity?.recurrence === "monthly" &&
    originalActivity?.monthlyPattern &&
    originalActivity.monthlyPattern !== "date"
  ) {
    return originalActivity.monthlyPattern;
  }

  if (!allActivities || originalActivity?.recurrence !== "monthly") {
    return null;
  }

  const originalDeadlineDate = new Date(originalActivity.deadlineDate);
  const sourceYear = originalDeadlineDate.getFullYear();

  const seriesActivities = allActivities.filter((activity) =>
    activity.title === originalActivity.title &&
    activity.recurrence === originalActivity.recurrence &&
    activity.regulatoryAgency === originalActivity.regulatoryAgency &&
    activity.concernDepartment === originalActivity.concernDepartment &&
    activity.userId === originalActivity.userId &&
    new Date(activity.deadlineDate).getFullYear() === sourceYear
  );

  const uniqueWeekdays = Array.from(
    new Set(seriesActivities.map((activity) => new Date(activity.startDate).getDay()))
  );

  if (seriesActivities.length > 12 && uniqueWeekdays.length === 1 && uniqueWeekdays[0] >= 1 && uniqueWeekdays[0] <= 5) {
    return String(uniqueWeekdays[0]);
  }

  return null;
};

const getCreatedActivitiesCount = (
  startDate: Date,
  deadlineDate: Date,
  recurrence: string,
  recurrenceEndDate?: Date | null,
  monthlyWeekdayOption: string = "date",
): number => {
  if (!recurrence || recurrence === 'none' || !recurrenceEndDate) {
    return 1;
  }

  if (recurrence === "monthly" && monthlyWeekdayOption !== "date") {
    return getMonthlyWeekdayOccurrences(startDate, deadlineDate, recurrenceEndDate, monthlyWeekdayOption).length;
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
  if (filterValue === "ZOD") return tokens.some((token) => token === "ZOD" || token.startsWith("ZOD") || token.startsWith("ZONE"));

  return tokens.some((token) => token === filterValue);
};

const sortDepartmentOptions = (departments: string[]) => [...departments].sort((a, b) => a.localeCompare(b));

const AGENCY_DEPARTMENT_OPTIONS: Record<string, string[]> = {
  DOE: sortDepartmentOptions(["CITET", "CITET-CPS", "CITET-ETS"]),
  ERC: sortDepartmentOptions(["CITET", "CITET-ETS", "FSD", "FSD-BUDGET OFFICER", "FSD-CACD", "FSD-GAD", "ISD", "ISD-CWDC", "ISD-MSD", "TSD", "TSD-DAMD", "TSD-DNOD"]),
  NEA: sortDepartmentOptions(["CITET", "CITET-CPS", "CITET-ETS", "FSD", "FSD-CACD", "FSD-CASHIER", "FSD-GAD", "FSD-ACCOUNTING CLERK", "ISD", "ISD-HRADD", "ISD-MSD", "ISD-CWDC", "TSD", "TSD-DAMD", "TSD-DNOD", "ZOD", "ZOD-DCSO", "ZONE-ZOS"]),
  "NEA-WEB PORTAL": sortDepartmentOptions(["CITET", "CITET-ETS", "FSD", "FSD-GAD", "ISD", "ISD-HRADD", "ISD-MSD", "OGM", "TSD", "TSD-DAMD", "TSD-DNOD", "ZOD", "ZOD-DCSO", "ZONE-ZOS"]),
  PSALM: sortDepartmentOptions(["FSD", "FSD-GAD"]),
  NGCP: sortDepartmentOptions(["TSD", "TSD-DAMD", "TSD-DNOD"]),
  IEMOP: sortDepartmentOptions(["FSD", "FSD-CASHIER", "FSD-ACCOUNTING CLERK"]),
};

const MONTH_VIEW_VISIBLE_ACTIVITIES = 2;
const DAY_VIEW_VISIBLE_ACTIVITIES = 10;
const WEEK_VIEW_VISIBLE_ACTIVITIES = 2;
const MONTH_VIEW_GRID_MIN_HEIGHT = 600;
const MONTH_VIEW_DAY_CELL_HEIGHT = 132;
const MONTH_VIEW_WEEK_HEADER_HEIGHT = 48;
const WEEK_VIEW_TIME_SLOT_HEIGHT = 72;
const MONTH_DRAG_AUTO_SCROLL_THRESHOLD = 108;
const MONTH_DRAG_AUTO_SCROLL_MIN_SPEED = 64;
const MONTH_DRAG_AUTO_SCROLL_MAX_SPEED = 360;
const MONTH_DRAG_AUTO_SCROLL_START_STRENGTH_FACTOR = 0.32;
const MONTH_DRAG_AUTO_SCROLL_BLEND_BASE = 0.52;
const MONTH_DRAG_AUTO_SCROLL_REVERSE_THRESHOLD = 0.14;

const clampAutoScrollValue = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getAutoScrollStrength = (distanceIntoThreshold: number, threshold: number) => {
  const normalizedDistance = clampAutoScrollValue(distanceIntoThreshold / threshold, 0, 1);
  return normalizedDistance * normalizedDistance;
};

const getAutoScrollVelocity = (strength: number, useSmoothMonthSpeed: boolean) => {
  if (strength <= 0) return 0;

  const minSpeed = useSmoothMonthSpeed ? MONTH_DRAG_AUTO_SCROLL_MIN_SPEED : 240;
  const maxSpeed = useSmoothMonthSpeed ? MONTH_DRAG_AUTO_SCROLL_MAX_SPEED : 1200;

  return minSpeed + (maxSpeed - minSpeed) * strength;
};

const smoothAutoScrollStrength = (
  currentStrength: number,
  nextStrength: number,
  useSmoothMonthSpeed: boolean,
  deltaMs: number,
) => {
  if (!useSmoothMonthSpeed) return nextStrength;

  const blend = 1 - Math.pow(MONTH_DRAG_AUTO_SCROLL_BLEND_BASE, deltaMs / 16);
  return currentStrength + (nextStrength - currentStrength) * blend;
};

const getCalendarDisplayDate = (activity: any): Date => {
  return getEffectiveActivityDate(activity);
};

const getActivityTimeSlotValue = (activity: any): string => {
  const deadlineDate = new Date(activity.deadlineDate);
  return `${String(deadlineDate.getHours()).padStart(2, "0")}:00`;
};

const getEffectiveActivityDateWithOptions = (
  activity: any,
  holidaysEnabled: boolean,
  holidayDateKeys: Set<string>,
): Date => {
  const deadlineDate = new Date(activity.deadlineDate);
  const getLocalDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const isHoliday = (date: Date) => holidaysEnabled && holidayDateKeys.has(getLocalDateKey(date));
  const shouldAdjust = isDateWeekend(deadlineDate) || isHoliday(deadlineDate);

  if (!shouldAdjust) {
    return deadlineDate;
  }

  const adjustedDate = new Date(deadlineDate);
  let isAdjusted = true;

  while (isAdjusted) {
    isAdjusted = false;
    const dayOfWeek = adjustedDate.getDay();

    if (dayOfWeek === 6) {
      adjustedDate.setDate(adjustedDate.getDate() - 1);
      isAdjusted = true;
    } else if (dayOfWeek === 0) {
      adjustedDate.setDate(adjustedDate.getDate() - 2);
      isAdjusted = true;
    } else if (isHoliday(adjustedDate)) {
      adjustedDate.setDate(adjustedDate.getDate() - 1);
      isAdjusted = true;
    }
  }

  return adjustedDate;
};

// Helper function to get the effective display date for an activity (adjusted for holidays/weekends)
const getEffectiveActivityDate = (activity: any): Date => {
  return getEffectiveActivityDateWithOptions(activity, isHolidayAdjustmentEnabled(), holidayDateKeysData);
};

const getActivityPreviewStatusColor = (status: string | null) => {
  switch(status) {
    case 'completed': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'overdue': return 'bg-red-100 text-red-800 border-red-200';
    case 'late': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'in-progress': return 'bg-blue-100 text-blue-800 border-blue-200';
    default: return 'bg-amber-100 text-amber-800 border-amber-200';
  }
};

const getActivityPreviewBorderColor = (status: string | null) => {
  switch(status) {
    case 'completed': return 'border-l-4 border-emerald-500';
    case 'overdue': return 'border-l-4 border-red-500';
    case 'late': return 'border-l-4 border-orange-500';
    case 'in-progress': return 'border-l-4 border-blue-500';
    default: return 'border-l-4 border-amber-500';
  }
};

function ActivityDragPreviewCard({
  activity,
  variant,
}: {
  activity: any;
  variant: 'month' | 'week' | 'day';
}) {
  if (!activity) return null;

  const baseClasses =
    variant === 'month'
      ? "mb-1 h-6 px-1.5 py-1 text-xs truncate rounded-md"
      : variant === 'week'
        ? "w-full p-1 text-xs truncate rounded"
        : "w-full mb-1 p-2 text-sm rounded-md";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none border font-medium text-left opacity-50 cursor-move select-none",
        baseClasses,
        getActivityPreviewStatusColor(activity.status),
        "bg-muted/30 dark:bg-muted/20 border-gray-200",
        getActivityPreviewBorderColor(activity.status),
      )}
    >
      <div className={cn("truncate", variant === 'day' && "font-semibold")}>{activity.title}</div>
    </div>
  );
}

function TimeSlotActivityStack({
  activities,
  draggedActivity,
  getStatusColor,
  getStatusBorderColor,
  onActivityMouseDown,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  onActivityClick,
  onOverflowClick,
}: {
  activities: any[];
  draggedActivity?: any;
  getStatusColor: (status: string | null) => string;
  getStatusBorderColor?: (status: string | null) => string;
  onActivityMouseDown?: (activity: any, e: React.MouseEvent<HTMLElement>) => void;
  onTouchDragStart?: (activity: any, e: React.TouchEvent) => void;
  onTouchDragMove?: (e: React.TouchEvent) => void;
  onTouchDragEnd?: (e: React.TouchEvent) => void;
  onActivityClick: (activity: any) => void;
  onOverflowClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const visibleActivities = activities.slice(0, 6);
  const hiddenCount = Math.max(0, activities.length - visibleActivities.length);
  const overlapOffset = activities.length > 4 ? 10 : 14;
  const reservedRightSpace = hiddenCount > 0 ? 28 : 0;

  return (
    <>
      <div className="hidden h-7 sm:block">
        <div className="relative h-full">
          {visibleActivities.map((activity, index) => {
            const leftOffset = index * overlapOffset;
            const rightInset = Math.max(reservedRightSpace, 0);

            return (
              <div
                key={activity.id}
                data-activity-drag-handle="true"
                onMouseDown={(e) => onActivityMouseDown?.(activity, e)}
                onTouchStart={(e) => onTouchDragStart?.(activity, e)}
                onTouchMove={onTouchDragMove}
                onTouchEnd={(e) => onTouchDragEnd?.(e)}
                onClick={(e) => {
                  e.stopPropagation();
                  onActivityClick(activity);
                }}
                className={cn(
                  "absolute bottom-0 top-0 truncate rounded-md border px-1.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 select-none cursor-pointer",
                  getStatusColor(activity.status),
                  "bg-muted/30 dark:bg-muted/20 border-gray-200",
                  getStatusBorderColor?.(activity.status),
                  draggedActivity?.id === activity.id && "opacity-50 cursor-move",
                  activity.status === 'completed' || activity.status === 'late' ? "opacity-75" : ""
                )}
                style={{
                  left: `${leftOffset}px`,
                  right: `${rightInset}px`,
                  zIndex: index + 1,
                }}
                title={activity.title}
              >
                {activity.title}
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <button
              type="button"
              className="absolute bottom-0 right-0 top-0 hidden rounded-md border border-dashed border-gray-300 bg-background/90 px-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-primary sm:block"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onOverflowClick}
            >
              +{hiddenCount}
            </button>
          )}
        </div>
      </div>
      {activities.length > 0 && (
        <button
          type="button"
          className="my-auto self-center select-none text-[10px] font-semibold text-muted-foreground transition-colors hover:text-primary sm:hidden"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onOverflowClick}
        >
          {activities.length}
        </button>
      )}
    </>
  );
}

function DayTimeSlotActivityColumns({
  activities,
  draggedActivity,
  getStatusColor,
  getStatusBorderColor,
  onActivityMouseDown,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  onActivityClick,
  onOverflowClick,
  preview = false,
  previewGridColumnCount,
  previewColumnIndex,
}: {
  activities: any[];
  draggedActivity?: any;
  getStatusColor: (status: string | null) => string;
  getStatusBorderColor?: (status: string | null) => string;
  onActivityMouseDown?: (activity: any, e: React.MouseEvent<HTMLElement>) => void;
  onTouchDragStart?: (activity: any, e: React.TouchEvent) => void;
  onTouchDragMove?: (e: React.TouchEvent) => void;
  onTouchDragEnd?: (e: React.TouchEvent) => void;
  onActivityClick: (activity: any) => void;
  onOverflowClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  preview?: boolean;
  previewGridColumnCount?: number;
  previewColumnIndex?: number;
}) {
  if (activities.length === 0) {
    return null;
  }

  const visibleActivities = preview ? activities : activities.slice(0, DAY_VIEW_VISIBLE_ACTIVITIES);
  const hiddenCount = preview ? 0 : Math.max(0, activities.length - visibleActivities.length);
  const desktopColumnCount = previewGridColumnCount ?? (visibleActivities.length + (hiddenCount > 0 ? 1 : 0));
  const hasPreviewColumnPlacement =
    preview &&
    typeof previewColumnIndex === "number" &&
    previewColumnIndex >= 0 &&
    previewColumnIndex < desktopColumnCount;

  return (
    <>
      <div
        className="hidden h-full gap-0.5 sm:grid"
        style={{ gridTemplateColumns: `repeat(${desktopColumnCount}, minmax(0, 1fr))` }}
      >
        {hasPreviewColumnPlacement && previewColumnIndex! > 0 &&
          Array.from({ length: previewColumnIndex! }, (_, index) => (
            <div key={`preview-spacer-start-${index}`} aria-hidden="true" />
          ))}
        {visibleActivities.map((activity) => (
          <div
            key={activity.id}
            data-activity-drag-handle="true"
            onMouseDown={preview ? undefined : (e) => onActivityMouseDown?.(activity, e)}
            onTouchStart={preview ? undefined : (e) => onTouchDragStart?.(activity, e)}
            onTouchMove={preview ? undefined : onTouchDragMove}
            onTouchEnd={preview ? undefined : (e) => onTouchDragEnd?.(e)}
            onClick={preview ? undefined : (e) => {
              e.stopPropagation();
              onActivityClick(activity);
            }}
            className={cn(
              "flex h-full min-w-0 select-none flex-col justify-start rounded-md border px-2 py-1.5 text-left transition-opacity",
              preview ? "pointer-events-none opacity-90" : "cursor-pointer hover:opacity-80",
              getStatusColor(activity.status),
              "bg-muted/30 dark:bg-muted/20 border-gray-200",
              getStatusBorderColor?.(activity.status),
              !preview && draggedActivity?.id === activity.id && "opacity-50 cursor-move",
              activity.status === 'completed' || activity.status === 'late' ? "opacity-75" : ""
            )}
            title={activity.title}
          >
            <div className="truncate text-sm font-semibold">{activity.title}</div>
          </div>
        ))}
        {hasPreviewColumnPlacement &&
          Array.from({ length: Math.max(desktopColumnCount - (previewColumnIndex! + visibleActivities.length), 0) }, (_, index) => (
            <div key={`preview-spacer-end-${index}`} aria-hidden="true" />
          ))}
        {!preview && hiddenCount > 0 && (
          <button
            type="button"
            className="flex h-full min-w-0 items-center justify-center rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary dark:border-gray-700"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onOverflowClick?.(e);
            }}
          >
            <span className="xl:hidden">{hiddenCount}</span>
            <span className="hidden xl:inline">{hiddenCount} more</span>
          </button>
        )}
      </div>
      {!preview && (
        <button
          type="button"
          className="my-auto self-center select-none text-[10px] font-semibold text-muted-foreground transition-colors hover:text-primary sm:hidden"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onOverflowClick?.(e);
          }}
        >
          {hiddenCount > 0 ? `${hiddenCount} more` : activities.length}
        </button>
      )}
    </>
  );
}

function WeekTimeSlotActivityColumns({
  activities,
  draggedActivity,
  getStatusColor,
  getStatusBorderColor,
  onActivityMouseDown,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  onActivityClick,
  onOverflowClick,
  preview = false,
  previewGridColumnCount,
  previewColumnIndex,
  previewCompactGridColumnCount,
  previewCompactColumnIndex,
}: {
  activities: any[];
  draggedActivity?: any;
  getStatusColor: (status: string | null) => string;
  getStatusBorderColor?: (status: string | null) => string;
  onActivityMouseDown?: (activity: any, e: React.MouseEvent<HTMLElement>) => void;
  onTouchDragStart?: (activity: any, e: React.TouchEvent) => void;
  onTouchDragMove?: (e: React.TouchEvent) => void;
  onTouchDragEnd?: (e: React.TouchEvent) => void;
  onActivityClick: (activity: any) => void;
  onOverflowClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  preview?: boolean;
  previewGridColumnCount?: number;
  previewColumnIndex?: number;
  previewCompactGridColumnCount?: number;
  previewCompactColumnIndex?: number;
}) {
  if (activities.length === 0) {
    return null;
  }

  const desktopVisibleActivities = preview ? activities : activities.slice(0, WEEK_VIEW_VISIBLE_ACTIVITIES);
  const compactVisibleActivities = preview ? activities : activities.slice(0, 1);
  const hiddenCount = preview ? 0 : Math.max(0, activities.length - desktopVisibleActivities.length);
  const compactHiddenCount = preview ? 0 : Math.max(0, activities.length - compactVisibleActivities.length);
  const desktopColumnCount = previewGridColumnCount ?? (desktopVisibleActivities.length + (hiddenCount > 0 ? 1 : 0));
  const hasPreviewColumnPlacement =
    preview &&
    typeof previewColumnIndex === "number" &&
    previewColumnIndex >= 0 &&
    previewColumnIndex < desktopColumnCount;
  const compactColumnCount = previewCompactGridColumnCount ?? (compactVisibleActivities.length + (compactHiddenCount > 0 ? 1 : 0));
  const hasCompactPreviewColumnPlacement =
    preview &&
    typeof previewCompactColumnIndex === "number" &&
    previewCompactColumnIndex >= 0 &&
    previewCompactColumnIndex < compactColumnCount;

  return (
    <>
      <div
        className="hidden h-full gap-0.5 lg:grid"
        style={{ gridTemplateColumns: `repeat(${desktopColumnCount}, minmax(0, 1fr))` }}
      >
        {hasPreviewColumnPlacement && previewColumnIndex! > 0 &&
          Array.from({ length: previewColumnIndex! }, (_, index) => (
            <div key={`week-preview-spacer-start-${index}`} aria-hidden="true" />
          ))}
        {desktopVisibleActivities.map((activity) => (
          <div
            key={activity.id}
            data-activity-drag-handle="true"
            onMouseDown={preview ? undefined : (e) => onActivityMouseDown?.(activity, e)}
            onTouchStart={preview ? undefined : (e) => onTouchDragStart?.(activity, e)}
            onTouchMove={preview ? undefined : onTouchDragMove}
            onTouchEnd={preview ? undefined : (e) => onTouchDragEnd?.(e)}
            onClick={preview ? undefined : (e) => {
              e.stopPropagation();
              onActivityClick(activity);
            }}
            className={cn(
              "flex h-full min-w-0 select-none flex-col justify-start rounded border px-1.5 py-1 text-left text-xs font-medium transition-opacity",
              preview ? "pointer-events-none opacity-90" : "cursor-pointer hover:opacity-80",
              getStatusColor(activity.status),
              "bg-muted/30 dark:bg-muted/20 border-gray-200",
              getStatusBorderColor?.(activity.status),
              !preview && draggedActivity?.id === activity.id && "opacity-50 cursor-move",
              activity.status === 'completed' || activity.status === 'late' ? "opacity-75" : ""
            )}
            title={activity.title}
          >
            <div className="truncate">{activity.title}</div>
          </div>
        ))}
        {hasPreviewColumnPlacement &&
          Array.from({ length: Math.max(desktopColumnCount - (previewColumnIndex! + desktopVisibleActivities.length), 0) }, (_, index) => (
            <div key={`week-preview-spacer-end-${index}`} aria-hidden="true" />
          ))}
        {!preview && hiddenCount > 0 && (
          <button
            type="button"
            className="flex h-full min-w-0 items-center justify-center rounded border border-dashed border-gray-300 px-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary dark:border-gray-700"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onOverflowClick?.(e);
            }}
          >
            <span className="lg:hidden">{hiddenCount}</span>
            <span className="hidden lg:inline">{hiddenCount} more</span>
          </button>
        )}
      </div>
      <div
        className={cn("hidden h-full gap-0.5 sm:grid lg:hidden", preview && "pointer-events-none")}
        style={{ gridTemplateColumns: `repeat(${compactColumnCount}, minmax(0, 1fr))` }}
      >
        {hasCompactPreviewColumnPlacement && previewCompactColumnIndex! > 0 &&
          Array.from({ length: previewCompactColumnIndex! }, (_, index) => (
            <div key={`week-compact-preview-spacer-start-${index}`} aria-hidden="true" />
          ))}
        {compactVisibleActivities.map((activity) => (
          <div
            key={`compact-${activity.id}`}
            data-activity-drag-handle="true"
            onMouseDown={preview ? undefined : (e) => onActivityMouseDown?.(activity, e)}
            onTouchStart={preview ? undefined : (e) => onTouchDragStart?.(activity, e)}
            onTouchMove={preview ? undefined : onTouchDragMove}
            onTouchEnd={preview ? undefined : (e) => onTouchDragEnd?.(e)}
            onClick={preview ? undefined : (e) => {
              e.stopPropagation();
              onActivityClick(activity);
            }}
            className={cn(
              "flex h-full min-w-0 select-none flex-col justify-start rounded border px-1.5 py-1 text-left text-xs font-medium transition-opacity",
              preview ? "pointer-events-none opacity-90" : "cursor-pointer hover:opacity-80",
              getStatusColor(activity.status),
              "bg-muted/30 dark:bg-muted/20 border-gray-200",
              getStatusBorderColor?.(activity.status),
              !preview && draggedActivity?.id === activity.id && "opacity-50 cursor-move",
              activity.status === 'completed' || activity.status === 'late' ? "opacity-75" : ""
            )}
            title={activity.title}
          >
            <div className="truncate">{activity.title}</div>
          </div>
        ))}
        {hasCompactPreviewColumnPlacement &&
          Array.from({ length: Math.max(compactColumnCount - (previewCompactColumnIndex! + compactVisibleActivities.length), 0) }, (_, index) => (
            <div key={`week-compact-preview-spacer-end-${index}`} aria-hidden="true" />
          ))}
        {!preview && compactHiddenCount > 0 && (
          <button
            type="button"
            className="flex h-full min-w-0 items-center justify-center rounded border border-dashed border-gray-300 px-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary dark:border-gray-700"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onOverflowClick?.(e);
            }}
          >
            {compactHiddenCount}
          </button>
        )}
      </div>
      {!preview && activities.length > 0 && (
        <button
          type="button"
          className="my-auto self-center select-none text-[10px] font-semibold text-muted-foreground transition-colors hover:text-primary sm:hidden"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onOverflowClick?.(e);
          }}
        >
          {hiddenCount > 0 ? hiddenCount : activities.length}
        </button>
      )}
    </>
  );
}

type CalendarDropTarget = {
  date: Date;
  time: string | null;
};

type MouseActivityDragState = {
  activity: any;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  hasStarted: boolean;
};

const areSameCalendarDropTarget = (a: CalendarDropTarget | null, b: CalendarDropTarget | null) => {
  if (!a && !b) return true;
  if (!a || !b) return false;

  return a.time === b.time && isSameDay(a.date, b.date);
};

const getCalendarDropTargetFromElement = (element: Element | null): CalendarDropTarget | null => {
  if (!(element instanceof HTMLElement)) return null;

  const dropTargetElement = element.closest('[data-drop-target]');
  if (!(dropTargetElement instanceof HTMLElement)) return null;

  const targetDateStr = dropTargetElement.getAttribute('data-date');
  if (!targetDateStr) return null;

  const targetDate = new Date(targetDateStr);
  if (Number.isNaN(targetDate.getTime())) return null;

  return {
    date: targetDate,
    time: dropTargetElement.getAttribute('data-time-slot'),
  };
};

const getDistanceToRect = (clientX: number, clientY: number, rect: DOMRect) => {
  const nearestX = Math.max(rect.left, Math.min(clientX, rect.right));
  const nearestY = Math.max(rect.top, Math.min(clientY, rect.bottom));

  return Math.hypot(clientX - nearestX, clientY - nearestY);
};

const findClosestCalendarDropTarget = (clientX: number, clientY: number): CalendarDropTarget | null => {
  if (typeof document === "undefined") return null;

  const dropTargetElements = Array.from(document.querySelectorAll<HTMLElement>('[data-drop-target]'));

  let closestTarget: CalendarDropTarget | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  dropTargetElements.forEach((dropTargetElement) => {
    const rect = dropTargetElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dropTarget = getCalendarDropTargetFromElement(dropTargetElement);
    if (!dropTarget) return;

    const distance = getDistanceToRect(clientX, clientY, rect);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestTarget = dropTarget;
    }
  });

  return closestTarget;
};

const shouldSuppressCalendarDropTargetAtPoint = (clientX: number, clientY: number) => {
  if (typeof document === "undefined") return false;

  const elementAtPoint = document.elementFromPoint(clientX, clientY);
  return elementAtPoint instanceof HTMLElement && Boolean(
    elementAtPoint.closest('[data-drop-target-suppress="true"]')
  );
};

const shouldPreserveCalendarMouseDown = (target: EventTarget | null): boolean => {
  return target instanceof HTMLElement && Boolean(
    target.closest('[data-activity-drag-handle="true"], [draggable="true"], button, a, input, textarea, select, [role="button"]')
  );
};

type PhilippinesHolidaySectionProps = {
  checkboxId: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  isLoading?: boolean;
  error?: unknown;
};

function PhilippinesHolidaySection({
  checkboxId,
  checked,
  onCheckedChange,
  isLoading,
  error,
}: PhilippinesHolidaySectionProps) {
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-gray-300 bg-muted/20 p-3 dark:border-gray-700">
      <div className="flex items-start gap-3">
        <Checkbox
          id={checkboxId}
          checked={checked}
          onCheckedChange={(checked) => onCheckedChange(checked === true)}
          className="mt-0.5"
        />
        <div className="space-y-1">
          <Label htmlFor={checkboxId} className="text-sm font-medium">
            Holidays in Philippines
          </Label>
          <p className="text-xs text-muted-foreground">
            Show holidays from the public Philippines Google Calendar feed directly on the calendar.
          </p>
        </div>
      </div>

      {checked && (
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Philippines holidays...
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load Philippines holidays."}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Philippines holidays are now visible on the calendar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

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
  const prefersReducedMotion = useReducedMotion();

  // Holidays enabled state - local first, with light refresh for cross-user sync
  const [holidaysEnabledData, setHolidaysEnabled] = useState<boolean>(
    () => readStoredBoolean(HOLIDAYS_ENABLED_STORAGE_KEY) ?? false,
  );
  const { toast } = useToast();
  const holidaysEnabledSavePendingRef = useRef(false);
  const showPhilippineHolidaysSavePendingRef = useRef(false);

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
      writeStoredBoolean(HOLIDAYS_ENABLED_STORAGE_KEY, value);
      return { previous };
    },
    onError: (err, _value, context) => {
      if (context?.previous !== undefined) {
        setHolidaysEnabled(context.previous);
        holidaysEnabledDataData = context.previous;
        writeStoredBoolean(HOLIDAYS_ENABLED_STORAGE_KEY, context.previous);
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
      writeStoredBoolean(HOLIDAYS_ENABLED_STORAGE_KEY, value);
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path] });
      toast({
        title: "Setting saved",
        description: value
          ? "Holidays are enabled on the calendar."
          : "Holidays are disabled on the calendar.",
      });
    },
  });

  useEffect(() => {
    const fetchHolidaysEnabled = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      if (holidaysEnabledSavePendingRef.current) return;
      try {
        const res = await fetch('/api/settings/holidays_enabled', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const newValue = data.value !== 'false';
          setHolidaysEnabled(prev => {
            if (prev !== newValue) {
              holidaysEnabledDataData = newValue;
              writeStoredBoolean(HOLIDAYS_ENABLED_STORAGE_KEY, newValue);
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
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchHolidaysEnabled();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", fetchHolidaysEnabled);

    const interval = setInterval(fetchHolidaysEnabled, 30000);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", fetchHolidaysEnabled);
    };
  }, []);

  // Skip aggressive settings polling on the calendar page to keep interactions smooth.
  useSystemSettingsPolling({ enabled: false });
  const canManageHolidays = user?.role === "admin" || allowNonAdminHolidayAdd;
  const isMobile = useIsMobile();
  const { data: activities } = useActivities({
    staleTime: 60 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: true,
  });
  const createActivity = useCreateActivity();
  const deleteActivity = useDeleteActivity();
  const startActivity = useStartActivity();
  const updateActivity = useUpdateActivity();
  const { data: holidays } = useHolidays({
    staleTime: 5 * 60 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: true,
  });
  const [showPhilippineHolidays, setShowPhilippineHolidays] = useState(() => {
    return readStoredBoolean(SHOW_PHILIPPINE_HOLIDAYS_STORAGE_KEY) === true;
  });
  const updateShowPhilippineHolidays = useMutation({
    retry: false,
    mutationFn: async (value: boolean) => {
      const res = await fetch(api.settings.set.path, {
        method: api.settings.set.method,
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ key: 'show_philippine_holidays', value: value.toString() }),
      });
      if (!res.ok) {
        const error = await res.json();
        return Promise.reject(new Error(error.message || "Failed to update setting"));
      }
      return res.json();
    },
    onMutate: (value: boolean) => {
      showPhilippineHolidaysSavePendingRef.current = true;
      const previous = showPhilippineHolidaysDataData;
      setShowPhilippineHolidays(value);
      showPhilippineHolidaysDataData = value;
      writeStoredBoolean(SHOW_PHILIPPINE_HOLIDAYS_STORAGE_KEY, value);
      return { previous };
    },
    onError: (err, _value, context) => {
      if (context?.previous !== undefined) {
        setShowPhilippineHolidays(context.previous);
        showPhilippineHolidaysDataData = context.previous;
        writeStoredBoolean(SHOW_PHILIPPINE_HOLIDAYS_STORAGE_KEY, context.previous);
      }
      pendingPhilippineHolidayAdjustmentRef.current = false;
      pendingPhilippineHolidayRestoreRef.current = false;
      toast({
        title: "Could not save setting",
        description: err instanceof Error ? err.message : "Failed to update Philippines holidays",
        variant: "destructive",
      });
    },
    onSettled: () => {
      showPhilippineHolidaysSavePendingRef.current = false;
    },
    onSuccess: (_, value) => {
      setShowPhilippineHolidays(value);
      showPhilippineHolidaysDataData = value;
      writeStoredBoolean(SHOW_PHILIPPINE_HOLIDAYS_STORAGE_KEY, value);
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path] });
      toast({
        title: "Setting saved",
        description: value
          ? "Philippines holidays are enabled on the calendar."
          : "Philippines holidays are disabled on the calendar.",
      });
    },
  });
  const {
    data: philippineHolidays,
    isLoading: isLoadingPhilippineHolidays,
    error: philippineHolidaysError,
  } = usePhilippineHolidays(holidaysEnabledData && showPhilippineHolidays);
  const createHoliday = useCreateHoliday();
  const updateHoliday = useUpdateHoliday();
  const deleteHoliday = useDeleteHoliday();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const calendarHolidays = useMemo(() => [
    ...(holidays || []),
    ...((holidaysEnabledData && showPhilippineHolidays ? philippineHolidays : []) || []).map((holiday, index) => ({
        id: `philippines-${holiday.date}-${index}`,
        name: holiday.name,
        date: parseDateOnlyString(holiday.date),
      })),
  ], [holidays, holidaysEnabledData, philippineHolidays, showPhilippineHolidays]);
  const showHolidayIndicators = holidaysEnabledData;
  const calendarHolidayDateKeys = useMemo(() => {
    const dateKeys = new Set<string>();

    calendarHolidays.forEach((holiday) => {
      dateKeys.add(getDateKey(new Date(holiday.date)));
    });

    return dateKeys;
  }, [calendarHolidays]);
  const getCurrentCalendarDisplayDate = useCallback((activity: any) => (
    getEffectiveActivityDateWithOptions(activity, showHolidayIndicators, calendarHolidayDateKeys)
  ), [showHolidayIndicators, calendarHolidayDateKeys]);
  const pendingPhilippineHolidayAdjustmentRef = useRef(false);
  const pendingPhilippineHolidayRestoreRef = useRef(false);
  const isApplyingPhilippineHolidayAdjustmentRef = useRef(false);
  const philippineHolidayRestoreDatesRef = useRef<Record<string, string>>(readStoredPhilippineHolidayRestoreDates());

  useEffect(() => {
    writeStoredBoolean(SHOW_PHILIPPINE_HOLIDAYS_STORAGE_KEY, showPhilippineHolidays);
    showPhilippineHolidaysDataData = showPhilippineHolidays;
  }, [showPhilippineHolidays]);

  useEffect(() => {
    const fetchShowPhilippineHolidays = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      if (showPhilippineHolidaysSavePendingRef.current) return;
      try {
        const res = await fetch('/api/settings/show_philippine_holidays', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const newValue = data.value === 'true';
          setShowPhilippineHolidays(prev => {
            if (prev !== newValue) {
              showPhilippineHolidaysDataData = newValue;
              writeStoredBoolean(SHOW_PHILIPPINE_HOLIDAYS_STORAGE_KEY, newValue);
              return newValue;
            }
            return prev;
          });
        }
      } catch (_error) {
        // Ignore errors
      }
    };

    fetchShowPhilippineHolidays();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchShowPhilippineHolidays();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", fetchShowPhilippineHolidays);

    const interval = setInterval(fetchShowPhilippineHolidays, 30000);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", fetchShowPhilippineHolidays);
    };
  }, []);

  const handleShowPhilippineHolidaysChange = useCallback((checked: boolean) => {
    if (checked && !showPhilippineHolidays) {
      pendingPhilippineHolidayAdjustmentRef.current = true;
      pendingPhilippineHolidayRestoreRef.current = false;
    } else if (!checked && showPhilippineHolidays) {
      pendingPhilippineHolidayAdjustmentRef.current = false;
      pendingPhilippineHolidayRestoreRef.current = true;
    }

    updateShowPhilippineHolidays.mutate(checked);
  }, [showPhilippineHolidays, updateShowPhilippineHolidays]);

  // Calendar view state
  type CalendarView = 'day' | 'week' | 'month';
  const [view, setView] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarTransitionKey, setCalendarTransitionKey] = useState(0);
  const [calendarTransitionDirection, setCalendarTransitionDirection] = useState<1 | -1>(1);
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
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
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

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchSetting();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", fetchSetting);

    const interval = setInterval(fetchSetting, 30000);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", fetchSetting);
    };
  }, []);

  // Update global holidays data when holidays change
  const [holidaysKey, setHolidaysKey] = useState(0);
  useEffect(() => {
    holidaysData = calendarHolidays;
    holidayDateKeysData = new Set();
    holidayLabelsByDateKeyData = new Map();

    calendarHolidays.forEach((holiday) => {
      const holidayDate = new Date(holiday.date);
      const dateKey = getDateKey(holidayDate);
      const holidayName = typeof holiday.name === "string" ? holiday.name.trim() : "";

      holidayDateKeysData.add(dateKey);

      if (!holidayName) {
        return;
      }

      const existingLabel = holidayLabelsByDateKeyData.get(dateKey);
      if (!existingLabel) {
        holidayLabelsByDateKeyData.set(dateKey, holidayName);
        return;
      }

      const existingNames = new Set(existingLabel.split(", ").filter(Boolean));
      if (!existingNames.has(holidayName)) {
        holidayLabelsByDateKeyData.set(dateKey, `${existingLabel}, ${holidayName}`);
      }
    });

    holidaysEnabledDataData = holidaysEnabledData;
    showPhilippineHolidaysDataData = showPhilippineHolidays;
    setHolidaysKey(k => k + 1); // Force re-render when holidays update
  }, [holidays, philippineHolidays, showPhilippineHolidays, holidaysEnabledData]);

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
    frameId: number | null;
    lastTimestamp: number | null;
    strength: number;
    targetStrength: number;
    pendingDirection: 'left' | 'right' | 'up' | 'down' | null;
    pendingTargetStrength: number;
    targetType: 'window' | 'viewport' | null;
    targetElement: HTMLElement | null;
    pendingTargetType: 'window' | 'viewport' | null;
    pendingTargetElement: HTMLElement | null;
  }>({
    direction: null,
    frameId: null,
    lastTimestamp: null,
    strength: 0,
    targetStrength: 0,
    pendingDirection: null,
    pendingTargetStrength: 0,
    targetType: null,
    targetElement: null,
    pendingTargetType: null,
    pendingTargetElement: null,
  });
  const transparentDragImageRef = useRef<HTMLCanvasElement | null>(null);
  const dragCursorStyleRef = useRef<HTMLStyleElement | null>(null);
  const mouseDragRef = useRef<MouseActivityDragState | null>(null);
  const activeDropTargetRef = useRef<CalendarDropTarget | null>(null);
  const suppressNextActivityClickRef = useRef<number | null>(null);
  const [isMouseDragArmed, setIsMouseDragArmed] = useState(false);
  const weekScrollAreaRef = useRef<HTMLDivElement>(null);
  const dayScrollAreaRef = useRef<HTMLDivElement>(null);
  const monthCalendarContainerRef = useRef<HTMLDivElement>(null);
  const activitySearchRef = useRef<HTMLDivElement>(null);
  const ignoreActivitySearchOutsideClickUntilRef = useRef(0);
  
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
  const filteredActivities = useMemo(() => (activities?.filter(a => {
    if (activityFilter === 'all') return true;
    if (activityFilter === 'pending') return a.status === 'pending';
    if (activityFilter === 'in-progress') return a.status === 'in-progress';
    if (activityFilter === 'completed') return a.status === 'completed' || a.status === 'late';
    if (activityFilter === 'overdue') return a.status === 'overdue';
    return true;
  }) || []), [activities, activityFilter]);

  // Calculate activities in current month
  const activitiesInCurrentMonth = useMemo(() => filteredActivities.filter(a =>
    isSameMonth(getCurrentCalendarDisplayDate(a), currentDate)
  ), [filteredActivities, currentDate, getCurrentCalendarDisplayDate]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activitySearchQuery, setActivitySearchQuery] = useState("");
  const [isActivitySearchOpen, setIsActivitySearchOpen] = useState(false);
  const [shouldRestoreActivitySearch, setShouldRestoreActivitySearch] = useState(false);
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
  const [isCreatingActivity, setIsCreatingActivity] = useState(false);
  
  // Day Activities Modal State
  const [showDayActivitiesModal, setShowDayActivitiesModal] = useState(false);
  const [dayActivitiesModalDate, setDayActivitiesModalDate] = useState<Date | null>(null);
  const [dayActivitiesPage, setDayActivitiesPage] = useState(1);
  const [selectedDayActivityIds, setSelectedDayActivityIds] = useState<number[]>([]);
  const [newActivityReturnModal, setNewActivityReturnModal] = useState<null | 'day' | 'time'>(null);
  const [holidayReturnModal, setHolidayReturnModal] = useState<null | 'day' | 'time'>(null);
  const [isEditActivityOpen, setIsEditActivityOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);
  const [isUpdatingActivity, setIsUpdatingActivity] = useState(false);
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
  const [monthlyWeekdayOption, setMonthlyWeekdayOption] = useState<string>("date");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>("");
  const [submissionDate, setSubmissionDate] = useState<Date>(new Date());
  const deferredActivitySearchQuery = useDeferredValue(activitySearchQuery);
  const trimmedActivitySearchQuery = deferredActivitySearchQuery.trim().toLowerCase();
  const searchedActivities = useMemo(() => trimmedActivitySearchQuery.length === 0
    ? []
    : (activities || [])
        .filter((activity) => {
          const searchFields = [
            activity.title,
            activity.description,
            activity.regulatoryAgency,
            activity.concernDepartment,
            activity.reportDetails,
          ]
            .filter((value): value is string => Boolean(value))
            .join(" ")
            .toLowerCase();

          return searchFields.includes(trimmedActivitySearchQuery);
        })
        .sort((left, right) => {
          const leftDate = getCurrentCalendarDisplayDate(left).getTime();
          const rightDate = getCurrentCalendarDisplayDate(right).getTime();
          return leftDate - rightDate;
        }), [activities, trimmedActivitySearchQuery, getCurrentCalendarDisplayDate]);
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
  const totalHolidayPages = Math.max(1, Math.ceil((holidays?.length || 0) / holidaysPerPage));
  const paginatedHolidays = useMemo(() => (holidays || []).slice(
    (holidayPage - 1) * holidaysPerPage,
    holidayPage * holidaysPerPage
  ), [holidays, holidayPage]);
  const showHolidayPagination = (holidays?.length || 0) > holidaysPerPage;
  const holidayModalFormRef = useRef<HTMLDivElement | null>(null);

  const resetHolidayForm = () => {
    setHolidayName("");
    setHolidayDate(undefined);
    setEditingHoliday(null);
  };

  // Check if holiday fields have changed from original values
  const hasHolidayChanges = editingHoliday && (
    holidayName !== editingHoliday.name || 
    (holidayDate && editingHoliday.date && !isSameDay(new Date(holidayDate), new Date(editingHoliday.date)))
  );

  const selectedSubmissionHoliday = showHolidayIndicators
    ? calendarHolidays?.find((holiday: any) => isSameDay(new Date(holiday.date), submissionDate))
    : undefined;
  const holidaySubmissionToastDescription = "The selected submission date matches a holiday.";
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
  const addRecurringActivityTitles = useMemo(
    () => getRecurringActivityTitles(activities, addRecurTypes),
    [activities, addRecurTypes],
  );
  const deleteRecurringActivityTitles = useMemo(
    () => getRecurringActivityTitles(activities, deleteRecurTypes),
    [activities, deleteRecurTypes],
  );

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
    return isDateHoliday(date) || isDateWeekend(date);
  };

  const dateIndicatorsByDateKey = useMemo(() => {
    const indicators = new Map<string, {
      hasOverdue: boolean;
      hasDueSoon: boolean;
      hasActivities: boolean;
      activityCount: number;
      isHoliday: boolean;
      isWeekend: boolean;
      isHolidayOrWeekend: boolean;
    }>();

    filteredActivities.forEach((activity) => {
      const activityDate = getCurrentCalendarDisplayDate(activity);
      const dateKey = getDateKey(activityDate);
      const existing = indicators.get(dateKey);

      if (existing) {
        existing.activityCount += 1;
        existing.hasActivities = true;
        existing.hasOverdue = existing.hasOverdue || activity.status === 'overdue';
        existing.hasDueSoon = existing.hasDueSoon || isDueSoon(activity.deadlineDate);
        return;
      }

      const isWeekend = isDateWeekend(activityDate);
      const isHoliday = showHolidayIndicators && calendarHolidayDateKeys.has(dateKey);
      indicators.set(dateKey, {
        hasOverdue: activity.status === 'overdue',
        hasDueSoon: isDueSoon(activity.deadlineDate),
        hasActivities: true,
        activityCount: 1,
        isHoliday,
        isWeekend,
        isHolidayOrWeekend: isHoliday || isWeekend,
      });
    });

    return indicators;
  }, [filteredActivities, showHolidayIndicators, getCurrentCalendarDisplayDate, calendarHolidayDateKeys]);

  const filteredActivitiesByDateKey = useMemo(() => {
    const activitiesByDate = new Map<string, any[]>();

    filteredActivities.forEach((activity) => {
      const dateKey = getDateKey(getCurrentCalendarDisplayDate(activity));
      const existing = activitiesByDate.get(dateKey);
      if (existing) {
        existing.push(activity);
      } else {
        activitiesByDate.set(dateKey, [activity]);
      }
    });

    return activitiesByDate;
  }, [filteredActivities, getCurrentCalendarDisplayDate]);

  const allActivitiesByDateKey = useMemo(() => {
    const activitiesByDate = new Map<string, any[]>();

    (activities || []).forEach((activity) => {
      const dateKey = getDateKey(getCurrentCalendarDisplayDate(activity));
      const existing = activitiesByDate.get(dateKey);
      if (existing) {
        existing.push(activity);
      } else {
        activitiesByDate.set(dateKey, [activity]);
      }
    });

    return activitiesByDate;
  }, [activities, getCurrentCalendarDisplayDate]);
  
  // Clear concern department when regulatory agency changes
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const now = Date.now();

      if (isActivityModalOpen) {
        return;
      }

      if (now < ignoreActivitySearchOutsideClickUntilRef.current) {
        return;
      }

      if (target?.closest("[data-dialog-overlay='true'], [data-dialog-content='true']")) {
        return;
      }

      if (activitySearchRef.current && !activitySearchRef.current.contains(event.target as Node)) {
        setIsActivitySearchOpen(false);
        setShouldRestoreActivitySearch(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isActivityModalOpen]);

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
    setHolidayPage((currentPage) => Math.min(currentPage, totalHolidayPages));
  }, [totalHolidayPages]);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const handleRecurrenceChange = (value: string) => {
    setRecurrence(value);
    setRecurrenceEndDate("");
    setMonthlyWeekdayOption("date");
  };
  
  const [reportDetails, setReportDetails] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSelectedDate, setEditSelectedDate] = useState<Date | null>(null);
  const [editActivityTime, setEditActivityTime] = useState<string>("23:59");
  const [editRegulatoryAgency, setEditRegulatoryAgency] = useState("");
  const [editConcernDepartment, setEditConcernDepartment] = useState<string[]>([]);
  const [editReportDetails, setEditReportDetails] = useState("");
  const hasEditActivityChanges = useMemo(() => {
    if (!editingActivity || !editSelectedDate) {
      return false;
    }

    const originalDeadline = new Date(editingActivity.deadlineDate);
    const originalConcernDepartment = editingActivity.concernDepartment
      ? editingActivity.concernDepartment.split(",").map((department: string) => department.trim()).filter(Boolean)
      : [];

    return (
      editTitle !== (editingActivity.title || "") ||
      editDescription !== (editingActivity.description || "") ||
      !isSameDay(editSelectedDate, originalDeadline) ||
      editActivityTime !== format(originalDeadline, 'HH:mm') ||
      editRegulatoryAgency !== (editingActivity.regulatoryAgency || "") ||
      editConcernDepartment.join(", ") !== originalConcernDepartment.join(", ") ||
      editReportDetails !== (editingActivity.reportDetails || "")
    );
  }, [
    editActivityTime,
    editConcernDepartment,
    editDescription,
    editRegulatoryAgency,
    editReportDetails,
    editSelectedDate,
    editTitle,
    editingActivity,
  ]);
  const [submissionRemarks, setSubmissionRemarks] = useState("");

  const resetEditActivityForm = () => {
    setEditingActivity(null);
    setEditTitle("");
    setEditDescription("");
    setEditSelectedDate(null);
    setEditActivityTime("23:59");
    setEditRegulatoryAgency("");
    setEditConcernDepartment([]);
    setEditReportDetails("");
  };

  const openEditActivityModal = (activity: any) => {
    if (activity.status === 'completed' || activity.status === 'late') {
      return;
    }

    const activityDeadline = new Date(activity.deadlineDate);

    setEditingActivity(activity);
    setEditTitle(activity.title || "");
    setEditDescription(activity.description || "");
    setEditSelectedDate(activityDeadline);
    setEditActivityTime(format(activityDeadline, 'HH:mm'));
    setEditRegulatoryAgency(activity.regulatoryAgency || "");
    setEditConcernDepartment(
      activity.concernDepartment
        ? activity.concernDepartment.split(",").map((department: string) => department.trim()).filter(Boolean)
        : []
    );
    setEditReportDetails(activity.reportDetails || "");
    setIsEditActivityOpen(true);
  };

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

  const fetchActivitySubmissions = useCallback(async (activityId: number) => {
    try {
      const response = await fetch(`/api/activities/${activityId}/submissions`);
      const data = await response.json();
      setActivitySubmissions(data);
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
    } finally {
      setIsLoadingSubmissions(false);
    }
  }, []);

  const openActivityModal = useCallback((activity: any, options?: { focusDate?: Date; restoreSearch?: boolean }) => {
    if (options?.focusDate) {
      setCurrentDate(options.focusDate);
    }

    if (options?.restoreSearch) {
      setShouldRestoreActivitySearch(true);
    }

    setSelectedActivity(activity);
    setStartingActivityId((current) => current === activity.id ? current : null);
    setIsActivityModalOpen(true);
    setActivitySubmissions([]);
    setIsLoadingSubmissions(true);
    void fetchActivitySubmissions(activity.id);
  }, [fetchActivitySubmissions]);

  // Handle activityId from URL query parameter (when clicking from notification)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const activityId = params.get('activityId');
    
    if (activityId && activities) {
      const activity = activities.find(a => a.id === parseInt(activityId));
      if (activity) {
        openActivityModal(activity, { focusDate: getCurrentCalendarDisplayDate(activity) });
        // Navigate to the month of the activity's deadline
        // Auto-switch to month view when navigating from notification
        setView('month');
        // Clear the URL parameter without adding to browser history
        setLocation('/calendar', { replace: true });
      }
    }
  }, [activities, openActivityModal, setLocation]);

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

  // Helper to get date indicators
  const getDateIndicators = useCallback((date: Date) => {
    const dateKey = getDateKey(date);
    const existing = dateIndicatorsByDateKey.get(dateKey);
    if (existing) {
      return existing;
    }

    const isWeekend = isDateWeekend(date);
    const isHoliday = showHolidayIndicators && hasHolidayDate(date);
    return {
      hasOverdue: false,
      hasDueSoon: false,
      hasActivities: false,
      activityCount: 0,
      isHoliday,
      isWeekend,
      isHolidayOrWeekend: isHoliday || isWeekend,
    };
  }, [dateIndicatorsByDateKey, showHolidayIndicators]);

  // Stop auto-scroll on drag end
  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current.frameId !== null) {
      cancelAnimationFrame(autoScrollRef.current.frameId);
      autoScrollRef.current.frameId = null;
    }
    autoScrollRef.current.direction = null;
    autoScrollRef.current.lastTimestamp = null;
    autoScrollRef.current.strength = 0;
    autoScrollRef.current.targetStrength = 0;
    autoScrollRef.current.pendingDirection = null;
    autoScrollRef.current.pendingTargetStrength = 0;
    autoScrollRef.current.targetType = null;
    autoScrollRef.current.targetElement = null;
    autoScrollRef.current.pendingTargetType = null;
    autoScrollRef.current.pendingTargetElement = null;
    setAutoScrollEnabled(false);
  }, []);

  const getCalendarNavigationDate = useCallback((date: Date, direction: 1 | -1, targetView: CalendarView) => {
    if (targetView === 'day') {
      return addDays(date, direction);
    }

    if (targetView === 'week') {
      return addWeeks(date, direction);
    }

    return addMonths(date, direction);
  }, []);

  const getCalendarPeriodStart = useCallback((date: Date, targetView: CalendarView) => {
    if (targetView === 'day') {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    if (targetView === 'week') {
      return startOfWeek(date);
    }

    return startOfMonth(date);
  }, []);

  const getCalendarTransitionDirectionForDate = useCallback((targetDate: Date, targetView: CalendarView): 1 | -1 | 0 => {
    const currentPeriodStart = getCalendarPeriodStart(currentDate, targetView).getTime();
    const targetPeriodStart = getCalendarPeriodStart(targetDate, targetView).getTime();

    if (targetPeriodStart === currentPeriodStart) {
      return 0;
    }

    return targetPeriodStart > currentPeriodStart ? 1 : -1;
  }, [currentDate, getCalendarPeriodStart]);

  const animateCalendarToDate = useCallback((targetDate: Date, targetView: CalendarView = view) => {
    const direction = getCalendarTransitionDirectionForDate(targetDate, targetView);
    if (direction !== 0) {
      setCalendarTransitionDirection(direction);
      setCalendarTransitionKey((current) => current + 1);
    }

    setCurrentDate(targetDate);
  }, [getCalendarTransitionDirectionForDate, view]);

  // Handle go to today
  const handleGoToToday = useCallback(() => {
    const today = new Date();

    if (view === 'day' && isSameDay(currentDate, today)) {
      const dayViewport = dayScrollAreaRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]') ?? null;
      if (dayViewport) {
        dayViewport.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    animateCalendarToDate(today, view);
  }, [animateCalendarToDate, currentDate, view]);

  const handleCalendarNavigation = useCallback((direction: 1 | -1) => {
    setCalendarTransitionDirection(direction);
    setCalendarTransitionKey((current) => current + 1);
    setCurrentDate((date) => getCalendarNavigationDate(date, direction, view));
  }, [getCalendarNavigationDate, view]);

  const calendarNavigationVariants = {
    enter: ({ direction, reduceMotion }: { direction: 1 | -1; reduceMotion: boolean }) =>
      reduceMotion
        ? { opacity: 0.98 }
        : { opacity: 0, x: direction > 0 ? 36 : -36 },
    center: ({ reduceMotion }: { direction: 1 | -1; reduceMotion: boolean }) =>
      reduceMotion
        ? {
            opacity: 1,
            x: 0,
            transition: { duration: 0.08, ease: "easeOut" },
          }
        : {
            opacity: 1,
            x: 0,
            transition: {
              x: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.12, ease: "easeOut" },
            },
          },
    exit: ({ direction, reduceMotion }: { direction: 1 | -1; reduceMotion: boolean }) =>
      reduceMotion
        ? {
            opacity: 0.98,
            transition: { duration: 0.08, ease: "easeOut" },
          }
        : {
            opacity: 0,
            x: direction > 0 ? -28 : 28,
            transition: {
              x: { duration: 0.14, ease: [0.4, 0, 1, 1] },
              opacity: { duration: 0.1, ease: "easeOut" },
            },
          },
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
    const dragSource = e.currentTarget as HTMLElement | null;

    if (dragSource && typeof document !== "undefined") {
      const dragPreview = dragSource.cloneNode(true) as HTMLElement;
      const dragRect = dragSource.getBoundingClientRect();
      const previewScale = 0.94;
      const previewWidth = Math.max(1, Math.round(dragRect.width * previewScale));
      const previewHeight = Math.max(1, Math.round(dragRect.height * previewScale));

      dragPreview.style.position = "fixed";
      dragPreview.style.top = "-1000px";
      dragPreview.style.left = "-1000px";
      dragPreview.style.width = `${previewWidth}px`;
      dragPreview.style.height = `${previewHeight}px`;
      dragPreview.style.minWidth = `${previewWidth}px`;
      dragPreview.style.maxWidth = `${previewWidth}px`;
      dragPreview.style.minHeight = `${previewHeight}px`;
      dragPreview.style.maxHeight = `${previewHeight}px`;
      dragPreview.style.pointerEvents = "none";
      dragPreview.style.opacity = "0.92";
      dragPreview.style.transform = "none";
      dragPreview.style.boxSizing = "border-box";
      dragPreview.style.margin = "0";
      dragPreview.style.flex = "none";
      dragPreview.style.display = window.getComputedStyle(dragSource).display;
      dragPreview.style.overflow = "hidden";
      document.body.appendChild(dragPreview);

      e.dataTransfer.setDragImage(
        dragPreview,
        Math.min(Math.max(12, previewWidth / 2), previewWidth - 1),
        Math.min(Math.max(12, previewHeight / 2), previewHeight - 1),
      );
      window.setTimeout(() => dragPreview.remove(), 0);
    } else {
      const transparentDragImage = getTransparentDragImage();
      if (transparentDragImage) {
        e.dataTransfer.setDragImage(transparentDragImage, 0, 0);
      }
    }
    e.dataTransfer.setData('text/plain', String(activity.id));
    // Also store the activity as JSON for touch support
    e.dataTransfer.setData('application/json', JSON.stringify(activity));
  };

  const setActiveDropTarget = useCallback((target: CalendarDropTarget | null) => {
    if (areSameCalendarDropTarget(activeDropTargetRef.current, target)) {
      return;
    }

    activeDropTargetRef.current = target;
    setDropTargetDate(target?.date ?? null);
    setDropTargetTime(target?.time ?? null);
    setIsDraggingOverTimeSlot(Boolean(target?.time));
  }, []);

  const getCalendarDropTargetAtPoint = useCallback((clientX: number, clientY: number): CalendarDropTarget | null => {
    if (typeof document === "undefined") return null;

    if (shouldSuppressCalendarDropTargetAtPoint(clientX, clientY)) {
      return null;
    }

    return (
      getCalendarDropTargetFromElement(document.elementFromPoint(clientX, clientY)) ??
      findClosestCalendarDropTarget(clientX, clientY)
    );
  }, []);

  const consumeSuppressedActivityClick = useCallback((activityId: number) => {
    if (suppressNextActivityClickRef.current !== activityId) {
      return false;
    }

    suppressNextActivityClickRef.current = null;
    return true;
  }, []);

  const getScrollAreaViewport = useCallback((scrollAreaRoot: HTMLDivElement | null) => {
    if (!scrollAreaRoot) return null;
    return scrollAreaRoot.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
  }, []);

  const getCalendarPageScrollContainer = useCallback(() => {
    if (typeof window === "undefined") return null;

    let currentElement = monthCalendarContainerRef.current?.parentElement ?? null;

    while (currentElement) {
      const { overflowY } = window.getComputedStyle(currentElement);
      const canScrollVertically =
        /(auto|scroll|overlay)/.test(overflowY) &&
        currentElement.scrollHeight > currentElement.clientHeight;

      if (canScrollVertically) {
        return currentElement;
      }

      currentElement = currentElement.parentElement;
    }

    return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
  }, []);

  const syncCalendarPageAutoScroll = useCallback((
    direction: 'up' | 'down',
    scrollAmount: number,
    activeTarget: HTMLElement | null,
  ) => {
    if (typeof window === "undefined") return;

    const pageScrollContainer = getCalendarPageScrollContainer();
    const calendarContainerRect = monthCalendarContainerRef.current?.getBoundingClientRect();

    if (!pageScrollContainer || !calendarContainerRect || pageScrollContainer === activeTarget) {
      return;
    }

    const pageContainerRect = pageScrollContainer.getBoundingClientRect();
    const visibleTop = Math.max(pageContainerRect.top, 0);
    const visibleBottom = Math.min(pageContainerRect.bottom, window.innerHeight);
    const canScrollUp = pageScrollContainer.scrollTop > 0;
    const canScrollDown =
      pageScrollContainer.scrollTop + pageScrollContainer.clientHeight < pageScrollContainer.scrollHeight - 1;

    if (direction === 'down' && calendarContainerRect.bottom > visibleBottom && canScrollDown) {
      pageScrollContainer.scrollBy({ top: scrollAmount, behavior: 'auto' });
    } else if (direction === 'up' && calendarContainerRect.top < visibleTop && canScrollUp) {
      pageScrollContainer.scrollBy({ top: -scrollAmount, behavior: 'auto' });
    }
  }, [getCalendarPageScrollContainer]);

  const updateAutoScrollForPointer = useCallback((clientX: number, clientY: number) => {
    if (!draggedActivity && !mouseDragRef.current?.hasStarted) {
      stopAutoScroll();
      return;
    }

    const scrollThreshold = view === 'month' ? MONTH_DRAG_AUTO_SCROLL_THRESHOLD : 60;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const pageScrollContainer = getCalendarPageScrollContainer();
    const monthContainerRect =
      monthCalendarContainerRef.current?.getBoundingClientRect() ?? null;

    const activeScrollViewport =
      view === 'week'
        ? getScrollAreaViewport(weekScrollAreaRef.current)
        : view === 'day'
          ? getScrollAreaViewport(dayScrollAreaRef.current)
          : null;

    let scrollDirection: 'left' | 'right' | 'up' | 'down' | null = null;
    let targetType: 'window' | 'viewport' | null = null;
    let targetElement: HTMLElement | null = null;
    let scrollStrength = 0;

    if (activeScrollViewport) {
      const rect = activeScrollViewport.getBoundingClientRect();
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, viewportHeight);
      const canScrollUp = activeScrollViewport.scrollTop > 0;
      const canScrollDown =
        activeScrollViewport.scrollTop + activeScrollViewport.clientHeight < activeScrollViewport.scrollHeight - 1;
      const hasVisibleVerticalArea = visibleBottom > visibleTop;

      if (hasVisibleVerticalArea && clientY < visibleTop + scrollThreshold && canScrollUp) {
        scrollDirection = 'up';
        targetType = 'viewport';
        targetElement = activeScrollViewport;
        scrollStrength = getAutoScrollStrength(visibleTop + scrollThreshold - clientY, scrollThreshold);
      } else if (hasVisibleVerticalArea && clientY > visibleBottom - scrollThreshold && canScrollDown) {
        scrollDirection = 'down';
        targetType = 'viewport';
        targetElement = activeScrollViewport;
        scrollStrength = getAutoScrollStrength(clientY - (visibleBottom - scrollThreshold), scrollThreshold);
      }
    }

    if (!scrollDirection && view === 'month' && pageScrollContainer) {
      const rect = pageScrollContainer.getBoundingClientRect();
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, viewportHeight);
      const canScrollUp = pageScrollContainer.scrollTop > 0;
      const canScrollDown =
        pageScrollContainer.scrollTop + pageScrollContainer.clientHeight < pageScrollContainer.scrollHeight - 1;
      const hasVisibleVerticalArea = visibleBottom > visibleTop;
      const monthTopAboveVisibleArea = monthContainerRect ? monthContainerRect.top < visibleTop : false;
      const monthBottomBelowVisibleArea = monthContainerRect ? monthContainerRect.bottom > visibleBottom : false;

      if (hasVisibleVerticalArea && clientY < visibleTop + scrollThreshold && canScrollUp && monthTopAboveVisibleArea) {
        scrollDirection = 'up';
        targetType = 'viewport';
        targetElement = pageScrollContainer;
        scrollStrength = getAutoScrollStrength(visibleTop + scrollThreshold - clientY, scrollThreshold);
      } else if (
        hasVisibleVerticalArea &&
        clientY > visibleBottom - scrollThreshold &&
        canScrollDown &&
        monthBottomBelowVisibleArea
      ) {
        scrollDirection = 'down';
        targetType = 'viewport';
        targetElement = pageScrollContainer;
        scrollStrength = getAutoScrollStrength(clientY - (visibleBottom - scrollThreshold), scrollThreshold);
      }
    }

    if (!scrollDirection) {
      if (clientX < scrollThreshold) {
        scrollDirection = 'left';
        scrollStrength = getAutoScrollStrength(scrollThreshold - clientX, scrollThreshold);
      } else if (clientX > viewportWidth - scrollThreshold) {
        scrollDirection = 'right';
        scrollStrength = getAutoScrollStrength(clientX - (viewportWidth - scrollThreshold), scrollThreshold);
      }

      const allowWindowVerticalScroll = view !== 'month' || !pageScrollContainer;

      if (clientY < scrollThreshold && allowWindowVerticalScroll && (!monthContainerRect || monthContainerRect.top < 0)) {
        scrollDirection = 'up';
        scrollStrength = getAutoScrollStrength(scrollThreshold - clientY, scrollThreshold);
      } else if (
        clientY > viewportHeight - scrollThreshold &&
        allowWindowVerticalScroll &&
        (!monthContainerRect || monthContainerRect.bottom > viewportHeight)
      ) {
        scrollDirection = 'down';
        scrollStrength = getAutoScrollStrength(clientY - (viewportHeight - scrollThreshold), scrollThreshold);
      }

      if (scrollDirection) {
        targetType = 'window';
      }
    }

    if (!scrollDirection) {
      if (autoScrollRef.current.frameId !== null) {
        autoScrollRef.current.pendingDirection = null;
        autoScrollRef.current.pendingTargetStrength = 0;
        autoScrollRef.current.pendingTargetType = null;
        autoScrollRef.current.pendingTargetElement = null;
        autoScrollRef.current.targetStrength = 0;
        return;
      }

      stopAutoScroll();
      return;
    }

    const useSmoothMonthSpeed = view === 'month' && targetType === 'viewport' && targetElement === pageScrollContainer;

    if (autoScrollRef.current.frameId !== null) {
      const shouldQueueSmoothTransition =
        useSmoothMonthSpeed &&
        (
          autoScrollRef.current.direction !== scrollDirection ||
          autoScrollRef.current.targetType !== targetType ||
          autoScrollRef.current.targetElement !== targetElement
        );

      if (shouldQueueSmoothTransition) {
        autoScrollRef.current.pendingDirection = scrollDirection;
        autoScrollRef.current.pendingTargetStrength = scrollStrength;
        autoScrollRef.current.pendingTargetType = targetType;
        autoScrollRef.current.pendingTargetElement = targetElement;
        autoScrollRef.current.targetStrength = 0;
        setAutoScrollEnabled(true);
        return;
      }

      autoScrollRef.current.direction = scrollDirection;
      autoScrollRef.current.targetStrength = scrollStrength;
      autoScrollRef.current.targetType = targetType;
      autoScrollRef.current.targetElement = targetElement;
      autoScrollRef.current.pendingDirection = null;
      autoScrollRef.current.pendingTargetStrength = 0;
      autoScrollRef.current.pendingTargetType = null;
      autoScrollRef.current.pendingTargetElement = null;

      if (!useSmoothMonthSpeed) {
        autoScrollRef.current.strength = scrollStrength;
      }

      setAutoScrollEnabled(true);
      return;
    }

    setAutoScrollEnabled(true);
    autoScrollRef.current.direction = scrollDirection;
    autoScrollRef.current.lastTimestamp = null;
    autoScrollRef.current.strength = useSmoothMonthSpeed
      ? scrollStrength * MONTH_DRAG_AUTO_SCROLL_START_STRENGTH_FACTOR
      : scrollStrength;
    autoScrollRef.current.targetStrength = scrollStrength;
    autoScrollRef.current.pendingDirection = null;
    autoScrollRef.current.pendingTargetStrength = 0;
    autoScrollRef.current.targetType = targetType;
    autoScrollRef.current.targetElement = targetElement;
    autoScrollRef.current.pendingTargetType = null;
    autoScrollRef.current.pendingTargetElement = null;

    const stepAutoScroll = (timestamp: number) => {
      if (!draggedActivity && !mouseDragRef.current?.hasStarted) {
        stopAutoScroll();
        return;
      }

      const currentDirection = autoScrollRef.current.direction;
      const currentTargetType = autoScrollRef.current.targetType;
      const currentTargetElement = autoScrollRef.current.targetElement;

      if (!currentDirection || !currentTargetType) {
        stopAutoScroll();
        return;
      }

      const deltaMs = autoScrollRef.current.lastTimestamp === null
        ? 16
        : Math.min(timestamp - autoScrollRef.current.lastTimestamp, 32);
      autoScrollRef.current.lastTimestamp = timestamp;
      let activeDirection = currentDirection;
      let activeTargetType = currentTargetType;
      let activeTargetElement = currentTargetElement;
      let useSmoothMonthSpeedForFrame =
        view === 'month' &&
        activeTargetType === 'viewport' &&
        activeTargetElement === pageScrollContainer;

      autoScrollRef.current.strength = smoothAutoScrollStrength(
        autoScrollRef.current.strength,
        autoScrollRef.current.targetStrength,
        useSmoothMonthSpeedForFrame,
        deltaMs,
      );

      const hasPendingTransition =
        autoScrollRef.current.pendingDirection !== null &&
        autoScrollRef.current.pendingTargetType !== null;

      if (hasPendingTransition && autoScrollRef.current.strength <= MONTH_DRAG_AUTO_SCROLL_REVERSE_THRESHOLD) {
        activeDirection = autoScrollRef.current.pendingDirection!;
        activeTargetType = autoScrollRef.current.pendingTargetType!;
        activeTargetElement = autoScrollRef.current.pendingTargetElement;
        useSmoothMonthSpeedForFrame =
          view === 'month' &&
          activeTargetType === 'viewport' &&
          activeTargetElement === pageScrollContainer;

        autoScrollRef.current.direction = activeDirection;
        autoScrollRef.current.targetType = activeTargetType;
        autoScrollRef.current.targetElement = activeTargetElement;
        autoScrollRef.current.strength = useSmoothMonthSpeedForFrame
          ? autoScrollRef.current.pendingTargetStrength * MONTH_DRAG_AUTO_SCROLL_START_STRENGTH_FACTOR
          : autoScrollRef.current.pendingTargetStrength;
        autoScrollRef.current.targetStrength = autoScrollRef.current.pendingTargetStrength;
        autoScrollRef.current.pendingDirection = null;
        autoScrollRef.current.pendingTargetStrength = 0;
        autoScrollRef.current.pendingTargetType = null;
        autoScrollRef.current.pendingTargetElement = null;
      }

      if (!hasPendingTransition && autoScrollRef.current.targetStrength <= 0 && autoScrollRef.current.strength < 0.02) {
        stopAutoScroll();
        return;
      }

      const scrollVelocity = getAutoScrollVelocity(autoScrollRef.current.strength, useSmoothMonthSpeedForFrame);
      const scrollDistance = (scrollVelocity * deltaMs) / 1000;

      if (activeTargetType === 'viewport' && activeTargetElement) {
        if (view === 'month' && activeTargetElement === pageScrollContainer) {
          const currentMonthContainerRect = monthCalendarContainerRef.current?.getBoundingClientRect();
          const currentScrollContainerRect = activeTargetElement.getBoundingClientRect();
          const visibleTop = Math.max(currentScrollContainerRect.top, 0);
          const visibleBottom = Math.min(currentScrollContainerRect.bottom, window.innerHeight);
          const canScrollUp = activeTargetElement.scrollTop > 0;
          const canScrollDown =
            activeTargetElement.scrollTop + activeTargetElement.clientHeight < activeTargetElement.scrollHeight - 1;
          const canContinueScrolling = currentMonthContainerRect
            ? activeDirection === 'down'
              ? currentMonthContainerRect.bottom > visibleBottom && canScrollDown
              : currentMonthContainerRect.top < visibleTop && canScrollUp
            : false;

          if (!canContinueScrolling) {
            stopAutoScroll();
            return;
          }
        }

        switch (activeDirection) {
          case 'up':
            activeTargetElement.scrollBy({ top: -scrollDistance, behavior: 'auto' });
            break;
          case 'down':
            activeTargetElement.scrollBy({ top: scrollDistance, behavior: 'auto' });
            break;
          case 'left':
            activeTargetElement.scrollBy({ left: -scrollDistance, behavior: 'auto' });
            break;
          case 'right':
            activeTargetElement.scrollBy({ left: scrollDistance, behavior: 'auto' });
            break;
        }

        if (activeDirection === 'up' || activeDirection === 'down') {
          syncCalendarPageAutoScroll(activeDirection, scrollDistance, activeTargetElement);
        }

        autoScrollRef.current.frameId = requestAnimationFrame(stepAutoScroll);
        return;
      }

      if (view === 'month' && (activeDirection === 'up' || activeDirection === 'down')) {
        const currentMonthContainerRect = monthCalendarContainerRef.current?.getBoundingClientRect();
        const canContinueScrolling = currentMonthContainerRect
          ? activeDirection === 'down'
            ? currentMonthContainerRect.bottom > window.innerHeight
            : currentMonthContainerRect.top < 0
          : false;

        if (!canContinueScrolling) {
          stopAutoScroll();
          return;
        }
      }

      switch (activeDirection) {
        case 'left':
          window.scrollBy({ left: -scrollDistance, behavior: 'auto' });
          break;
        case 'right':
          window.scrollBy({ left: scrollDistance, behavior: 'auto' });
          break;
        case 'up':
          window.scrollBy({ top: -scrollDistance, behavior: 'auto' });
          break;
        case 'down':
          window.scrollBy({ top: scrollDistance, behavior: 'auto' });
          break;
      }

      autoScrollRef.current.frameId = requestAnimationFrame(stepAutoScroll);
    };

    autoScrollRef.current.frameId = requestAnimationFrame(stepAutoScroll);
  }, [draggedActivity, getCalendarPageScrollContainer, getScrollAreaViewport, stopAutoScroll, syncCalendarPageAutoScroll, view]);

  // Handle drag over for time slot (Week/Day view)
  const handleTimeSlotDragOver = (e: React.DragEvent, date: Date, time: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setActiveDropTarget({ date, time });
    updateAutoScrollForPointer(e.clientX, e.clientY);
  };

  // Handle drag leave for time slot
  const handleTimeSlotDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverTimeSlot(false);
  };

  const resetDragInteractionState = useCallback(() => {
    activeDropTargetRef.current = null;
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

    const previousActivities = queryClient.getQueryData<any[]>([api.activities.list.path]);
    const previousSelectedActivity = selectedActivity;

    try {
      const deadlineDateStr = new Date(targetDate);
      const isRecurringSeriesMove = Boolean(activityToMove.recurrence && activityToMove.recurrence !== 'none');
      const activitiesQueryKey = [api.activities.list.path] as const;
      if (targetTime) {
        const [hours, minutes] = targetTime.split(':').map(Number);
        deadlineDateStr.setHours(hours, minutes, 0, 0);
      } else {
        const originalDate = new Date(activityToMove.deadlineDate);
        deadlineDateStr.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0);
      }

      const adjustedDeadlineDate = adjustToPreviousWorkingDay(deadlineDateStr);
      const deadlineToPersist = isRecurringSeriesMove ? deadlineDateStr : adjustedDeadlineDate;

      await queryClient.cancelQueries({ queryKey: activitiesQueryKey });

      if (previousActivities) {
        const getMonthDifference = (from: Date, to: Date) =>
          ((to.getFullYear() - from.getFullYear()) * 12) + (to.getMonth() - from.getMonth());

        const buildRecurringDeadlineForSlot = (slotDate: Date, sourceDate: Date) => {
          const maxDayInMonth = new Date(slotDate.getFullYear(), slotDate.getMonth() + 1, 0).getDate();
          const clampedDay = Math.min(sourceDate.getDate(), maxDayInMonth);
          const nextDeadline = new Date(slotDate.getFullYear(), slotDate.getMonth(), clampedDay);

          nextDeadline.setHours(
            sourceDate.getHours(),
            sourceDate.getMinutes(),
            sourceDate.getSeconds(),
            sourceDate.getMilliseconds(),
          );

          return nextDeadline;
        };

        const getWeekdayOccurrenceIndex = (date: Date) => {
          let occurrenceIndex = 0;
          for (let day = 1; day <= date.getDate(); day++) {
            const candidate = new Date(date.getFullYear(), date.getMonth(), day);
            if (candidate.getDay() === date.getDay()) {
              occurrenceIndex++;
            }
          }

          return occurrenceIndex - 1;
        };

        const buildWeekdayRecurringDeadlineForSlot = (
          slotDate: Date,
          sourceDate: Date,
          occurrenceIndex: number,
        ) => {
          const matchingDays: number[] = [];
          const daysInMonth = new Date(slotDate.getFullYear(), slotDate.getMonth() + 1, 0).getDate();

          for (let day = 1; day <= daysInMonth; day++) {
            const candidate = new Date(slotDate.getFullYear(), slotDate.getMonth(), day);
            if (candidate.getDay() === sourceDate.getDay()) {
              matchingDays.push(day);
            }
          }

          const targetDay = matchingDays[Math.min(occurrenceIndex, matchingDays.length - 1)] ?? 1;
          const nextDeadline = new Date(slotDate.getFullYear(), slotDate.getMonth(), targetDay);

          nextDeadline.setHours(
            sourceDate.getHours(),
            sourceDate.getMinutes(),
            sourceDate.getSeconds(),
            sourceDate.getMilliseconds(),
          );

          return nextDeadline;
        };

        const now = new Date();
        const restrictedStatusSet = new Set(restrictedStatuses);
        const currentSeriesSlotDate = new Date(activityToMove.startDate);
        const sameSeriesActivities = previousActivities.filter((activity) =>
          activity.title === activityToMove.title &&
          activity.recurrence === activityToMove.recurrence &&
          activity.userId === activityToMove.userId &&
          activity.regulatoryAgency === activityToMove.regulatoryAgency &&
          activity.concernDepartment === activityToMove.concernDepartment
        );
        const isMonthlyPatternSeries =
          activityToMove.recurrence === 'monthly' &&
          !!activityToMove.monthlyPattern &&
          activityToMove.monthlyPattern !== 'date';

        const optimisticActivities = previousActivities.map((activity) => {
          if (!isRecurringSeriesMove) {
            if (activity.id !== activityToMove.id) {
              return activity;
            }

            return {
              ...activity,
              deadlineDate: adjustedDeadlineDate,
              status: adjustedDeadlineDate > now ? 'pending' : 'overdue',
            };
          }

          const isSameSeries =
            activity.title === activityToMove.title &&
            activity.recurrence === activityToMove.recurrence &&
            activity.userId === activityToMove.userId &&
            activity.regulatoryAgency === activityToMove.regulatoryAgency &&
            activity.concernDepartment === activityToMove.concernDepartment;

          if (!isSameSeries || restrictedStatusSet.has(activity.status || '')) {
            return activity;
          }

          const seriesSlotDate = new Date(activity.startDate);
          const monthOffset = getMonthDifference(currentSeriesSlotDate, seriesSlotDate);
          const nextSlotDate = new Date(
            deadlineDateStr.getFullYear(),
            deadlineDateStr.getMonth() + monthOffset,
            1,
          );
          const requestedSlotDeadline = isMonthlyPatternSeries
            ? buildWeekdayRecurringDeadlineForSlot(
                nextSlotDate,
                deadlineDateStr,
                getWeekdayOccurrenceIndex(seriesSlotDate),
              )
            : buildRecurringDeadlineForSlot(nextSlotDate, deadlineDateStr);
          const nextDeadline = adjustToPreviousWorkingDay(requestedSlotDeadline);

          return {
            ...activity,
            startDate: requestedSlotDeadline,
            deadlineDate: nextDeadline,
            status: nextDeadline > now ? 'pending' : 'overdue',
          };
        });

        queryClient.setQueryData(activitiesQueryKey, optimisticActivities);

        const optimisticSelectedActivity = optimisticActivities.find((activity) => activity.id === activityToMove.id);
        if (optimisticSelectedActivity) {
          setSelectedActivity(optimisticSelectedActivity);
        }
      }

      const { activity: updatedActivity } = await updateActivity.mutateAsync({
        id: activityToMove.id,
        data: {
          deadlineDate: deadlineToPersist,
          applyToSeries: isRecurringSeriesMove,
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
      const wasAdjustedToPreviousWorkingDay = finalDeadline.getTime() !== deadlineDateStr.getTime();
      const adjustmentMsg = wasAdjustedToPreviousWorkingDay ? ' Adjusted to the previous working day.' : '';
      toast({
        title: isRecurringSeriesMove
          ? "Reschedule all activities"
          : "Activity rescheduled",
        description: isRecurringSeriesMove
          ? "Moved all recurring activities"
          : `Moved to ${finalDateLabel}${timeStr}.${statusChangeMsg}${adjustmentMsg}`
      });
    } catch (error) {
      queryClient.setQueryData([api.activities.list.path], previousActivities);
      if (previousSelectedActivity) {
        setSelectedActivity(previousSelectedActivity);
      }
      // Error handled by mutation
    }
  }, [queryClient, selectedActivity, toast, updateActivity]);

  const rescheduleActivityToDropTarget = useCallback((activityToMove: any, target: CalendarDropTarget | null) => {
    if (!activityToMove || !target) return;

    const currentDisplayDate = getCalendarDisplayDate(activityToMove);
    const currentTimeSlot = getActivityTimeSlotValue(activityToMove);

    if (target.time) {
      if (!isSameDay(currentDisplayDate, target.date) || currentTimeSlot !== target.time) {
        void performActivityReschedule(activityToMove, target.date, target.time);
      }
      return;
    }

    if (!isSameDay(currentDisplayDate, target.date)) {
      void performActivityReschedule(activityToMove, target.date);
    }
  }, [performActivityReschedule]);

  const handleActivityMouseDown = useCallback((activity: any, e: React.MouseEvent<HTMLElement>) => {
    if (isMobile) return;
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    mouseDragRef.current = {
      activity,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      hasStarted: false,
    };
    setIsMouseDragArmed(true);
  }, [isMobile]);

  useEffect(() => {
    if (!isMouseDragArmed) return;

    const DRAG_START_DISTANCE = 5;

    const finalizeMouseDrag = (shouldDrop: boolean, clientX?: number, clientY?: number) => {
      const dragContext = mouseDragRef.current;
      mouseDragRef.current = null;
      setIsMouseDragArmed(false);

      if (!dragContext) {
        resetDragInteractionState();
        return;
      }

      if (!dragContext.hasStarted) {
        stopAutoScroll();
        return;
      }

      suppressNextActivityClickRef.current = dragContext.activity.id;
      const target = shouldDrop
        ? getCalendarDropTargetAtPoint(
            clientX ?? dragContext.currentX,
            clientY ?? dragContext.currentY,
          )
        : null;

      resetDragInteractionState();

      if (shouldDrop) {
        rescheduleActivityToDropTarget(dragContext.activity, target);
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      const dragContext = mouseDragRef.current;
      if (!dragContext) return;

      dragContext.currentX = event.clientX;
      dragContext.currentY = event.clientY;
      const nextDropTarget = getCalendarDropTargetAtPoint(event.clientX, event.clientY);

      if (!dragContext.hasStarted) {
        const dragDistance = Math.hypot(
          event.clientX - dragContext.startX,
          event.clientY - dragContext.startY,
        );

        if (dragDistance < DRAG_START_DISTANCE) {
          return;
        }

        dragContext.hasStarted = true;
        setDraggedActivity(dragContext.activity);
        setActiveDropTarget(nextDropTarget);
      } else {
        setActiveDropTarget(nextDropTarget);
      }

      event.preventDefault();
      updateAutoScrollForPointer(event.clientX, event.clientY);
    };

    const handleMouseUp = (event: MouseEvent) => {
      finalizeMouseDrag(true, event.clientX, event.clientY);
    };

    const handleWindowBlur = () => {
      finalizeMouseDrag(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [
    getCalendarDropTargetAtPoint,
    isMouseDragArmed,
    rescheduleActivityToDropTarget,
    resetDragInteractionState,
    setActiveDropTarget,
    stopAutoScroll,
    updateAutoScrollForPointer,
  ]);

  // Handle drop on time slot (Week/Day view)
  const handleTimeSlotDrop = (e: React.DragEvent, date: Date, time: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverTimeSlot(false);

    const activityToMove = draggedActivity;
    resetDragInteractionState();
    rescheduleActivityToDropTarget(activityToMove, { date, time });
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
    
    const target = shouldSuppressCalendarDropTargetAtPoint(currentX, currentY)
      ? null
      : getCalendarDropTargetFromElement(element) ?? findClosestCalendarDropTarget(currentX, currentY);
    if (target) {
      resetDragInteractionState();
      setIsTouchDragging(false);
      touchDragRef.current = null;
      rescheduleActivityToDropTarget(activity, target);
      return;
    }
    
    resetDragInteractionState();
    setIsTouchDragging(false);
    touchDragRef.current = null;
  };

  // Handle drag over for date cell
  const handleDateDragOver = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setActiveDropTarget({ date, time: null });
    updateAutoScrollForPointer(e.clientX, e.clientY);
  };

  // Handle drop on date cell
  const handleDateDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    e.stopPropagation();

    const activityToMove = draggedActivity;
    resetDragInteractionState();
    rescheduleActivityToDropTarget(activityToMove, { date, time: null });
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
  const monthViewRowCount = Math.ceil((paddingDays.length + daysInMonth.length + trailingPaddingDays.length) / 7);
  const monthViewGridHeight = Math.max(MONTH_VIEW_GRID_MIN_HEIGHT, monthViewRowCount * MONTH_VIEW_DAY_CELL_HEIGHT);
  const calendarViewContentHeight = monthViewGridHeight + MONTH_VIEW_WEEK_HEADER_HEIGHT;

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
      const dayActivities = (activities || []).filter(a => isSameDay(getCurrentCalendarDisplayDate(a), date));
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

  const getTransparentDragImage = useCallback(() => {
    if (typeof document === "undefined") return null;

    if (!transparentDragImageRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      transparentDragImageRef.current = canvas;
    }

    return transparentDragImageRef.current;
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const previousBodyCursor = document.body.style.getPropertyValue("cursor");
    const previousBodyCursorPriority = document.body.style.getPropertyPriority("cursor");
    const previousHtmlCursor = document.documentElement.style.getPropertyValue("cursor");
    const previousHtmlCursorPriority = document.documentElement.style.getPropertyPriority("cursor");

    if (draggedActivity) {
      document.body.style.setProperty("cursor", "move", "important");
      document.documentElement.style.setProperty("cursor", "move", "important");

      if (!dragCursorStyleRef.current) {
        const styleElement = document.createElement("style");
        styleElement.setAttribute("data-calendar-drag-cursor", "true");
        dragCursorStyleRef.current = styleElement;
      }

      dragCursorStyleRef.current.textContent = "html, body, body * { cursor: move !important; }";
      if (!dragCursorStyleRef.current.isConnected) {
        document.head.appendChild(dragCursorStyleRef.current);
      }
    }

    return () => {
      dragCursorStyleRef.current?.remove();

      if (previousBodyCursor) {
        document.body.style.setProperty("cursor", previousBodyCursor, previousBodyCursorPriority);
      } else {
        document.body.style.removeProperty("cursor");
      }

      if (previousHtmlCursor) {
        document.documentElement.style.setProperty("cursor", previousHtmlCursor, previousHtmlCursorPriority);
      } else {
        document.documentElement.style.removeProperty("cursor");
      }
    };
  }, [draggedActivity]);

  useEffect(() => {
    if (!draggedActivity || typeof document === "undefined") return;

    const handleDocumentDragOver = (event: DragEvent) => {
      const closestTarget = getCalendarDropTargetAtPoint(event.clientX, event.clientY);

      if (!closestTarget) {
        setActiveDropTarget(null);
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }

      setActiveDropTarget(closestTarget);
      updateAutoScrollForPointer(event.clientX, event.clientY);
    };

    const handleDocumentDrop = (event: DragEvent) => {
      const closestTarget = shouldSuppressCalendarDropTargetAtPoint(event.clientX, event.clientY)
        ? null
        : getCalendarDropTargetAtPoint(event.clientX, event.clientY) ??
          (dropTargetDate ? { date: dropTargetDate, time: dropTargetTime ?? null } : null);

      if (!closestTarget) {
        resetDragInteractionState();
        return;
      }

      event.preventDefault();
      const activityToMove = draggedActivity;
      resetDragInteractionState();
      rescheduleActivityToDropTarget(activityToMove, closestTarget);
    };

    document.addEventListener('dragover', handleDocumentDragOver);
    document.addEventListener('drop', handleDocumentDrop);

    return () => {
      document.removeEventListener('dragover', handleDocumentDragOver);
      document.removeEventListener('drop', handleDocumentDrop);
    };
  }, [
    draggedActivity,
    dropTargetDate,
    dropTargetTime,
    getCalendarDropTargetAtPoint,
    resetDragInteractionState,
    rescheduleActivityToDropTarget,
    setActiveDropTarget,
    updateAutoScrollForPointer,
  ]);

  const handleCreate = async () => {
    if (!title || !selectedDate) return;

    setIsCreatingActivity(true);

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
      monthlyWeekdayOption,
    );

    try {
      if (adjustedDeadline.getTime() !== deadlineWithTime.getTime()) {
        toast({
          title: "Date adjusted",
          description: `Activity date was moved to ${format(adjustedDeadline, 'MMMM d, yyyy')} because the selected date falls on a weekend or holiday.`,
        });
      }

      if (recurrence === "monthly" && recurrenceEndDateValue && monthlyWeekdayOption !== "date") {
        const weekdayActivities: InsertActivity[] = getMonthlyWeekdayOccurrences(
          selectedDate,
          deadlineWithTime,
          recurrenceEndDateValue,
          monthlyWeekdayOption,
        ).map((occurrence) => ({
          title,
          description,
          startDate: occurrence.startDate,
          deadlineDate: adjustToPreviousWorkingDay(occurrence.deadlineDate),
          status: 'pending',
          regulatoryAgency: regulatoryAgency || null,
          concernDepartment: concernDepartment.length > 0 ? concernDepartment.join(", ") : null,
          reportDetails: reportDetails || null,
          recurrence: 'monthly',
          recurrenceEndDate: null,
          monthlyPattern: monthlyWeekdayOption,
        }));

        await createActivitiesFast(weekdayActivities);
      } else {
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
            recurrence: recurrence !== 'none' ? recurrence : null,
            recurrenceEndDate: recurrenceEndDateValue,
            monthlyPattern: recurrence === 'monthly' ? monthlyWeekdayOption : null,
          },
          suppressSuccessToast: true,
        });
      }

      toast({
        title: "Success",
        description: createdActivitiesCount === 1
          ? "Activity created"
          : `Created ${createdActivitiesCount} activities`,
      });

      // Reset the flag
      setManuallyClosedWhileAdding(false);
    } finally {
      setIsCreatingActivity(false);
    }
  };

  const handleEditActivity = async () => {
    if (!editingActivity || !editSelectedDate || !editTitle || isDateHolidayOrWeekend(editSelectedDate)) {
      return;
    }

    setIsUpdatingActivity(true);

    try {
      const [hours, minutes] = editActivityTime.split(':').map(Number);
      const deadlineWithTime = new Date(editSelectedDate);
      deadlineWithTime.setHours(hours, minutes, 0, 0);

      const isRecurringSeriesEdit = Boolean(editingActivity.recurrence && editingActivity.recurrence !== 'none');
      const deadlineToPersist = isRecurringSeriesEdit
        ? deadlineWithTime
        : adjustToPreviousWorkingDay(deadlineWithTime);

      const { activity: updatedActivity } = await updateActivity.mutateAsync({
        id: editingActivity.id,
        data: {
          title: editTitle,
          description: editDescription,
          deadlineDate: deadlineToPersist,
          regulatoryAgency: editRegulatoryAgency || null,
          concernDepartment: editConcernDepartment.length > 0 ? editConcernDepartment.join(", ") : null,
          reportDetails: editReportDetails || null,
          applyToSeries: isRecurringSeriesEdit,
        },
        suppressSuccessToast: true,
      });

      if (selectedActivity?.id === editingActivity.id) {
        setSelectedActivity(updatedActivity);
      }

      toast({
        title: isRecurringSeriesEdit ? "Recurring activities updated" : "Activity updated",
        description: isRecurringSeriesEdit
          ? "Changes applied to the recurring activity series"
          : "Activity details updated",
      });

      setIsEditActivityOpen(false);
      resetEditActivityForm();
    } finally {
      setIsUpdatingActivity(false);
    }
  };

  const createActivitiesFast = async (activitiesToCreate: InsertActivity[]) => {
    const response = await fetch(api.activities.createMany.path, {
      method: api.activities.createMany.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activities: activitiesToCreate }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: "Failed to create activities" }));
      throw new Error(errorData?.message || "Failed to create activities");
    }

    api.activities.createMany.responses[201].parse(await response.json());
    await queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });
  };

  const moveExistingActivitiesToPreviousWorkingDay = useCallback(async () => {
    if (!activities || activities.length === 0) {
      return;
    }

    const restoreDates = { ...philippineHolidayRestoreDatesRef.current };
    const activitiesToAdjust = activities
      .map((activity) => {
        const currentDeadline = new Date(activity.deadlineDate);
        const adjustedDeadline = adjustToPreviousWorkingDay(currentDeadline);

        if (adjustedDeadline.getTime() === currentDeadline.getTime()) {
          return null;
        }

        return {
          id: activity.id,
          originalDeadline: currentDeadline,
          adjustedDeadline,
        };
      })
      .filter((activity): activity is { id: number; originalDeadline: Date; adjustedDeadline: Date } => activity !== null);

    if (activitiesToAdjust.length === 0) {
      toast({
        title: "No activity changes needed",
        description: "Existing activities already fall on working days.",
      });
      return;
    }

    const errors: string[] = [];

    for (const activityBatch of chunkArray(activitiesToAdjust, 10)) {
      const results = await Promise.allSettled(
        activityBatch.map(async (activity) => {
          const url = buildUrl(api.activities.update.path, { id: activity.id });
          const response = await fetch(url, {
            method: api.activities.update.method,
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              deadlineDate: activity.adjustedDeadline,
              applyToSeries: false,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: "Failed to update activity" }));
            throw new Error(errorData?.message || "Failed to update activity");
          }

          return api.activities.update.responses[200].parse(await response.json());
        }),
      );

      results.forEach((result) => {
        if (result.status === "rejected") {
          errors.push(result.reason instanceof Error ? result.reason.message : "Failed to update activity");
        }
      });
    }

    if (errors.length > 0) {
      throw new Error(errors[0]);
    }

    activitiesToAdjust.forEach((activity) => {
      restoreDates[String(activity.id)] = activity.originalDeadline.toISOString();
    });
    philippineHolidayRestoreDatesRef.current = restoreDates;
    writeStoredPhilippineHolidayRestoreDates(restoreDates);

    await queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });

    toast({
      title: "Activities adjusted",
      description: `${activitiesToAdjust.length} existing ${activitiesToAdjust.length === 1 ? "activity was" : "activities were"} moved to the previous working day.`,
    });
  }, [activities, queryClient, toast]);

  const restoreExistingActivitiesFromPhilippineHolidayAdjustment = useCallback(async () => {
    const restoreDates = { ...philippineHolidayRestoreDatesRef.current };
    const entriesToRestore = Object.entries(restoreDates);

    if (entriesToRestore.length === 0) {
      toast({
        title: "No activity changes needed",
        description: "There are no saved Philippines holiday date adjustments to restore.",
      });
      return;
    }

    const errors: string[] = [];
    const restoredIds = new Set<string>();

    for (const restoreBatch of chunkArray(entriesToRestore, 10)) {
      const results = await Promise.allSettled(
        restoreBatch.map(async ([activityId, originalDeadline]) => {
          const url = buildUrl(api.activities.update.path, { id: Number(activityId) });
          const response = await fetch(url, {
            method: api.activities.update.method,
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              deadlineDate: new Date(originalDeadline),
              applyToSeries: false,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: "Failed to update activity" }));
            throw new Error(errorData?.message || "Failed to update activity");
          }

          restoredIds.add(activityId);
          return api.activities.update.responses[200].parse(await response.json());
        }),
      );

      results.forEach((result) => {
        if (result.status === "rejected") {
          errors.push(result.reason instanceof Error ? result.reason.message : "Failed to update activity");
        }
      });
    }

    if (errors.length > 0) {
      const remainingRestoreDates = Object.fromEntries(
        Object.entries(restoreDates).filter(([activityId]) => !restoredIds.has(activityId)),
      );
      philippineHolidayRestoreDatesRef.current = remainingRestoreDates;
      writeStoredPhilippineHolidayRestoreDates(remainingRestoreDates);
      throw new Error(errors[0]);
    }

    philippineHolidayRestoreDatesRef.current = {};
    writeStoredPhilippineHolidayRestoreDates({});

    await queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });

    toast({
      title: "Activities restored",
      description: `${entriesToRestore.length} ${entriesToRestore.length === 1 ? "activity was" : "activities were"} returned to the original date from before Philippines holiday adjustment.`,
    });
  }, [queryClient, toast]);

  useEffect(() => {
    if (!pendingPhilippineHolidayAdjustmentRef.current) {
      return;
    }

    if (!showPhilippineHolidays || isLoadingPhilippineHolidays || !philippineHolidays || !activities) {
      return;
    }

    if (isApplyingPhilippineHolidayAdjustmentRef.current) {
      return;
    }

    pendingPhilippineHolidayAdjustmentRef.current = false;
    isApplyingPhilippineHolidayAdjustmentRef.current = true;

    void moveExistingActivitiesToPreviousWorkingDay()
      .catch((error) => {
        toast({
          title: "Could not adjust activities",
          description: error instanceof Error ? error.message : "Failed to move existing activities",
          variant: "destructive",
        });
      })
      .finally(() => {
        isApplyingPhilippineHolidayAdjustmentRef.current = false;
      });
  }, [
    activities,
    isLoadingPhilippineHolidays,
    moveExistingActivitiesToPreviousWorkingDay,
    philippineHolidays,
    showPhilippineHolidays,
    toast,
  ]);

  useEffect(() => {
    if (!pendingPhilippineHolidayRestoreRef.current) {
      return;
    }

    if (showPhilippineHolidays) {
      return;
    }

    if (isApplyingPhilippineHolidayAdjustmentRef.current) {
      return;
    }

    pendingPhilippineHolidayRestoreRef.current = false;
    isApplyingPhilippineHolidayAdjustmentRef.current = true;

    void restoreExistingActivitiesFromPhilippineHolidayAdjustment()
      .catch((error) => {
        toast({
          title: "Could not restore activities",
          description: error instanceof Error ? error.message : "Failed to restore original activity dates",
          variant: "destructive",
        });
      })
      .finally(() => {
        isApplyingPhilippineHolidayAdjustmentRef.current = false;
      });
  }, [restoreExistingActivitiesFromPhilippineHolidayAdjustment, showPhilippineHolidays, toast]);

  const getStatusColor = (status: string | null) => {
    switch(status) {
      case 'completed': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-100 dark:text-emerald-800 dark:border-emerald-200';
      case 'overdue': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-100 dark:text-red-800 dark:border-red-200';
      case 'late': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-100 dark:text-orange-800 dark:border-orange-200';
      case 'in-progress': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-100 dark:text-blue-800 dark:border-blue-200';
      default: return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-100 dark:text-amber-800 dark:border-amber-200';
    }
  };

  // Get the border color for a status (used for left border)
  const getStatusBorderColor = (status: string | null) => {
    switch(status) {
      case 'completed': return 'border-l-4 border-emerald-500 dark:border-emerald-500';
      case 'overdue': return 'border-l-4 border-red-500 dark:border-red-500';
      case 'late': return 'border-l-4 border-orange-500 dark:border-orange-500';
      case 'in-progress': return 'border-l-4 border-blue-500 dark:border-blue-500';
      default: return 'border-l-4 border-amber-500 dark:border-amber-500';
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
    ? (allActivitiesByDateKey.get(getDateKey(selectedDate)) || [])
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
      const trimmedSubmissionRemarks = submissionRemarks.trim();
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
          deadlineYear,
          deadlineMonth,
          submissionDate: submissionDate.toISOString(),
          submissionDateKey: format(submissionDate, 'yyyy-MM-dd'),
          remarks: trimmedSubmissionRemarks || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();
      const nextActivityStatus = submissionDate > deadlineDate ? 'late' : 'completed';
      const nextCompletionDate = submissionDate.toISOString();
      const createdReports = Array.isArray(result.reports) ? result.reports : [];
      const newSubmissionEntries = createdReports.map((report: any, index: number) => ({
        id: `temp-${report.id ?? index}-${Date.now()}`,
        activityId: selectedActivity.id,
        reportId: report.id,
        submissionDate: nextCompletionDate,
        status: nextActivityStatus === 'late' ? 'late' : 'submitted',
        notes: trimmedSubmissionRemarks || null,
        report: {
          id: report.id,
          title: report.title,
          fileName: report.fileName,
          fileType: report.fileType,
          fileData: report.fileData || fileDataArray[index]?.data,
        },
      }));

      queryClient.setQueryData<any[]>([api.activities.list.path], (currentActivities) => {
        if (!Array.isArray(currentActivities)) {
          return currentActivities;
        }

        return currentActivities.map((activity) =>
          activity.id === selectedActivity.id
            ? {
                ...activity,
                status: nextActivityStatus,
                completionDate: nextCompletionDate,
              }
            : activity
        );
      });
      setSelectedActivity((current: any) =>
        current
          ? {
              ...current,
              status: nextActivityStatus,
              completionDate: nextCompletionDate,
            }
          : current
      );
      setActivitySubmissions((current) => [...current, ...newSubmissionEntries]);

      toast({
        title: "Submission successful",
        description: `Successfully submitted ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}!`,
      });

      setIsActivityModalOpen(false);
      setSelectedFiles([]);
      setSubmissionRemarks("");
      // Refresh activities, notifications, folders, and reports so other pages reflect the submission immediately.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [api.activities.list.path] }),
        queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] }),
        queryClient.invalidateQueries({ queryKey: [api.folders.list.path], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: [api.reports.list.path], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: [api.reports.count.path], refetchType: 'all' }),
      ]);
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
                      const holidayId = holidayToDelete.id;
                      const isDeletingEditedHoliday = editingHoliday?.id === holidayId;

                      setIsDeletingHolidayId(holidayId);
                      // Close modal immediately
                      setShowDeleteHolidayConfirm(false);
                      setHolidayToDelete(null);

                      try {
                        await deleteHoliday.mutateAsync(holidayId);
                        if (isDeletingEditedHoliday) {
                          resetHolidayForm();
                        }
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
                  const ids = deleteRecurPreview.map((activity) => activity.id);
                  const response = await fetch(api.activities.deleteMany.path, {
                    method: api.activities.deleteMany.method,
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ ids }),
                  });

                  if (!response.ok) {
                    throw new Error("Failed to delete activities");
                  }

                  const result = api.activities.deleteMany.responses[200].parse(await response.json());
                  queryClient.invalidateQueries({ queryKey: [api.activities.list.path] });
                  setDeleteRecurPreview([]);
                  setDeleteRecurTypes([]);
                  setDeleteRecurTitles([]);
                  setDeleteRecurYears([]);
                  toast({
                    title: "Deleted",
                    description: `All ${result.deletedCount} activities have been deleted`,
                  });
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
                className="relative z-20 shrink-0 p-1 pointer-events-auto touch-manipulation hover:bg-muted rounded-md transition-colors"
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
                resetHolidayForm();
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
                          name="holidayName"
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
                                holidays={calendarHolidays}
                                holidaysEnabled={holidaysEnabledData}
                              />
                            </PopoverContent>
                        </Popover>
                      </div>
                      <PhilippinesHolidaySection
                        checkboxId="holiday-philippines-modal"
                        checked={showPhilippineHolidays}
                        onCheckedChange={handleShowPhilippineHolidaysChange}
                        isLoading={isLoadingPhilippineHolidays}
                        error={philippineHolidaysError}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                       <Button
                         onClick={async () => {
                           if (!holidayName || !holidayDate) return;

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
                              resetHolidayForm();
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
                            resetHolidayForm();
                           }}
                           disabled={isAddingHoliday}
                         >
                           Cancel
                         </Button>
                       )}
                </div>
              </div>

              {/* Existing Holidays - Right Column */}
              <div className="border rounded-lg overflow-hidden flex self-start flex-col">
                <div className="shrink-0 p-4 pb-0">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
                    <span className="w-1 h-4 bg-green-500 rounded-full"></span>
                    EXISTING HOLIDAYS
                  </h4>
                </div>
                {holidays && holidays.length > 0 ? (
                  <>
                    <div className="px-4">
                      <ScrollArea className={showHolidayPagination ? "h-[248px]" : "max-h-[300px]"}>
                        <div className="space-y-2 pr-4 pb-2">
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
                        </div>
                      </ScrollArea>
                    </div>
                    {showHolidayPagination && (
                      <div className="flex items-center justify-between bg-muted/10 p-4">
                        <p className="text-sm text-muted-foreground">
                          Page {holidayPage} of {totalHolidayPages}
                        </p>
                        <div className="flex gap-1">
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
                            onClick={() => setHolidayPage(p => Math.min(totalHolidayPages, p + 1))}
                            disabled={holidayPage === totalHolidayPages}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
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
              setMonthlyWeekdayOption("date");
              setReportDetails("");
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
                      <Input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Submit Q1 Report" className="h-10 border border-gray-300 dark:border-gray-600" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="desc" className="text-sm font-medium">Description</Label>
                      <Textarea id="desc" name="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the activity" className="resize-none border border-gray-300 dark:border-gray-600" rows={2} />
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
                      <Select name="regulatoryAgency" value={regulatoryAgency} onValueChange={setRegulatoryAgency}>
                        <SelectTrigger id="regulatoryAgency" className="h-10 border border-gray-300 dark:border-gray-600">
                          <SelectValue placeholder="Select agency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DOE">DOE</SelectItem>
                          <SelectItem value="ERC">ERC</SelectItem>
                          <SelectItem value="IEMOP">IEMOP</SelectItem>
                          <SelectItem value="NEA">NEA</SelectItem>
                          <SelectItem value="NEA-WEB PORTAL">NEA-WEB PORTAL</SelectItem>
                          <SelectItem value="NGCP">NGCP</SelectItem>
                          <SelectItem value="PSALM">PSALM</SelectItem>
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
                                if (event.currentTarget.scrollHeight <= event.currentTarget.clientHeight) {
                                  return;
                                }

                                event.preventDefault();
                                event.currentTarget.scrollTop += event.deltaY;
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
                      <Select name="recurrence" value={recurrence} onValueChange={handleRecurrenceChange}>
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

                    {recurrence === 'monthly' && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Monthly Pattern</div>
                        <Select
                          name="monthlyWeekdayOption"
                          value={monthlyWeekdayOption}
                          onValueChange={setMonthlyWeekdayOption}
                        >
                          <SelectTrigger id="monthlyWeekdayOption" className="h-10 border border-gray-300 dark:border-gray-600 text-left">
                            <SelectValue placeholder="Select monthly pattern" />
                          </SelectTrigger>
                          <SelectContent>
                            {WEEKDAY_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    {/* Recurrence End Date - only show if recurrence is not none */}
                    {recurrence !== 'none' && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Recurrence End {recurrence === 'yearly' ? 'Year' : 'Date'}</div>
                        {recurrence === 'yearly' ? (
                          // Yearly: only show year picker
                          <Select name="recurrenceEndYear" value={recurrenceEndDate ? recurrenceEndDate.split('-')[0] : ''} onValueChange={(value) => setRecurrenceEndDate(value + '-12-31')}>
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
                          <Select name="recurrenceEndMonth" value={recurrenceEndDate ? recurrenceEndDate.substring(0, 7) : ''} onValueChange={(value) => setRecurrenceEndDate(value + '-01')}>
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
                    <Textarea id="reportDetails" name="reportDetails" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} placeholder="Details about the report to be submitted" className="resize-none border border-gray-300 dark:border-gray-600" rows={3} />
                  </div>
                </div>

                {/* Deadline Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1 h-4 bg-orange-500 rounded-full"></span>
                    Deadline
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="activityDate" className="text-sm font-medium">Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="activityDate"
                          variant="outline"
                          className={cn(
                            "h-10 w-full justify-start text-left font-normal !border-gray-300 dark:!border-gray-600",
                            !selectedDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {selectedDate ? format(selectedDate, 'PPP') : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={selectedDate || undefined}
                          onSelect={(date) => date && setSelectedDate(date)}
                          initialFocus
                          holidays={calendarHolidays}
                          holidaysEnabled={holidaysEnabledData}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time" className="text-sm font-medium">Time</Label>
                    <TimePickerPopover id="time" value={activityTime} onChange={setActivityTime} />
                    <p className="text-xs text-muted-foreground">Set the time (optional, defaults to end of day)</p>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="shrink-0 pt-4 mt-4">
              <div className="flex gap-3 w-full justify-end">
                <Button variant="outline" onClick={() => setIsNewActivityOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={
                    isCreatingActivity ||
                    createActivity.isPending ||
                    !selectedDate ||
                    isDateHolidayOrWeekend(selectedDate) ||
                    !title ||
                    !regulatoryAgency ||
                    concernDepartment.length === 0 ||
                    (recurrence !== 'none' && recurrence !== 'yearly' && !recurrenceEndDate)
                  }
                >
                  {isCreatingActivity || createActivity.isPending ? (
                    <>
                      Adding...
                    </>
                  ) : selectedDate && isDateHolidayOrWeekend(selectedDate) ? (
                    <>
                      {isDateHoliday(selectedDate) ? 'Holiday' : 'Weekend'}
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

        <Dialog open={isEditActivityOpen} onOpenChange={(open) => {
          setIsEditActivityOpen(open);
          if (!open) {
            resetEditActivityForm();
          }
        }}>
          <DialogContent
            className="max-w-2xl max-h-[90vh] overflow-visible flex flex-col"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DialogHeader className="shrink-0 pb-4 border-b">
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                Edit Activity
              </DialogTitle>
              <DialogDescription className="text-sm">
                Update the activity details for {editingActivity ? format(getCalendarDisplayDate(editingActivity), 'MMMM d, yyyy') : 'the selected date'}.
              </DialogDescription>
            </DialogHeader>
            <div className="h-[400px] overflow-y-auto py-4 px-6 pb-8 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1 h-4 bg-primary rounded-full"></span>
                    Basic Information
                  </h3>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="editTitle" className="text-sm font-medium">Title</Label>
                      <Input id="editTitle" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Submit Q1 Report" className="h-10 border border-gray-300 dark:border-gray-600" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editDescription" className="text-sm font-medium">Description</Label>
                      <Textarea id="editDescription" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Brief description of the activity" className="resize-none border border-gray-300 dark:border-gray-600" rows={2} />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                    Agency & Department
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Regulatory Agency</div>
                      <Select value={editRegulatoryAgency} onValueChange={setEditRegulatoryAgency}>
                        <SelectTrigger className="h-10 border border-gray-300 dark:border-gray-600">
                          <SelectValue placeholder="Select agency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DOE">DOE</SelectItem>
                          <SelectItem value="ERC">ERC</SelectItem>
                          <SelectItem value="IEMOP">IEMOP</SelectItem>
                          <SelectItem value="NEA">NEA</SelectItem>
                          <SelectItem value="NEA-WEB PORTAL">NEA-WEB PORTAL</SelectItem>
                          <SelectItem value="NGCP">NGCP</SelectItem>
                          <SelectItem value="PSALM">PSALM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Concern Department</div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            disabled={!editRegulatoryAgency}
                            className="h-10 w-full justify-between border border-gray-300 dark:border-gray-600 bg-background hover:bg-background text-foreground font-normal disabled:cursor-not-allowed disabled:opacity-100"
                            style={{ borderColor: 'rgb(209 213 219)' }}
                          >
                            {editConcernDepartment.length > 0 ? (
                              <span className="truncate">{editConcernDepartment.join(", ")}</span>
                            ) : (
                              <span className="text-muted-foreground">Select departments</span>
                            )}
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        {editRegulatoryAgency && (
                          <PopoverContent className="w-[300px] p-2" align="start">
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                                {editRegulatoryAgency} Departments
                              </div>
                              <div
                                className={cn(
                                  "space-y-1 pr-1 overscroll-contain",
                                  (AGENCY_DEPARTMENT_OPTIONS[editRegulatoryAgency]?.length ?? 0) > 8 &&
                                    "max-h-[260px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent",
                                )}
                                onWheelCapture={(event) => {
                                  if (event.currentTarget.scrollHeight <= event.currentTarget.clientHeight) {
                                    return;
                                  }

                                  event.preventDefault();
                                  event.currentTarget.scrollTop += event.deltaY;
                                }}
                              >
                                {AGENCY_DEPARTMENT_OPTIONS[editRegulatoryAgency]?.map((dept) => (
                                  <label key={dept} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded-md cursor-pointer">
                                    <Checkbox
                                      checked={editConcernDepartment.includes(dept)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setEditConcernDepartment([...editConcernDepartment, dept]);
                                        } else {
                                          setEditConcernDepartment(editConcernDepartment.filter((department) => department !== dept));
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
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1 h-4 bg-green-500 rounded-full"></span>
                    Report Details
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="editReportDetails" className="text-sm font-medium">Reports Detail</Label>
                    <Textarea id="editReportDetails" value={editReportDetails} onChange={(e) => setEditReportDetails(e.target.value)} placeholder="Details about the report to be submitted" className="resize-none border border-gray-300 dark:border-gray-600" rows={3} />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1 h-4 bg-orange-500 rounded-full"></span>
                    Deadline
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="editActivityDate" className="text-sm font-medium">Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="editActivityDate"
                          variant="outline"
                          className={cn(
                            "h-10 w-full justify-start text-left font-normal !border-gray-300 dark:!border-gray-600",
                            !editSelectedDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {editSelectedDate ? format(editSelectedDate, 'PPP') : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={editSelectedDate || undefined}
                          onSelect={(date) => date && setEditSelectedDate(date)}
                          initialFocus
                          holidays={calendarHolidays}
                          holidaysEnabled={holidaysEnabledData}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editTime" className="text-sm font-medium">Time</Label>
                    <TimePickerPopover id="editTime" value={editActivityTime} onChange={setEditActivityTime} />
                    <p className="text-xs text-muted-foreground">Changing date or time updates the recurring series the same way as moving an activity.</p>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="shrink-0 pt-4 mt-4">
              <div className="flex gap-3 w-full justify-end">
                <Button variant="outline" onClick={() => setIsEditActivityOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleEditActivity}
                  disabled={
                    isUpdatingActivity ||
                    !editSelectedDate ||
                    isDateHolidayOrWeekend(editSelectedDate) ||
                    !editTitle ||
                    !editRegulatoryAgency ||
                    editConcernDepartment.length === 0 ||
                    !hasEditActivityChanges
                  }
                >
                  {isUpdatingActivity ? (
                    <>Updating...</>
                  ) : editSelectedDate && isDateHolidayOrWeekend(editSelectedDate) ? (
                    <>{isDateHoliday(editSelectedDate) ? 'Holiday' : 'Weekend'}</>
                  ) : (
                    <>Update Activity</>
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
          const dayActs = allActivitiesByDateKey.get(getDateKey(dayActivitiesModalDate)) || [];
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
              <DialogContent className="flex h-[min(80vh,42rem)] max-h-[80vh] max-w-2xl flex-col overflow-visible">
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
                        disabled={holidaysEnabledData && isHoliday}
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
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                  <div className="box-border w-full space-y-2 py-4 pl-4 pr-4">
                  {paginatedActivities.length === 0 && !isHolidayOrWeekend ? (
                    <p className="text-center text-muted-foreground py-8">No activities for this day</p>
                  ) : paginatedActivities.length === 0 && isHolidayOrWeekend ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="w-full max-w-md">
                        <div className="p-6 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md text-left">
                          <p className="text-lg text-amber-800 dark:text-amber-200 font-medium mb-2">
                             {isHoliday ? `Holiday: ${getHolidayLabelForDate(calendarHolidays, dayActivitiesModalDate)}` : 'Weekend'}
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
                              "w-full min-w-0 overflow-hidden rounded-md border px-2.5 py-2 cursor-pointer hover:bg-muted/50 transition-colors",
                              getStatusBorderColor(activity.status)
                            )}
                            onClick={() => {
                              openActivityModal(activity);
                            }}
                          >
                        <div className="flex min-w-0 items-start gap-2">
                          {canDeleteActivities && (
                            <Checkbox
                              checked={selectedDayActivityIds.includes(activity.id)}
                              onCheckedChange={() => toggleDayActivitySelection(activity.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 shrink-0"
                            />
                          )}
                          <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1">
                            <span className="block min-w-0 self-center truncate font-medium">{activity.title}</span>
                            {activity.status !== 'completed' && activity.status !== 'late' ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 justify-self-end"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditActivityModal(activity);
                                }}
                                aria-label={`Edit ${activity.title}`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <div />
                            )}
                            {activity.description ? (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {activity.description}
                              </p>
                            ) : (
                              <div />
                            )}
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-xs shrink-0 justify-self-end self-start",
                              activity.status === 'completed' || activity.status === 'late' ? "bg-green-100 text-green-700" :
                              activity.status === 'overdue' ? "bg-red-100 text-red-700" :
                              activity.status === 'in-progress' ? "bg-blue-100 text-blue-700" :
                              "bg-orange-100 text-orange-700"
                            )}>
                              {activity.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                </div>
                <div className="shrink-0 bg-muted/10 p-4">
                  <div className="flex min-h-9 w-full items-center justify-between gap-2 sm:gap-4">
                    {selectedDayActivityIds.length > 0 ? (
                      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-h-9 w-full items-center justify-between gap-2 sm:w-auto sm:min-w-0 sm:justify-start sm:gap-3">
                          {dayActs.length > dayActivitiesPerPage ? (
                            <>
                              <p className="whitespace-nowrap text-sm text-muted-foreground">
                                Page {dayActivitiesPage} of {totalPages}
                              </p>
                              <div className="flex shrink-0 gap-1">
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
                          ) : null}
                        </div>
                        {canDeleteActivities ? (
                          <div className="flex min-h-9 w-full items-center justify-start gap-2 sm:ml-auto sm:w-auto sm:shrink-0 sm:justify-end">
                            <span className="hidden min-w-[84px] text-right text-sm text-muted-foreground sm:inline">
                              {selectedDayActivityIds.length} selected
                            </span>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="whitespace-nowrap"
                              onClick={() => {
                                setDeleteSelectionContext({
                                  type: 'day',
                                  ids: [...selectedDayActivityIds],
                                  label: `${selectedDayActivityIds.length} selected ${selectedDayActivityIds.length === 1 ? 'activity' : 'activities'} for ${format(dayActivitiesModalDate, 'MMMM d, yyyy')}`,
                                });
                                setActivityToDelete(null);
                                setShowDeleteConfirm(true);
                              }}
                              aria-label="Delete selected activities"
                              title="Delete selected activities"
                            >
                              Delete Selected
                            </Button>
                          </div>
                        ) : (
                          <div className="min-h-9" />
                        )}
                      </div>
                    ) : (
                      <>
                        <p className="whitespace-nowrap text-sm text-muted-foreground">
                          {dayActs.length > dayActivitiesPerPage ? `Page ${dayActivitiesPage} of ${totalPages}` : ""}
                        </p>
                        {dayActs.length > dayActivitiesPerPage ? (
                          <div className="flex shrink-0 gap-1">
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
                        ) : (
                          <div className="min-h-9" />
                        )}
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
            if (shouldRestoreActivitySearch) {
              ignoreActivitySearchOutsideClickUntilRef.current = Date.now() + 250;
            }
            setShouldRestoreActivitySearch(false);
            setSelectedFiles([]);
            setSubmissionRemarks("");
            setSelectedActivity(null);
            setIsLoadingSubmissions(false);
          }
        }}>
          <DialogContent className="max-h-[90vh] overflow-visible flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <div className="flex items-start justify-between gap-3 pr-8">
                <div className="min-w-0 flex-1 space-y-1">
                  <DialogTitle className="flex min-w-0 items-center gap-2">
                    <FileText className="w-5 h-5 shrink-0" />
                    <span className="min-w-0 break-words">{selectedActivity?.title}</span>
                  </DialogTitle>
                  <DialogDescription>
                    Submit your report for this activity
                  </DialogDescription>
                </div>
                {selectedActivity?.status !== 'completed' && selectedActivity?.status !== 'late' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => {
                      if (selectedActivity) {
                        openEditActivityModal(selectedActivity);
                      }
                    }}
                    aria-label={selectedActivity ? `Edit ${selectedActivity.title}` : "Edit activity"}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </DialogHeader>

            <div className="space-y-6 overflow-y-auto max-h-[calc(90vh-180px)] px-3 pb-3">
              {/* Activity Details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Description</h4>
                    <p className="text-sm">{selectedActivity?.description || 'No description provided'}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Regulatory Agency</h4>
                    <p className="text-sm">{selectedActivity?.regulatoryAgency || 'Not provided'}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Concern Department</h4>
                    <p className="text-sm">{selectedActivity?.concernDepartment || 'Not provided'}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Recurrence</h4>
                    <p className="text-sm">
                      {selectedActivity
                        ? getRecurrenceLabel(selectedActivity.recurrence)
                        : 'None'}
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Reports Detail</h4>
                    <p className="text-sm">{selectedActivity?.reportDetails || 'No reports detail provided'}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Deadline</h4>
                    <p className="text-sm">
                      {selectedActivity ? format(getCalendarDisplayDate(selectedActivity), 'PPP') : ''}
                    </p>
                  </div>
                </div>
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
                        holidays={calendarHolidays}
                        holidaysEnabled={holidaysEnabledData}
                      />
                    </PopoverContent>
                  </Popover>
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

              {/* Loading indicator for submissions */}
              {isLoadingSubmissions && (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading submitted files...</span>
                </div>
              )}

              {/* Submitted Files Section - Show files that have been submitted */}
              {activitySubmissions.length > 0 && !isLoadingSubmissions && (
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
                      name="activityFiles"
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

                  <div className="space-y-2">
                    <Label htmlFor="submissionRemarks" className="text-sm font-medium">Remarks</Label>
                    <Textarea
                      id="submissionRemarks"
                      name="submissionRemarks"
                      value={submissionRemarks}
                      onChange={(e) => setSubmissionRemarks(e.target.value)}
                      placeholder="Add remarks for this submission"
                      className="resize-none border border-gray-300 dark:border-gray-600"
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {(() => {
                const submissionRemarkEntries = activitySubmissions.filter((submission: any) => {
                  return typeof submission.notes === "string" && submission.notes.trim().length > 0;
                });

                if (submissionRemarkEntries.length === 0) {
                  return null;
                }

                return (
                  <div className="space-y-3 border-t pt-4">
                    <h4 className="font-medium text-sm">Remarks</h4>
                    <div className="space-y-2">
                      {submissionRemarkEntries.map((submission: any, index: number) => (
                        <div key={`${submission.id ?? index}-remark`} className="rounded-lg bg-muted/30 p-3">
                          <p className="whitespace-pre-wrap text-sm">{submission.notes}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
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
          <DialogContent className="flex h-[min(80vh,42rem)] max-h-[80vh] max-w-2xl flex-col overflow-visible">
            <DialogHeader className="shrink-0 pb-2">
              <div className="flex flex-col gap-3 pr-8">
                <DialogTitle className="whitespace-nowrap">
                  Activities at {timeSlotActivitiesModalData?.time}
                </DialogTitle>
                <div className="flex w-full flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={timeSlotActivitiesModalData ? (holidaysEnabledData && isDateHoliday(timeSlotActivitiesModalData.date)) : false}
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
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <div className="box-border w-full space-y-2 py-4 pl-4 pr-4">
                {timeSlotActivitiesModalData?.activities.length === 0 && timeSlotActivitiesModalData && !(isDateWeekend(timeSlotActivitiesModalData.date) || (holidaysEnabledData && isDateHoliday(timeSlotActivitiesModalData.date))) ? (
                  <p className="text-center text-muted-foreground py-8">No activities at this time</p>
                ) : timeSlotActivitiesModalData?.activities.length === 0 && timeSlotActivitiesModalData && (isDateWeekend(timeSlotActivitiesModalData.date) || (holidaysEnabledData && isDateHoliday(timeSlotActivitiesModalData.date))) ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-full max-w-md">
                      <div className="p-6 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md text-left">
                        <p className="text-lg text-amber-800 dark:text-amber-200 font-medium mb-2">
                          {isDateHoliday(timeSlotActivitiesModalData.date) ? `Holiday: ${getHolidayLabelForDate(calendarHolidays, timeSlotActivitiesModalData.date)}` : 'Weekend'}
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
                              "w-full min-w-0 overflow-hidden rounded-md border px-2.5 py-2 cursor-pointer hover:bg-muted/50 transition-colors",
                              getStatusBorderColor(activity.status)
                            )}
                            onClick={() => {
                              openActivityModal(activity);
                            }}
                          >
                            <div className="flex min-w-0 items-start gap-2">
                              {canDeleteActivities && (
                                <Checkbox
                                  checked={selectedTimeSlotActivityIds.includes(activity.id)}
                                  onCheckedChange={() => toggleTimeSlotActivitySelection(activity.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-2 shrink-0"
                                />
                              )}
                              <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1">
                                <span className="block min-w-0 self-center truncate font-medium">{activity.title}</span>
                                {activity.status !== 'completed' && activity.status !== 'late' ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 justify-self-end"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditActivityModal(activity);
                                    }}
                                    aria-label={`Edit ${activity.title}`}
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </Button>
                                ) : (
                                  <div />
                                )}
                                {activity.description ? (
                                  <p className="text-sm text-muted-foreground line-clamp-2">
                                    {activity.description}
                                  </p>
                                ) : (
                                  <div />
                                )}
                                <span className={cn(
                                  "px-2 py-0.5 rounded-full text-xs shrink-0 justify-self-end self-start",
                                  activity.status === 'completed' || activity.status === 'late' ? "bg-green-100 text-green-700" :
                                  activity.status === 'overdue' ? "bg-red-100 text-red-700" :
                                  activity.status === 'in-progress' ? "bg-blue-100 text-blue-700" :
                                  "bg-orange-100 text-orange-700"
                                )}>
                                  {activity.status}
                                </span>
                              </div>
                            </div>
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
                <div className="shrink-0 bg-muted/10 p-4">
                  <div className="flex min-h-9 w-full items-center justify-between gap-2 sm:gap-4">
                    {selectedTimeSlotActivityIds.length > 0 ? (
                      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-h-9 w-full items-center justify-between gap-2 sm:w-auto sm:min-w-0 sm:justify-start sm:gap-3">
                          {(timeSlotActivitiesModalData?.activities.length || 0) > timeSlotActivitiesPerPage ? (
                            <>
                              <p className="whitespace-nowrap text-sm text-muted-foreground">
                                Page {timeSlotActivitiesPage} of {totalPages}
                              </p>
                              <div className="flex shrink-0 gap-1">
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
                          ) : null}
                        </div>
                        {canDeleteActivities ? (
                          <div className="flex min-h-9 w-full items-center justify-start gap-2 sm:ml-auto sm:w-auto sm:shrink-0 sm:justify-end">
                            <span className="hidden min-w-[84px] text-right text-sm text-muted-foreground sm:inline">
                              {selectedTimeSlotActivityIds.length} selected
                            </span>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="whitespace-nowrap"
                              onClick={() => {
                                setDeleteSelectionContext({
                                  type: 'time',
                                  ids: [...selectedTimeSlotActivityIds],
                                  label: `${selectedTimeSlotActivityIds.length} selected ${selectedTimeSlotActivityIds.length === 1 ? 'activity' : 'activities'} at ${timeSlotActivitiesModalData?.time || ''}`,
                                });
                                setActivityToDelete(null);
                                setShowDeleteConfirm(true);
                              }}
                              aria-label="Delete selected activities"
                              title="Delete selected activities"
                            >
                              Delete Selected
                            </Button>
                          </div>
                        ) : (
                          <div className="min-h-9" />
                        )}
                      </div>
                    ) : (
                      <>
                        <p className="whitespace-nowrap text-sm text-muted-foreground">
                          {(timeSlotActivitiesModalData?.activities.length || 0) > timeSlotActivitiesPerPage ? `Page ${timeSlotActivitiesPage} of ${totalPages}` : ""}
                        </p>
                        {(timeSlotActivitiesModalData?.activities.length || 0) > timeSlotActivitiesPerPage ? (
                          <div className="flex shrink-0 gap-1">
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
                        ) : (
                          <div className="min-h-9" />
                        )}
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
                disabled={
                  (deleteSelectionContext !== null &&
                    confirmDeletingSelectionType === deleteSelectionContext.type) ||
                  confirmDeletingActivityId === activityToDelete?.id
                }
              >
                {(deleteSelectionContext !== null &&
                  confirmDeletingSelectionType === deleteSelectionContext.type) ||
                confirmDeletingActivityId === activityToDelete?.id
                  ? "Deleting..."
                  : "Delete"}
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

      <div
        ref={monthCalendarContainerRef}
        className="bg-card rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden"
      >
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
                    <Button variant="outline" size="icon" onClick={() => handleCalendarNavigation(-1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handleCalendarNavigation(1)}>
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

            <div className="relative" ref={activitySearchRef}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="activity-search"
                  name="activitySearch"
                  value={activitySearchQuery}
                  onChange={(e) => {
                    setActivitySearchQuery(e.target.value);
                    setIsActivitySearchOpen(e.target.value.trim().length > 0);
                  }}
                  onFocus={() => {
                    if (activitySearchQuery.trim().length > 0) {
                      setIsActivitySearchOpen(true);
                    }
                  }}
                  placeholder="Search activities by title, description, agency, or department"
                  className="h-10 border border-gray-300 pl-10 pr-10 dark:border-gray-600"
                />
                {activitySearchQuery.length > 0 && (
                  <button
                    type="button"
                  onClick={() => {
                      setActivitySearchQuery("");
                      setIsActivitySearchOpen(false);
                      setShouldRestoreActivitySearch(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Clear activity search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {activitySearchQuery.trim().length > 0 && isActivitySearchOpen && (
                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-background shadow-lg dark:border-gray-800">
                  <div className="max-h-96 overflow-y-auto overscroll-contain p-2">
                    {searchedActivities.length > 0 ? (
                      searchedActivities.map((activity) => {
                        const activityDate = getCurrentCalendarDisplayDate(activity);

                        return (
                          <button
                            key={activity.id}
                            type="button"
                            onClick={() => {
                              setCurrentDate(activityDate);
                              setSelectedDate(activityDate);
                              openActivityModal(activity, { restoreSearch: true });
                            }}
                            className="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
                          >
                            <div className="min-w-0 space-y-1">
                              <p className="truncate text-sm font-medium text-foreground">{activity.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(activityDate, 'MMM d, yyyy h:mm a')}
                              </p>
                              {(activity.regulatoryAgency || activity.concernDepartment) && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {[activity.regulatoryAgency, activity.concernDepartment].filter(Boolean).join(' | ')}
                                </p>
                              )}
                            </div>
                            <span className={cn(
                              "mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              activity.status === 'completed' || activity.status === 'late'
                                ? "bg-green-100 text-green-700"
                                : activity.status === 'overdue'
                                  ? "bg-red-100 text-red-700"
                                  : activity.status === 'in-progress'
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-orange-100 text-orange-700"
                            )}>
                              {activity.status === 'late'
                                ? 'Late Submitted'
                                : activity.status === 'in-progress'
                                  ? 'In Progress'
                                  : activity.status
                                    ? activity.status.charAt(0).toUpperCase() + activity.status.slice(1)
                                    : 'Pending'}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No matching activities found.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden">
          <AnimatePresence
            custom={{ direction: calendarTransitionDirection, reduceMotion: prefersReducedMotion }}
            initial={false}
            mode="wait"
          >
            <motion.div
              key={calendarTransitionKey}
              custom={{ direction: calendarTransitionDirection, reduceMotion: prefersReducedMotion }}
              variants={calendarNavigationVariants}
              initial="enter"
              animate="center"
              exit="exit"
              style={{ willChange: prefersReducedMotion ? "auto" : "transform, opacity" }}
            >
        {/* Calendar Grid - Month View */}
{view === 'month' && (
  <>
      {/* Header */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-800">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div
            key={day}
            className="border-r bg-muted/5 py-2 text-center text-[11px] font-semibold text-muted-foreground last:border-r-0 sm:py-3 sm:text-sm dark:bg-muted/20"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div
        className="grid min-h-0 grid-cols-7 select-none"
        onClick={() => setSelectedDate(null)}
        key={holidaysKey}
        style={{ gridAutoRows: `${MONTH_VIEW_DAY_CELL_HEIGHT}px` }}
      >
        {/* Padding */}
        {paddingDays.map((_, i) => (
          <div
            key={`padding-${i}`}
            className="h-full border-b border-r border-gray-200 bg-muted/5 last:border-r-0 dark:border-gray-800 dark:bg-muted/10"
          />
        ))}

        {/* Days */}
        {daysInMonth.map((date) => {
          const dayActivities = filteredActivitiesByDateKey.get(getDateKey(date)) || [];
          const holidayLabelForDate = showHolidayIndicators
            ? getHolidayLabelForDate(calendarHolidays, date)
            : "";
          const monthVisibleActivitiesLimit = holidayLabelForDate
            ? Math.max(MONTH_VIEW_VISIBLE_ACTIVITIES - 1, 1)
            : MONTH_VIEW_VISIBLE_ACTIVITIES;
          const showMonthDragPreview = Boolean(
            draggedActivity &&
            dropTargetDate &&
            !dropTargetTime &&
            isSameDay(date, dropTargetDate)
          );
          const visibleMonthActivities = dayActivities.slice(0, monthVisibleActivitiesLimit);
          const monthPreviewIndex = draggedActivity
            ? Math.max(visibleMonthActivities.findIndex((activity) => activity.id === draggedActivity.id), 0)
            : 0;
          const monthPreviewTopOffset = monthPreviewIndex * 28;

          const indicators = getDateIndicators(date);

          const dayCellStripe =
            dayActivities.length > 0
              ? getDayCellStatusStripe(dayActivities)
              : { stripeClass: '', style: undefined };

          const isLastDayOfMonth = isSameDay(date, endOfMonth(date));

          return (
            <div
              key={date.toISOString()}
              data-date={date.toISOString()}
              data-drop-target="date"
             className={cn(
                "relative flex h-full flex-col overflow-hidden border-b border-r border-gray-200 bg-muted/5 px-1 py-1.5 transition-colors cursor-pointer select-none hover:bg-primary/10 sm:px-2 sm:py-2 dark:border-gray-800 dark:bg-muted/10",
                 !isLastDayOfMonth && "last:border-r-0",
                 selectedDate &&
                   isSameDay(date, selectedDate) &&
                   "bg-primary/5",
                  indicators.isHoliday && "bg-red-50 dark:bg-red-950/20"
                )}
                onMouseDown={handleCalendarCellMouseDown}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDateClick(date);
                }}
                onDragOver={(e) => handleDateDragOver(e, date)}
               onDragLeave={() => {
                 setDropTargetDate(null);
                 setDropTargetTime(null);
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
                  "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium sm:mb-2 sm:h-7 sm:w-7 sm:text-sm",
                  isToday(date)
                    ? "bg-primary text-white shadow-sm"
                    : indicators.isHoliday
                    ? "bg-red-500 text-white shadow-sm"
                    : "text-muted-foreground"
                )}
              >
                {format(date, 'd')}
              </div>

              {holidayLabelForDate && (
                <div
                  className="mb-1 truncate whitespace-nowrap text-[10px] font-semibold leading-tight text-red-700 dark:text-red-300"
                  title={holidayLabelForDate}
                >
                  {holidayLabelForDate}
                </div>
              )}

              {/* Activities */}
              <div className="relative mt-1 flex-1 overflow-hidden">
                {showMonthDragPreview && draggedActivity && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-20"
                    style={{ top: `${monthPreviewTopOffset}px` }}
                  >
                    <ActivityDragPreviewCard activity={draggedActivity} variant="month" />
                  </div>
                )}
                {visibleMonthActivities.map((activity) => (
                  <div
                    key={activity.id}
                    data-activity-drag-handle="true"
                    onMouseDown={(e) => handleActivityMouseDown(activity, e)}
                    onClick={(e) => {
                      if (consumeSuppressedActivityClick(activity.id)) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      e.stopPropagation();
                      openActivityModal(activity);
                    }}
                    className={cn(
                      "mb-1 hidden h-6 truncate rounded-md border px-1.5 py-1 text-left text-xs font-medium transition-opacity hover:opacity-80 sm:block cursor-pointer",
                      getStatusColor(activity.status),
                      "bg-muted/30 dark:bg-muted/20 border-gray-200",
                      getStatusBorderColor?.(activity.status),
                      draggedActivity?.id === activity.id &&
                        "opacity-50 cursor-move"
                    )}
                  >
                    {activity.title}
                  </div>
                ))}
                {dayActivities.length > monthVisibleActivitiesLimit && (
                  <button
                    type="button"
                    className="hidden h-5 select-none text-xs font-medium text-muted-foreground transition-colors hover:text-primary sm:block"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDayActivitiesModalDate(date);
                      setDayActivitiesPage(1);
                      setShowDayActivitiesModal(true);
                    }}
                    >
                      {dayActivities.length - monthVisibleActivitiesLimit} more
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
            className="h-full border-b border-r border-gray-200 bg-muted/5 last:border-r-0 dark:border-gray-800 dark:bg-muted/10"
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
              if (consumeSuppressedActivityClick(activity.id)) {
                return;
              }
              openActivityModal(activity);
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
            onActivityMouseDown={handleActivityMouseDown}
            onTimeSlotDragOver={handleTimeSlotDragOver}
            onTimeSlotDragLeave={handleTimeSlotDragLeave}
            onTimeSlotDrop={handleTimeSlotDrop}
            onDayClick={handleDayClickInWeekView}
            getCalendarDisplayDate={getCurrentCalendarDisplayDate}
            holidays={calendarHolidays}
            holidaysEnabled={showHolidayIndicators}
            scrollAreaRef={weekScrollAreaRef}
            contentHeight={calendarViewContentHeight}
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
              if (consumeSuppressedActivityClick(activity.id)) {
                return;
              }
              openActivityModal(activity);
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
            onActivityMouseDown={handleActivityMouseDown}
            onTimeSlotDragOver={handleTimeSlotDragOver}
            onTimeSlotDragLeave={handleTimeSlotDragLeave}
            onTimeSlotDrop={handleTimeSlotDrop}
            // Touch handlers
            onTouchDragStart={handleTouchDragStart}
            onTouchDragMove={handleTouchDragMove}
            onTouchDragEnd={handleTouchDragEnd}
            getCalendarDisplayDate={getCurrentCalendarDisplayDate}
            scrollAreaRef={dayScrollAreaRef}
            contentHeight={calendarViewContentHeight}
            // New activity modal handlers
            setIsNewActivityOpen={setIsNewActivityOpen}
            setShowTimeSlotActivitiesModal={setShowTimeSlotActivitiesModal}
            setTimeSlotActivitiesModalData={setTimeSlotActivitiesModalData}
            setSelectedDate={setSelectedDate}
            setActivityTime={setActivityTime}
            holidays={calendarHolidays}
            holidaysEnabled={showHolidayIndicators}
          />
        )}
            </motion.div>
          </AnimatePresence>
        </div>
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
                <ScrollArea className="h-full mr-3">
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
                          const activityDate = getCurrentCalendarDisplayDate(activity);
                          setCurrentDate(activityDate);
                          openActivityModal(activity, { focusDate: activityDate });
                        }}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors",
                          getStatusColor(activity.status),
                          "bg-muted/30 dark:bg-muted/20 border-gray-200",
                          getStatusBorderColor(activity.status)
                        )}
                      >
                        <div className="font-medium text-sm">{activity.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Due: {format(getCurrentCalendarDisplayDate(activity), 'MMM d, yyyy')}
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
                          const activityDate = getCurrentCalendarDisplayDate(activity);
                          setCurrentDate(activityDate);
                          openActivityModal(activity, { focusDate: activityDate });
                        }}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors",
                          getStatusColor(activity.status),
                          "bg-muted/30 dark:bg-muted/20 border-gray-200",
                          getStatusBorderColor(activity.status)
                        )}
                      >
                        <div className="font-medium text-sm">{activity.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(getCurrentCalendarDisplayDate(activity), 'EEE, MMM d')}
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
                <ScrollArea className="flex-1 mr-3">
                  <div className="space-y-2 pl-4 pr-4 pb-2">
                    {paginatedActivities.map(activity => (
                      <button
                        key={activity.id}
                        onClick={() => {
                          const activityDate = getCurrentCalendarDisplayDate(activity);
                          setCurrentDate(activityDate);
                          openActivityModal(activity, { focusDate: activityDate });
                        }}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors",
                          getStatusColor(activity.status),
                          "bg-muted/30 dark:bg-muted/20 border-gray-200",
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
                            Due: {format(getCurrentCalendarDisplayDate(activity), 'MMM d, yyyy')}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                   </ScrollArea>
                   
                    {/* Pagination - only show if more than 10 activities */}
                    {filtered.length > itemsPerPage && (
                      <div className="flex items-center justify-between p-4 bg-muted/10">
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

        {/* Recurring Activities & Holiday Management Panel */}
        <div className="flex flex-col gap-8 mt-8">
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
                              if (addRecurringActivityTitles.length === 0) {
                                return <p className="text-sm text-muted-foreground p-2">No activities found</p>;
                              }

                              const allSelected = addRecurringActivityTitles.every(title => addRecurTitles.includes(title));

                              return (
                                <>
                                  <div className="flex items-center space-x-2 p-2 hover:bg-muted rounded border-b">
                                    <Checkbox
                                      id="add-activity-select-all"
                                      checked={allSelected}
                                      onCheckedChange={(checked) => {
                                        setAddRecurTitles(checked ? addRecurringActivityTitles : []);
                                        setAddRecurYears([]);
                                        setAddRecurPreview([]);
                                      }}
                                    />
                                    <Label
                                      htmlFor="add-activity-select-all"
                                      className="text-sm font-medium cursor-pointer flex-1"
                                    >
                                      Select All
                                    </Label>
                                  </div>
                                  {addRecurringActivityTitles.map(title => (
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
                                  ))}
                                </>
                              );
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

                              const selectedOriginalActivities = addRecurTitles
                                .map((title) => activities?.find((activity) =>
                                  activity.title === title &&
                                  activity.recurrence &&
                                  addRecurTypes.includes(activity.recurrence)
                                ))
                                .filter((activity): activity is NonNullable<typeof activity> => Boolean(activity));

                              const currentYear = new Date().getFullYear();
                              const nextAvailableStartYear = selectedOriginalActivities.length > 0
                                ? Math.min(...selectedOriginalActivities.map((originalActivity) => {
                                    const latestYearInSeries = (activities || [])
                                      .filter((activity) =>
                                        activity.title === originalActivity.title &&
                                        activity.recurrence === originalActivity.recurrence &&
                                        activity.regulatoryAgency === originalActivity.regulatoryAgency &&
                                        activity.concernDepartment === originalActivity.concernDepartment &&
                                        activity.userId === originalActivity.userId
                                      )
                                      .map((activity) => new Date(activity.deadlineDate).getFullYear())
                                      .reduce((latestYear, year) => Math.max(latestYear, year), currentYear);

                                    return latestYearInSeries + 1;
                                  }))
                                : currentYear + 1;
                              const futureYears = Array.from({ length: 5 }, (_, i) => nextAvailableStartYear + i).filter((year) =>
                                selectedOriginalActivities.some((originalActivity) =>
                                  getActivitiesCountForYear(originalActivity, year, activities || []) > 0
                                )
                              );

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
                           const activitiesForYear = generateRecurringActivitiesForYear(originalActivity, year, activities || []);
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
                            count += getActivitiesCountForYear(originalActivity, year, activities || []);
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
                          monthlyPattern: activity.monthlyPattern || null,
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
                              if (deleteRecurringActivityTitles.length === 0) {
                                return <p className="text-sm text-muted-foreground p-2">No activities found</p>;
                              }

                              const allSelected = deleteRecurringActivityTitles.every(title => deleteRecurTitles.includes(title));

                              return (
                                <>
                                  <div className="flex items-center space-x-2 p-2 hover:bg-muted rounded border-b">
                                    <Checkbox
                                      id="delete-activity-select-all"
                                      checked={allSelected}
                                      onCheckedChange={(checked) => {
                                        setDeleteRecurTitles(checked ? deleteRecurringActivityTitles : []);
                                        setDeleteRecurYears([]);
                                        setDeleteRecurPreview([]);
                                      }}
                                    />
                                    <Label
                                      htmlFor="delete-activity-select-all"
                                      className="text-sm font-medium cursor-pointer flex-1"
                                    >
                                      Select All
                                    </Label>
                                  </div>
                                  {deleteRecurringActivityTitles.map(title => (
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
                                  ))}
                                </>
                              );
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
                      name="holidayNamePanel"
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
                            holidays={calendarHolidays}
                            holidaysEnabled={holidaysEnabledData}
                          />
                        </PopoverContent>
                    </Popover>
                  </div>
                  <PhilippinesHolidaySection
                    checkboxId="holiday-philippines-panel"
                    checked={showPhilippineHolidays}
                    onCheckedChange={handleShowPhilippineHolidaysChange}
                    isLoading={isLoadingPhilippineHolidays}
                    error={philippineHolidaysError}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={async () => {
                        if (!holidayName || !holidayDate) return;

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
                          resetHolidayForm();
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
                          resetHolidayForm();
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
              <div className="border rounded-lg overflow-hidden flex self-start flex-col">
                <div className="shrink-0 p-4 pb-0">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
                    <span className="w-1 h-4 bg-green-500 rounded-full"></span>
                    EXISTING HOLIDAYS
                  </h4>
                </div>
                {holidays && holidays.length > 0 ? (
                  <>
                    <div className="px-4">
                      <ScrollArea className={showHolidayPagination ? "h-[248px]" : "max-h-[300px]"}>
                        <div className="space-y-2 pr-4 pb-2">
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
                        </div>
                      </ScrollArea>
                    </div>
                    {showHolidayPagination && (
                      <div className="flex items-center justify-between bg-muted/10 p-4">
                        <p className="text-sm text-muted-foreground">
                          Page {holidayPage} of {totalHolidayPages}
                        </p>
                        <div className="flex gap-1">
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
                            onClick={() => setHolidayPage(p => Math.min(totalHolidayPages, p + 1))}
                            disabled={holidayPage === totalHolidayPages}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No holidays configured yet
                  </p>
                )}
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
  getCalendarDisplayDate,
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
  onActivityMouseDown,
  onTimeSlotDragOver,
  onTimeSlotDragLeave,
  onTimeSlotDrop,
  // Touch handlers
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  onDayClick,
  getStatusBorderColor,
  getMultiStatusBorderColor,
  holidays,
  holidaysEnabled,
  scrollAreaRef,
  contentHeight,
  // New activity modal handlers
  setIsNewActivityOpen,
  setShowTimeSlotActivitiesModal,
  setTimeSlotActivitiesModalData,
  setSelectedDate,
  setActivityTime
}: {
  currentDate: Date;
  activities: any[];
  getCalendarDisplayDate: (activity: any) => Date;
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
  onActivityMouseDown?: (activity: any, e: React.MouseEvent<HTMLElement>) => void;
  onTimeSlotDragOver?: (e: React.DragEvent, date: Date, time: string) => void;
  onTimeSlotDragLeave?: (e: React.DragEvent) => void;
  onTimeSlotDrop?: (e: React.DragEvent, date: Date, time: string) => void;
  // Touch handlers
  onTouchDragStart?: (activity: any, e: React.TouchEvent) => void;
  onTouchDragMove?: (e: React.TouchEvent) => void;
  onTouchDragEnd?: (e: React.TouchEvent) => void;
  onDayClick?: (date: Date) => void;
  holidays?: any[];
  holidaysEnabled?: boolean;
  scrollAreaRef?: React.RefObject<HTMLDivElement>;
  contentHeight: number;
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
  const getDayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const weekDayKeys = weekDays.map(getDayKey);
  const weekDayKeySet = new Set(weekDayKeys);
  const weekHeaderHolidayDate = selectedDate ?? currentDate;
  const weekHeaderHolidayLabel = holidaysEnabled && weekDays.some((day) => isSameDay(day, weekHeaderHolidayDate))
    ? getHolidayLabelForDate(holidays, weekHeaderHolidayDate)
    : "";

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

  const activitiesByWeekSlot = new Map<string, any[]>();
  activities.forEach((activity) => {
    const displayDate = getCalendarDisplayDate(activity);
    const dayKey = getDayKey(displayDate);
    if (!weekDayKeySet.has(dayKey)) return;

    const slotKey = `${dayKey}-${getActivityHour(activity)}`;
    const existingActivities = activitiesByWeekSlot.get(slotKey);
    if (existingActivities) {
      existingActivities.push(activity);
    } else {
      activitiesByWeekSlot.set(slotKey, [activity]);
    }
  });

  return (
    <div className="flex min-h-0 flex-col" style={{ height: `${contentHeight}px` }}>
      <div
        data-drop-target-suppress="true"
        className="z-30 border-b border-gray-200 bg-card dark:border-gray-800 dark:bg-card"
      >
        <div className="mr-3 grid grid-cols-[44px_repeat(7,minmax(0,1fr))] pr-4 sm:grid-cols-8">
          <div className="flex items-center justify-center border-r px-1 py-1.5 text-center sm:px-2 sm:py-2">
            {weekHeaderHolidayLabel && (
              <div className="truncate text-xs font-semibold leading-tight text-red-600 dark:text-red-400" title={weekHeaderHolidayLabel}>
                {weekHeaderHolidayLabel}
              </div>
            )}
          </div>
          {weekDays.map((day) => {
            const isHoliday = Boolean(holidaysEnabled && getHolidayLabelForDate(holidays, day));
            const isWeekend = day.getDay() === 0 || day.getDay() === 6; // Sunday = 0, Saturday = 6

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "cursor-pointer border-r border-gray-200 p-1 text-center transition-colors select-none hover:bg-muted/50 sm:p-2 dark:border-gray-800",
                  isToday(day) && "bg-primary/10",
                  isHoliday && "bg-red-50 dark:bg-red-950/20"
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onDayClick?.(day)}
              >
                <div className={cn(
                  "text-[10px] font-semibold sm:text-xs",
                  isToday(day) ? "text-primary" : isHoliday ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                )}>{format(day, 'EEE')}</div>
                <div className={cn(
                  "text-sm font-semibold sm:text-lg",
                  isToday(day) && "mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white sm:h-8 sm:w-8",
                  !isToday(day) && isHoliday && "text-red-600 dark:text-red-400"
                )}>
                  {format(day, 'd')}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <ScrollArea ref={scrollAreaRef} className="mr-3 min-h-0 flex-1 pr-4">
        <div className="h-full">
          <div 
            className="relative cursor-default select-none"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                onClearSelection?.();
              }
            }}
          >
            {hours.map((hour) => {
              const timeString = `${hour.toString().padStart(2, '0')}:00`;
              
              return (
                <div key={hour} className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] border-b border-gray-100 sm:grid-cols-8 dark:border-gray-800">
                  <div className="border-r p-1.5 pr-1 text-right text-[10px] text-muted-foreground sm:p-2 sm:pr-3 sm:text-xs">
                    {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                  </div>
                  {weekDays.map((day, dayIndex) => {
                    const dayHourActivities = activitiesByWeekSlot.get(`${weekDayKeys[dayIndex]}-${hour}`) ?? [];
                    const visibleWeekActivities = dayHourActivities.slice(0, WEEK_VIEW_VISIBLE_ACTIVITIES);
                    const compactVisibleWeekActivities = dayHourActivities.slice(0, 1);
                    const hiddenWeekActivitiesCount = Math.max(0, dayHourActivities.length - visibleWeekActivities.length);
                    const compactHiddenWeekActivitiesCount = Math.max(0, dayHourActivities.length - compactVisibleWeekActivities.length);
                    const showSlotDragPreview = Boolean(
                      draggedActivity &&
                      dropTargetDate &&
                      dropTargetTime === timeString &&
                      isSameDay(day, dropTargetDate)
                    );
                    const draggedActivityDisplayDate = draggedActivity ? getCalendarDisplayDate(draggedActivity) : null;
                    const isDraggedActivityInCurrentSlot = Boolean(
                      draggedActivity &&
                      draggedActivityDisplayDate &&
                      isSameDay(draggedActivityDisplayDate, day) &&
                      getActivityHour(draggedActivity) === hour
                    );
                    const draggedActivityVisibleIndex = draggedActivity
                      ? visibleWeekActivities.findIndex((activity) => activity.id === draggedActivity.id)
                      : -1;
                    const draggedActivityCompactVisibleIndex = draggedActivity
                      ? compactVisibleWeekActivities.findIndex((activity) => activity.id === draggedActivity.id)
                      : -1;
                    const showOriginalSlotGhostPreview = Boolean(
                      showSlotDragPreview &&
                      draggedActivity &&
                      isDraggedActivityInCurrentSlot &&
                      (draggedActivityVisibleIndex >= 0 || draggedActivityCompactVisibleIndex >= 0)
                    );
                    const weekSlotPreviewActivities = showSlotDragPreview && draggedActivity
                      ? showOriginalSlotGhostPreview
                        ? [draggedActivity]
                        : Array.from(
                            new Map(
                              (isDraggedActivityInCurrentSlot ? dayHourActivities : [...dayHourActivities, draggedActivity])
                                .map((activity) => [activity.id, activity])
                            ).values()
                          )
                      : [];
                    const weekSlotPreviewColumnCount = showOriginalSlotGhostPreview
                      ? visibleWeekActivities.length + (hiddenWeekActivitiesCount > 0 ? 1 : 0)
                      : undefined;
                    const weekSlotPreviewCompactColumnCount = showOriginalSlotGhostPreview
                      ? compactVisibleWeekActivities.length + (compactHiddenWeekActivitiesCount > 0 ? 1 : 0)
                      : undefined;
                    const timeSlotStripe = getTimeSlotStatusStripe(dayHourActivities);
                    
                    return (
                       <div 
                         key={`${day.toISOString()}-${hour}`}
                         data-date={day.toISOString()}
                         data-time-slot={timeString}
                         data-drop-target="time"
                          className={cn(
                            "relative overflow-hidden border-r p-0.5 cursor-pointer transition-colors select-none hover:bg-primary/10 hover:ring-1 hover:ring-primary/30 sm:p-1",
                            isToday(day) && "bg-primary/5",
                            selectedDate && isSameDay(day, selectedDate) && "bg-primary/10",
                            selectedTimeSlot === timeString && selectedDate && isSameDay(day, selectedDate) && "bg-primary/5"
                          )}
                          style={{ height: `${WEEK_VIEW_TIME_SLOT_HEIGHT}px` }}
                         onMouseDown={handleCalendarCellMouseDown}
                         onClick={() => {
                           onDateSelect(day);
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
                        {showSlotDragPreview && draggedActivity && (
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute bottom-[2px] left-[6px] right-[6px] top-[6px] z-20 sm:bottom-1 sm:left-2 sm:right-2 sm:top-2"
                          >
                            <WeekTimeSlotActivityColumns
                              activities={weekSlotPreviewActivities}
                              getStatusColor={getStatusColor}
                              getStatusBorderColor={getStatusBorderColor}
                              onActivityClick={onActivityClick}
                              preview
                              previewGridColumnCount={weekSlotPreviewColumnCount}
                              previewColumnIndex={showOriginalSlotGhostPreview && draggedActivityVisibleIndex >= 0 ? draggedActivityVisibleIndex : undefined}
                              previewCompactGridColumnCount={weekSlotPreviewCompactColumnCount}
                              previewCompactColumnIndex={showOriginalSlotGhostPreview && draggedActivityCompactVisibleIndex >= 0 ? draggedActivityCompactVisibleIndex : undefined}
                            />
                          </div>
                        )}
                        <div className={cn(
                          "flex h-full flex-col px-1",
                          dayHourActivities.length > 0 ? "justify-start pt-1" : "justify-center"
                        )}>
                          <WeekTimeSlotActivityColumns
                            activities={dayHourActivities}
                            draggedActivity={draggedActivity}
                            getStatusColor={getStatusColor}
                            getStatusBorderColor={getStatusBorderColor}
                            onActivityMouseDown={onActivityMouseDown}
                            onTouchDragStart={onTouchDragStart}
                            onTouchDragMove={onTouchDragMove}
                            onTouchDragEnd={onTouchDragEnd}
                            onActivityClick={onActivityClick}
                            onOverflowClick={(e) => {
                              e.stopPropagation();
                              setShowTimeSlotActivitiesModal?.(true);
                              setTimeSlotActivitiesModalData?.({ date: day, time: timeString, activities: dayHourActivities });
                            }}
                          />
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
      </div>
  );
}

// Day View Component
function DayView({
  currentDate,
  activities,
  getCalendarDisplayDate,
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
  onActivityMouseDown,
  onTimeSlotDragOver,
  onTimeSlotDragLeave,
  onTimeSlotDrop,
  // Touch handlers
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  holidays,
  holidaysEnabled,
  scrollAreaRef,
  contentHeight,
  // New activity modal handlers
  setIsNewActivityOpen,
  setShowTimeSlotActivitiesModal,
  setTimeSlotActivitiesModalData,
  setSelectedDate,
  setActivityTime
}: {
  currentDate: Date;
  activities: any[];
  getCalendarDisplayDate: (activity: any) => Date;
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
  onActivityMouseDown?: (activity: any, e: React.MouseEvent<HTMLElement>) => void;
  onTimeSlotDragOver?: (e: React.DragEvent, date: Date, time: string) => void;
  onTimeSlotDragLeave?: (e: React.DragEvent) => void;
  onTimeSlotDrop?: (e: React.DragEvent, date: Date, time: string) => void;
  // Touch handlers
  onTouchDragStart?: (activity: any, e: React.TouchEvent) => void;
  onTouchDragMove?: (e: React.TouchEvent) => void;
  onTouchDragEnd?: (e: React.TouchEvent) => void;
  holidays?: any[];
  holidaysEnabled?: boolean;
  scrollAreaRef?: React.RefObject<HTMLDivElement>;
  contentHeight: number;
  // New activity modal handlers
  setIsNewActivityOpen?: (open: boolean) => void;
  setShowTimeSlotActivitiesModal?: (open: boolean) => void;
  setTimeSlotActivitiesModalData?: (data: { date: Date; time: string; activities: any[] } | null) => void;
  setSelectedDate?: (date: Date | null) => void;
  setActivityTime?: (time: string) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const dayActivities = activities.filter(a => isSameDay(getCalendarDisplayDate(a), currentDate));
  const holidayLabelForCurrentDate = holidaysEnabled
    ? getHolidayLabelForDate(holidays, currentDate)
    : "";

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
    <div className="flex min-h-0 flex-col" style={{ height: `${contentHeight}px` }}>
      <div
        data-drop-target-suppress="true"
        className={cn(
          "border-b border-gray-200 bg-muted/20 dark:border-gray-800",
          holidayLabelForCurrentDate && "bg-red-50/70 dark:bg-red-950/20"
        )}
      >
        <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 py-1 pr-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,7fr)_auto] sm:py-2">
          <div className="flex flex-col items-center justify-center pl-4 leading-none text-center sm:pl-5">
            <div className={cn(
              "text-[10px] font-semibold uppercase sm:text-xs",
              holidayLabelForCurrentDate
                ? "text-red-600 dark:text-red-400"
                : isToday(currentDate)
                  ? "text-primary"
                  : "text-muted-foreground"
            )}>{format(currentDate, 'EEE')}</div>
            <div className={cn(
              "mt-0.5 text-sm font-semibold sm:text-lg",
              holidayLabelForCurrentDate && "text-red-600 dark:text-red-400"
            )}>{format(currentDate, 'd')}</div>
          </div>
          <div className="min-w-0 border-r border-gray-200 text-center dark:border-gray-800">
            {holidayLabelForCurrentDate && (
              <div className="truncate text-sm font-semibold text-red-600 dark:text-red-400" title={holidayLabelForCurrentDate}>
                {holidayLabelForCurrentDate}
              </div>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {dayActivities.length} {dayActivities.length === 1 ? 'activity' : 'activities'}
          </div>
        </div>
      </div>

      <ScrollArea ref={scrollAreaRef} className="mr-3 min-h-0 flex-1 pr-4">
        <div className="h-full">
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
          const visibleHourActivities = hourActivities.slice(0, DAY_VIEW_VISIBLE_ACTIVITIES);
          const hiddenHourActivitiesCount = Math.max(0, hourActivities.length - visibleHourActivities.length);
          const timeString = `${hour.toString().padStart(2, '0')}:00`;
          const showSlotDragPreview = Boolean(
            draggedActivity &&
            dropTargetDate &&
            dropTargetTime === timeString &&
            isSameDay(dropTargetDate, currentDate)
          );
          const draggedActivityDisplayDate = draggedActivity ? getCalendarDisplayDate(draggedActivity) : null;
          const isDraggedActivityInCurrentSlot = Boolean(
            draggedActivity &&
            draggedActivityDisplayDate &&
            isSameDay(draggedActivityDisplayDate, currentDate) &&
            getActivityHour(draggedActivity) === hour
          );
          const draggedActivityVisibleIndex = draggedActivity
            ? visibleHourActivities.findIndex((activity) => activity.id === draggedActivity.id)
            : -1;
          const showOriginalSlotGhostPreview = Boolean(
            showSlotDragPreview &&
            draggedActivity &&
            isDraggedActivityInCurrentSlot &&
            draggedActivityVisibleIndex >= 0
          );
          const daySlotPreviewActivities = showSlotDragPreview && draggedActivity
            ? showOriginalSlotGhostPreview
              ? [draggedActivity]
              : Array.from(
                new Map(
                  (isDraggedActivityInCurrentSlot ? hourActivities : [...hourActivities, draggedActivity])
                    .map((activity) => [activity.id, activity])
                ).values()
              )
            : [];
          const daySlotPreviewColumnCount = showOriginalSlotGhostPreview
            ? visibleHourActivities.length + (hiddenHourActivitiesCount > 0 ? 1 : 0)
            : undefined;
          const timeSlotStripe = getTimeSlotStatusStripe(hourActivities);
          
          return (
            <div
              key={hour}
              className="grid grid-cols-[44px_minmax(0,1fr)] border-b border-gray-100 sm:grid-cols-[minmax(0,1fr)_minmax(0,7fr)] dark:border-gray-800"
              style={{ height: `${WEEK_VIEW_TIME_SLOT_HEIGHT}px` }}
            >
              <div className="flex h-full items-start justify-end border-r p-1.5 pr-1 text-right text-[10px] text-muted-foreground sm:p-2 sm:pr-3 sm:text-xs">
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </div>
               <div 
                 className={cn(
                    "relative overflow-hidden border-r border-gray-200 p-0.5 transition-colors cursor-pointer select-none hover:bg-primary/10 hover:ring-1 hover:ring-primary/30 sm:p-1 dark:border-gray-800",
                    selectedTimeSlot === timeString && "bg-primary/5"
                  )}
                  style={{ height: `${WEEK_VIEW_TIME_SLOT_HEIGHT}px` }}
                  data-date={currentDate.toISOString()}
                  data-time-slot={timeString}
                  data-drop-target="time"
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
                {showSlotDragPreview && draggedActivity && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-1 top-1 bottom-1 z-20"
                  >
                    <DayTimeSlotActivityColumns
                      activities={daySlotPreviewActivities}
                      getStatusColor={getStatusColor}
                      getStatusBorderColor={getStatusBorderColor}
                      onActivityClick={onActivityClick}
                      preview
                      previewGridColumnCount={daySlotPreviewColumnCount}
                      previewColumnIndex={showOriginalSlotGhostPreview ? draggedActivityVisibleIndex : undefined}
                    />
                  </div>
                )}
                <div className={cn(
                  "flex h-full flex-col",
                  hourActivities.length > 0 ? "justify-start" : "justify-center"
                )}>
                  <DayTimeSlotActivityColumns
                    activities={hourActivities}
                    draggedActivity={draggedActivity}
                    getStatusColor={getStatusColor}
                    getStatusBorderColor={getStatusBorderColor}
                    onActivityMouseDown={onActivityMouseDown}
                    onTouchDragStart={onTouchDragStart}
                    onTouchDragMove={onTouchDragMove}
                    onTouchDragEnd={onTouchDragEnd}
                    onActivityClick={onActivityClick}
                    onOverflowClick={(e) => {
                      e.stopPropagation();
                      setShowTimeSlotActivitiesModal?.(true);
                      setTimeSlotActivitiesModalData?.({ date: currentDate, time: timeString, activities: hourActivities });
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </ScrollArea>
    </div>
  );
}
