import { users, folders, reports, activities, activityLogs, notifications, activitySubmissions, systemSettings, holidays } from "@shared/schema";
import { type User, type InsertUser, type Folder, type InsertFolder, type Report, type InsertReport, type Activity, type InsertActivity, type ActivityLog, type Notification, type InsertNotification, type ActivitySubmission, type InsertActivitySubmission, type Holiday, type InsertHoliday, type SystemSetting, type InsertSystemSetting } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, lt, gte, sql, isNull, ne } from "drizzle-orm";
import { format } from "date-fns";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;
  deleteUser(id: number): Promise<void>;

  // Folders
  getFolders(parentId?: number | null, status?: string): Promise<Folder[]>;
  getFolder(id: number): Promise<Folder | undefined>;
  getFolderPath(id: number): Promise<Folder[]>;
  getFolderByNameAndParent(name: string, parentId: number | null): Promise<Folder | undefined>;
  getFolderByNameAndParentAnyStatus(name: string, parentId: number | null): Promise<Folder | undefined>;
  getActiveFolderByNameAndParent(name: string, parentId: number | null): Promise<Folder | undefined>;
  createFolder(folder: InsertFolder): Promise<Folder>;
  updateFolder(id: number, updates: Partial<InsertFolder>): Promise<Folder>;
  renameFolder(id: number, name: string): Promise<Folder>;
  deleteFolder(id: number): Promise<void>;
  moveFolder(id: number, targetParentId: number | null): Promise<Folder>;

  // Reports
  getReports(folderId?: number | null, status?: string): Promise<Report[]>;
  getReport(id: number): Promise<Report | undefined>;
  getReportsCount(folderId?: number | null, status?: string): Promise<number>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(id: number, updates: Partial<InsertReport>): Promise<Report>;
  moveReports(reportIds: number[], folderId: number | null): Promise<void>;
  deleteReport(id: number): Promise<void>;

  // Activities
  getActivities(): Promise<Activity[]>;
  getActivity(id: number): Promise<Activity | undefined>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  generateRecurringActivitiesForYear(year: number, masterActivityId?: number): Promise<Activity[]>;
  updateActivity(id: number, updates: Partial<Activity>): Promise<Activity>;
  deleteActivity(id: number): Promise<void>;
  startActivity(id: number, userId: number): Promise<void>;
  completeActivity(id: number, userId: number): Promise<void>;
  checkDeadlines(): Promise<void>;

  // Activity Submissions
  getActivitySubmissions(activityId: number): Promise<ActivitySubmission[]>;
  getUserSubmissionForActivity(userId: number, activityId: number): Promise<ActivitySubmission | undefined>;
  createActivitySubmission(submission: InsertActivitySubmission): Promise<ActivitySubmission>;

  // Notifications
  getNotifications(userId: number): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number): Promise<void>;
  deleteNotification(id: number): Promise<void>;
  deleteAllNotifications(userId: number): Promise<void>;

  // Logs
  getLogs(): Promise<ActivityLog[]>;
  createLog(userId: number, action: string, description: string): Promise<void>;
  deleteAllLogs(): Promise<void>;

  // Holidays
  getHolidays(): Promise<Holiday[]>;
  getHoliday(id: number): Promise<Holiday | undefined>;
  createHoliday(holiday: InsertHoliday): Promise<Holiday>;
  updateHoliday(id: number, updates: Partial<Holiday>): Promise<Holiday>;
  deleteHoliday(id: number): Promise<void>;

  // System Settings
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: number): Promise<void> {
    // First delete related activity logs
    await db.delete(activityLogs).where(eq(activityLogs.userId, id));
    // Delete notifications for this user
    await db.delete(notifications).where(eq(notifications.userId, id));
    // Then delete the user
    await db.delete(users).where(eq(users.id, id));
  }

  // Folders
  async getFolders(parentId?: number | null, status?: string): Promise<Folder[]> {
    let conditions = [];

    if (status) {
      conditions.push(eq(folders.status, status));
    }

    if (parentId === undefined) {
      return db.select().from(folders).where(and(...conditions));
    }
    if (parentId === null || parentId === 0) {
      conditions.push(sql`(${folders.parentId} IS NULL OR ${folders.parentId}::text = '0' OR ${folders.parentId}::text = '')`);
      return db.select().from(folders).where(and(...conditions));
    }
    conditions.push(sql`${folders.parentId}::text = ${parentId.toString()}`);
    return db.select().from(folders).where(and(...conditions));
  }

  async getFolder(id: number): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(eq(folders.id, id));
    return folder;
  }

  async getFolderPath(id: number): Promise<Folder[]> {
    const path: Folder[] = [];
    let currentId: number | null = id;
    while (currentId !== null) {
      const folder = await this.getFolder(currentId);
      if (!folder) break;
      path.unshift(folder);
      currentId = folder.parentId;
    }
    return path;
  }

  async getFolderByNameAndParent(name: string, parentId: number | null): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(
      and(
        eq(folders.name, name),
        parentId === null ? isNull(folders.parentId) : eq(folders.parentId, parentId)
      )
    );
    return folder;
  }

  async getActiveFolderByNameAndParent(name: string, parentId: number | null): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(
      and(
        eq(folders.name, name),
        eq(folders.status, 'active'),
        parentId === null ? isNull(folders.parentId) : eq(folders.parentId, parentId)
      )
    );
    return folder;
  }

  // Get folder by name and parent, regardless of status (used to find existing folders before creating new ones)
  async getFolderByNameAndParentAnyStatus(name: string, parentId: number | null): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(
      and(
        eq(folders.name, name),
        parentId === null ? isNull(folders.parentId) : eq(folders.parentId, parentId)
      )
    );
    return folder;
  }

  async createFolder(insertFolder: InsertFolder): Promise<Folder> {
    return await db.transaction(async (tx) => {
      // Prevent duplicate folder names in the same parent (only check active folders, not archived)
      const existing = await tx.select().from(folders).where(
        and(
          eq(folders.name, insertFolder.name),
          eq(folders.status, 'active'),
          (insertFolder.parentId === null || insertFolder.parentId === 0)
            ? isNull(folders.parentId)
            : eq(folders.parentId, Number(insertFolder.parentId))
        )
      ).limit(1);

      if (existing.length > 0) {
        throw new Error(`A folder named "${insertFolder.name}" already exists in this location.`);
      }

      const [folder] = await tx.insert(folders).values(insertFolder).returning();
      return folder;
    });
  }

  async updateFolder(id: number, updates: Partial<InsertFolder>): Promise<Folder> {
    return await db.transaction(async (tx) => {
      // Get the folder before updating
      const currentFolder = await tx.select().from(folders).where(eq(folders.id, id)).limit(1);
      if (!currentFolder.length) throw new Error("Folder not found");

      // If renaming a folder (name is being changed), check for duplicates
      if (updates.name) {
        const targetParentId = currentFolder[0].parentId;
        
        // Check for duplicate names in the same parent (only active folders)
        const duplicate = await tx.select().from(folders).where(
          and(
            eq(folders.name, updates.name),
            eq(folders.status, 'active'),
            targetParentId === null ? isNull(folders.parentId) : eq(folders.parentId, targetParentId),
            ne(folders.id, id) // Exclude the current folder
          )
        ).limit(1);

        if (duplicate.length > 0) {
          throw new Error(`A folder named "${updates.name}" already exists in this location.`);
        }
      }

      // If restoring a folder (status is being changed to 'active'), check for duplicates
      if (updates.status === 'active' && currentFolder[0].status !== 'active') {
        const targetParentId = currentFolder[0].parentId;
        
        // Check for duplicate names in the same parent
        const duplicate = await tx.select().from(folders).where(
          and(
            eq(folders.name, currentFolder[0].name),
            eq(folders.status, 'active'),
            targetParentId === null ? isNull(folders.parentId) : eq(folders.parentId, targetParentId),
            ne(folders.id, id) // Exclude the current folder
          )
        ).limit(1);

        if (duplicate.length > 0) {
          throw new Error(`A folder named "${currentFolder[0].name}" already exists in this location.`);
        }
      }

      const [folder] = await tx.update(folders).set(updates).where(eq(folders.id, id)).returning();
      if (!folder) throw new Error("Folder not found");

      // If archiving a folder, also archive all subfolders and files recursively
      if (updates.status === 'archived') {
        // Archive all subfolders recursively
        const archiveSubfolders = async (parentId: number) => {
          const subfolders = await tx.select().from(folders).where(eq(folders.parentId, parentId));
          for (const subfolder of subfolders) {
            await tx.update(folders).set({ status: 'archived' }).where(eq(folders.id, subfolder.id));
            await archiveSubfolders(subfolder.id); // Recursive call
          }
        };
        await archiveSubfolders(id);

        // Archive all files in this folder and subfolders
        const archiveFiles = async (folderId: number) => {
          await tx.update(reports).set({ status: 'archived' }).where(eq(reports.folderId, folderId));

          // Also archive files in subfolders
          const subfolders = await tx.select().from(folders).where(eq(folders.parentId, folderId));
          for (const subfolder of subfolders) {
            await archiveFiles(subfolder.id);
          }
        };
        await archiveFiles(id);
      }
      // If restoring a folder
      else if (updates.status === 'active') {
        // Check if the folder's parent is archived
        let restoreAsRoot = false;
        if (folder.parentId !== null) {
          const parentFolder = await tx.select().from(folders).where(eq(folders.id, folder.parentId)).limit(1);
          if (parentFolder.length > 0 && parentFolder[0].status === 'archived') {
            // Parent is still archived, restore this folder as root
            await tx.update(folders).set({ parentId: null }).where(eq(folders.id, id));
            restoreAsRoot = true;
          }
        }

        // Restore all subfolders and files recursively
        const restoreSubfolders = async (parentId: number) => {
          const subfolders = await tx.select().from(folders).where(eq(folders.parentId, parentId));
          for (const subfolder of subfolders) {
            if (subfolder.status === 'archived') {
              await tx.update(folders).set({ status: 'active' }).where(eq(folders.id, subfolder.id));
              await restoreSubfolders(subfolder.id); // Recursive call
            }
          }
        };
        await restoreSubfolders(id);

        // Restore all files in this folder and subfolders
        const restoreFiles = async (folderId: number) => {
          await tx.update(reports).set({ status: 'active' }).where(eq(reports.folderId, folderId));

          // Also restore files in subfolders
          const subfolders = await tx.select().from(folders).where(eq(folders.parentId, folderId));
          for (const subfolder of subfolders) {
            await restoreFiles(subfolder.id);
          }
        };
        await restoreFiles(id);
      }

      return folder;
    });
  }

  async renameFolder(id: number, name: string): Promise<Folder> {
    return await db.transaction(async (tx) => {
      const current = await this.getFolder(id);
      if (!current) throw new Error("Folder not found");

      // Prevent duplicate folder names in the same parent on rename
      const existing = await tx.select().from(folders).where(
        and(
          eq(folders.name, name),
          current.parentId === null 
            ? isNull(folders.parentId)
            : eq(folders.parentId, current.parentId as number),
          ne(folders.id, id)
        )
      ).limit(1);

      if (existing.length > 0) {
        throw new Error(`A folder named "${name}" already exists in this location.`);
      }

      const [folder] = await tx.update(folders).set({ name }).where(eq(folders.id, id)).returning();
      return folder;
    });
  }

  async moveFolder(id: number, targetParentId: number | null): Promise<Folder> {
    return await db.transaction(async (tx) => {
      if (id === targetParentId) {
        throw new Error("Cannot move a folder into itself.");
      }

      const folder = await this.getFolder(id);
      if (!folder) throw new Error("Folder not found");

      // Check for circular reference
      if (targetParentId !== null) {
        let currentParentId: number | null = targetParentId;
        while (currentParentId !== null) {
          if (currentParentId === id) {
            throw new Error("Cannot move a folder into one of its subfolders.");
          }
          const parentFolder: Folder | undefined = await this.getFolder(currentParentId);
          currentParentId = parentFolder?.parentId || null;
        }
      }

      // Prevent duplicate names in target location
      const existing = await tx.select().from(folders).where(
        and(
          eq(folders.name, folder.name),
          targetParentId === null 
            ? isNull(folders.parentId)
            : eq(folders.parentId, targetParentId as number),
          ne(folders.id, id)
        )
      ).limit(1);

      if (existing.length > 0) {
        throw new Error(`A folder named "${folder.name}" already exists in the target location.`);
      }

      const [updatedFolder] = await tx.update(folders)
        .set({ parentId: targetParentId })
        .where(eq(folders.id, id))
        .returning();
      return updatedFolder;
    });
  }

  async deleteFolder(id: number): Promise<void> {
    try {
      // Use a simpler approach - recursively delete from the bottom up
      await this._deleteFolderRecursive(id);
    } catch (error) {
      console.error(`Error deleting folder ${id}:`, error);
      throw error;
    }
  }

  private async _deleteFolderRecursive(folderId: number): Promise<void> {
    try {
      // First, recursively delete all child folders
      const children = await db.select().from(folders).where(eq(folders.parentId, folderId));

      for (const child of children) {
        await this._deleteFolderRecursive(child.id);
      }

      // Delete all activity submissions for reports in this folder
      const folderReports = await db.select().from(reports).where(eq(reports.folderId, folderId));
      for (const report of folderReports) {
        await db.delete(activitySubmissions).where(eq(activitySubmissions.reportId, report.id));
      }

      // Delete all reports in this folder
      await db.delete(reports).where(eq(reports.folderId, folderId));

      // Finally, delete the folder itself
      await db.delete(folders).where(eq(folders.id, folderId));
    } catch (error) {
      console.error(`Error in _deleteFolderRecursive for folder ${folderId}:`, error);
      throw error;
    }
  }

  // Reports
  async getReports(folderId?: number | null, status?: string): Promise<Report[]> {
    let conditions = [];
    if (folderId !== undefined) {
      if (folderId === null || folderId === 0) {
        conditions.push(isNull(reports.folderId));
      } else {
        conditions.push(eq(reports.folderId, folderId));
      }
    }
    if (status) conditions.push(eq(reports.status, status));

    if (conditions.length > 0) {
      return db.select().from(reports).where(and(...conditions));
    }
    return db.select().from(reports);
  }

  async moveReports(reportIds: number[], folderId: number | null): Promise<void> {
    await db.update(reports).set({ folderId }).where(sql`${reports.id} IN ${reportIds}`);
  }

  async getReport(id: number): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report;
  }

  async getReportsCount(folderId?: number | null, status?: string): Promise<number> {
    let conditions = [];
    if (folderId !== undefined) {
      if (folderId === null || folderId === 0) {
        conditions.push(isNull(reports.folderId));
      } else {
        conditions.push(eq(reports.folderId, folderId));
      }
    }
    if (status) conditions.push(eq(reports.status, status));

    // Select only id field to minimize data transfer
    if (conditions.length > 0) {
      const result = await db.select({ id: reports.id }).from(reports).where(and(...conditions));
      return result.length;
    }
    const result = await db.select({ id: reports.id }).from(reports);
    return result.length;
  }

  async createReport(insertReport: InsertReport): Promise<Report> {
    const [report] = await db.insert(reports).values(insertReport).returning();
    
    // Automation: Link to activity if provided
    if (report.activityId) {
      await this.completeActivity(report.activityId, report.uploadedBy!);
    }
    
    return report;
  }

  async updateReport(id: number, updates: Partial<InsertReport>): Promise<Report> {
    return await db.transaction(async (tx) => {
      // Get the report before updating
      const currentReport = await tx.select().from(reports).where(eq(reports.id, id)).limit(1);
      if (!currentReport.length) throw new Error("Report not found");

      // If renaming a report (title or fileName is being changed), check for duplicates
      if (updates.title || updates.fileName) {
        const newTitle = updates.title || currentReport[0].title;
        const newFileName = updates.fileName || currentReport[0].fileName;
        const targetFolderId = currentReport[0].folderId;
        
        // Check for duplicate titles in the same folder (only active reports)
        const duplicate = await tx.select().from(reports).where(
          and(
            eq(reports.title, newTitle),
            eq(reports.fileName, newFileName),
            eq(reports.status, 'active'),
            targetFolderId === null ? isNull(reports.folderId) : eq(reports.folderId, targetFolderId),
            ne(reports.id, id) // Exclude the current report
          )
        ).limit(1);

        if (duplicate.length > 0) {
          throw new Error(`A file named "${newFileName}" already exists in this location.`);
        }
      }

      // If restoring a report (status is being changed to 'active'), check for duplicates
      if (updates.status === 'active' && currentReport[0].status !== 'active') {
        const targetFolderId = currentReport[0].folderId;
        
        // Check for duplicate titles in the same folder
        const duplicate = await tx.select().from(reports).where(
          and(
            eq(reports.title, currentReport[0].title),
            eq(reports.fileName, currentReport[0].fileName),
            eq(reports.status, 'active'),
            targetFolderId === null ? isNull(reports.folderId) : eq(reports.folderId, targetFolderId),
            ne(reports.id, id) // Exclude the current report
          )
        ).limit(1);

        if (duplicate.length > 0) {
          throw new Error(`A file named "${currentReport[0].fileName}" already exists in this location.`);
        }
      }

      // If restoring a report
      if (updates.status === 'active' && currentReport[0].folderId !== null) {
        // Check if the report's folder is archived
        const folder = await tx.select().from(folders).where(eq(folders.id, currentReport[0].folderId!)).limit(1);
        if (folder.length > 0 && folder[0].status === 'archived') {
          // Folder is still archived, move report to root
          updates.folderId = null;
        }
      }

      const [report] = await tx.update(reports).set(updates).where(eq(reports.id, id)).returning();
      return report;
    });
  }

  async deleteReport(id: number): Promise<void> {
    try {
      // First delete any activity submissions for this report
      await db.delete(activitySubmissions).where(eq(activitySubmissions.reportId, id));
      await db.delete(reports).where(eq(reports.id, id));
    } catch (error) {
      console.error(`Error deleting report ${id}:`, error);
      throw error;
    }
  }

  // Activities
  async getActivities(): Promise<Activity[]> {
    return db.select().from(activities).orderBy(activities.startDate);
  }

  async getActivity(id: number): Promise<Activity | undefined> {
    const [activity] = await db.select().from(activities).where(eq(activities.id, id));
    return activity;
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const [activity] = await db.insert(activities).values(insertActivity).returning();
    
    // If this activity has recurrence, generate activities for future years
    // Only generate for the newly created activity, not for all master activities
    // Skip generation for activities where recurrenceEndDate is null (generated instances)
    if (activity.recurrence && activity.recurrence !== 'none' && activity.recurrence !== null && activity.recurrenceEndDate) {
      const currentYear = new Date().getFullYear();
      const deadlineYear = new Date(activity.deadlineDate).getFullYear();
      const endYear = activity.recurrenceEndDate 
        ? new Date(activity.recurrenceEndDate).getFullYear() 
        : currentYear + 5; // Default to 5 years if no end date
      
      // Start generating from the deadline year (not current year)
      // This handles cases where activity is created in a earlier year than its deadline
      const startYear = Math.max(currentYear, deadlineYear);

      await Promise.all(
        Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index).map((year) =>
          this.generateRecurringActivitiesForYear(year, activity.id)
        )
      );
    }
    
    return activity;
  }

  // Helper function to check if a date is a holiday (respects holidays_enabled — when disabled, never treat as holiday)
  private async isHoliday(date: Date): Promise<boolean> {
    const holidaysEnabled = await this.getSetting('holidays_enabled');
    if (holidaysEnabled === 'false') return false;
    const holidays = await this.getHolidays();
    return holidays.some(holiday =>
      holiday.date.getFullYear() === date.getFullYear() &&
      holiday.date.getMonth() === date.getMonth() &&
      holiday.date.getDate() === date.getDate()
    );
  }

  // Helper function to adjust date if it falls on weekend or holiday
  // If date is on Saturday, Sunday, or holiday, move to previous weekday that is not a holiday
  private async adjustDateForWeekendOrHoliday(date: Date): Promise<Date> {
    let adjustedDate = new Date(date);
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
      } else if (await this.isHoliday(adjustedDate)) { // Check if it's a holiday
        adjustedDate.setDate(adjustedDate.getDate() - 1);
        isAdjusted = true;
      }
    }

    return adjustedDate;
  }

  // Generate recurring activities for a specific year
  // If masterActivityId is provided, only generate for that specific master activity
  // Otherwise, generate for all master activities (used when user visits a year)
  async generateRecurringActivitiesForYear(year: number, masterActivityId?: number): Promise<Activity[]> {
    let recurringActivities: Activity[];
    
    if (masterActivityId) {
      // Only generate for the specific master activity
      const [activity] = await db.select().from(activities).where(
        eq(activities.id, masterActivityId)
      );
      recurringActivities = activity ? [activity] : [];
    } else {
      // Get all activities with recurrence (not null and not 'none') - these are the master activities
      // Also exclude deleted master activities
      recurringActivities = await db.select().from(activities).where(
        and(
          sql`${activities.recurrence} IS NOT NULL`,
          ne(activities.recurrence, 'none'),
          ne(activities.status, 'deleted') // Exclude deleted master activities
        )
      );
    }
    
    const newActivitiesToInsert: InsertActivity[] = [];
    const holidaysEnabled = await this.getSetting('holidays_enabled') !== 'false';
    const holidayList = holidaysEnabled ? await this.getHolidays() : [];
    const now = new Date();

    const isHolidayDate = (date: Date) =>
      holidayList.some((holiday) =>
        holiday.date.getFullYear() === date.getFullYear() &&
        holiday.date.getMonth() === date.getMonth() &&
        holiday.date.getDate() === date.getDate()
      );

    const adjustDateForWeekendOrHolidaySync = (date: Date): Date => {
      let adjustedDate = new Date(date);
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
        } else if (holidaysEnabled && isHolidayDate(adjustedDate)) {
          adjustedDate.setDate(adjustedDate.getDate() - 1);
          isAdjusted = true;
        }
      }

      return adjustedDate;
    };
    
    for (const activity of recurringActivities) {
      const startDate = new Date(activity.startDate);
      const originalDeadline = new Date(activity.deadlineDate);
      const endDate = activity.recurrenceEndDate ? new Date(activity.recurrenceEndDate) : null;
      if (!activity.recurrence) continue;
      
      // Calculate deadlines for this specific year
      // For monthly: deadlines in months 0-11 of the year
      // For quarterly: deadlines in months 0, 3, 6, 9 of the year
      // For semi-annual: deadlines in months 0, 6 of the year
      // For yearly: deadline in the same month as original
      
      const startYear = startDate.getFullYear();
      const originalMonth = originalDeadline.getMonth();
      const originalDay = originalDeadline.getDate();
      
      // Determine which months in the target year should have deadlines
      let targetMonths: number[] = [];
      
      if (activity.recurrence === 'yearly') {
        // Yearly: only the same month as original
        targetMonths = [originalMonth];
      } else if (activity.recurrence === 'semi-annual') {
        // Semi-annual: every 6 months starting from original month
        targetMonths = [originalMonth, (originalMonth + 6) % 12];
      } else if (activity.recurrence === 'quarterly') {
        // Quarterly: every 3 months starting from original month
        targetMonths = [originalMonth, (originalMonth + 3) % 12, (originalMonth + 6) % 12, (originalMonth + 9) % 12];
      } else {
        // Monthly: all 12 months
        targetMonths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      }

      const existingActivities = await db.select({
        deadlineDate: activities.deadlineDate,
      }).from(activities).where(
        and(
          eq(activities.title, activity.title),
          isNull(activities.recurrence)
        )
      );
      const existingDeadlineTimes = new Set(existingActivities.map((existing) => new Date(existing.deadlineDate).getTime()));
      
      for (const month of targetMonths) {
        // Skip if this deadline is exactly the same as the original deadline
        const originalDeadlineYear = originalDeadline.getFullYear();
        const originalDeadlineMonth = originalDeadline.getMonth();
        if (year === originalDeadlineYear && month === originalDeadlineMonth) {
          continue;
        }
        
        // Skip if this deadline is before the start date
        let deadlineDate = new Date(year, month, originalDay);
        
        // Handle invalid dates: if the day exceeds the month's max days,
        // JavaScript auto-rolls to next month. We need to adjust to the last day of the month.
        // For example, Jan 31 in February becomes March 2/3, so we adjust to Feb 28/29.
        const maxDayInMonth = new Date(year, month + 1, 0).getDate();
        if (originalDay > maxDayInMonth) {
          deadlineDate = new Date(year, month, maxDayInMonth);
        }

        // Adjust for weekends and holidays
        deadlineDate = adjustDateForWeekendOrHolidaySync(deadlineDate);
        
        // Skip if deadline is before the activity start date
        // Compare using year/month/day only, not time
        const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const deadlineOnly = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
        if (deadlineOnly < startDateOnly) {
          continue;
        }
        
        // Skip if deadline is after recurrence end date
        if (endDate) {
          const deadlineYear = deadlineDate.getFullYear();
          const endYear = endDate.getFullYear();
          const deadlineMonth = deadlineDate.getMonth();
          const endMonth = endDate.getMonth();
          
          // Compare year and month - skip if deadline is after (greater than) the end date
          if (deadlineYear > endYear || (deadlineYear === endYear && deadlineMonth > endMonth)) {
            continue;
          }
        }

        if (existingDeadlineTimes.has(deadlineDate.getTime())) {
          continue;
        }

        existingDeadlineTimes.add(deadlineDate.getTime());
        newActivitiesToInsert.push({
          userId: activity.userId,
          title: activity.title,
          description: activity.description,
          startDate: new Date(year, month, 1),
          deadlineDate: deadlineDate,
          status: deadlineDate < now ? 'overdue' : 'pending',
          regulatoryAgency: activity.regulatoryAgency,
          concernDepartment: activity.concernDepartment,
          reportDetails: activity.reportDetails,
          remarks: activity.remarks,
          recurrence: activity.recurrence, // Keep for filtering in Delete Recurring Activities
          recurrenceEndDate: null, // Set to null to prevent re-generation (null fails the check at line 572)
        });
      }
    }

    if (newActivitiesToInsert.length === 0) {
      return [];
    }

    return db.insert(activities).values(newActivitiesToInsert).returning();
  }

  async updateActivity(id: number, updates: Partial<Activity>): Promise<Activity> {
    // If deadlineDate is being updated, recalculate status based on new deadline
    if (updates.deadlineDate) {
      const now = new Date();
      const newDeadline = new Date(updates.deadlineDate);
      
      // Get current activity to check its status
      const [currentActivity] = await db.select().from(activities).where(eq(activities.id, id));
      
      if (currentActivity && !['completed', 'late', 'in-progress'].includes(currentActivity.status || '')) {
        // If new deadline is in the future (including future time today), keep as pending
        if (newDeadline > now) {
          updates.status = 'pending';
        } else {
          // If new deadline is in the past (including past time today), set to overdue
          updates.status = 'overdue';
        }
      }
    }
    
    const [activity] = await db.update(activities).set(updates).where(eq(activities.id, id)).returning();
    return activity;
  }

  async deleteActivity(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      // Delete related records first due to foreign key constraints
      await tx.delete(activitySubmissions).where(eq(activitySubmissions.activityId, id));
      await tx.delete(notifications).where(eq(notifications.activityId, id));

      // Finally delete the activity
      await tx.delete(activities).where(eq(activities.id, id));
    });
  }

  async completeActivity(id: number, userId: number): Promise<void> {
    const activity = await this.getActivity(id);
    if (activity && activity.status !== 'completed') {
      await db.update(activities).set({
        status: 'completed',
        completionDate: new Date(),
        completedBy: userId
      }).where(eq(activities.id, id));
      
      await this.createLog(userId, "ACTIVITY_COMPLETED", `Activity "${activity.title}" marked as completed via report upload.`);
    }
  }

  async startActivity(id: number, userId: number): Promise<void> {
    const activity = await this.getActivity(id);
    if (activity && activity.status === 'pending') {
      await db.update(activities).set({
        status: 'in-progress',
        userId: userId
      }).where(eq(activities.id, id));
      
      await this.createLog(userId, "ACTIVITY_STARTED", `Activity "${activity.title}" started.`);
      
      // Get user info for notification
      const user = await this.getUser(userId);
      
      // Notify all OTHER users about the activity started
      const allUsers = await this.getUsers();
      for (const recipient of allUsers) {
        if (recipient.id !== userId) {
          await this.createNotification({
            userId: recipient.id,
            activityId: id,
            title: "Activity Started",
            content: `${user?.fullName || 'A user'} started working on: ${activity.title}`,
            isRead: false
          });
        }
      }
    }
  }

  async checkDeadlines(): Promise<void> {
    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));

    // Get ALL overdue activities (both pending and already marked as overdue)
    const overdueActivities = await db.select().from(activities).where(and(
      lt(activities.deadlineDate, now),
      sql`${activities.status} IN ('pending', 'overdue')`
    ));

    // Update status to overdue for activities that are still pending
    await db.update(activities)
      .set({ status: 'overdue' })
      .where(and(
        lt(activities.deadlineDate, now),
        eq(activities.status, 'pending')
      ));

    // Notify users about overdue activities based on role and concern department
    const allUsers = await this.getUsers();
    const adminUsers = allUsers.filter(u => u.role === 'admin');
    const nonAdminUsers = allUsers.filter(u => u.role !== 'admin');
    
    // Notify admins about ALL overdue activities
    for (const activity of overdueActivities) {
      for (const admin of adminUsers) {
        const [existingAdmin] = await db.select().from(notifications)
          .where(and(
            eq(notifications.activityId, activity.id),
            eq(notifications.userId, admin.id),
            eq(notifications.title, "Activity Overdue")
          ));

        if (!existingAdmin) {
          await this.createNotification({
            userId: admin.id,
            activityId: activity.id,
            title: "Activity Overdue",
            content: `${activity.title}\nDeadline: ${activity.deadlineDate.toLocaleDateString()}`,
            isRead: false
          });
        }
      }
    }
    
    for (const activity of overdueActivities) {
      for (const user of nonAdminUsers) {
        const [existing] = await db.select().from(notifications)
          .where(and(
            eq(notifications.activityId, activity.id),
            eq(notifications.userId, user.id),
            eq(notifications.title, "Activity Overdue")
          ));

        if (!existing) {
          await this.createNotification({
            userId: user.id,
            activityId: activity.id,
            title: "Activity Overdue",
            content: `${activity.title}\nDeadline: ${activity.deadlineDate.toLocaleDateString()}`,
            isRead: false
          });
        }
      }
    }

    // 2. Notify users for upcoming deadlines (within 3 days)
    const upcoming = await db.select().from(activities).where(and(
      gte(activities.deadlineDate, now),
      lt(activities.deadlineDate, threeDaysLater),
      sql`${activities.status} NOT IN ('completed')`
    ));

    // Also notify admins about upcoming deadlines
    for (const activity of upcoming) {
      for (const admin of adminUsers) {
        const [existingAdmin] = await db.select().from(notifications)
          .where(and(
            eq(notifications.activityId, activity.id),
            eq(notifications.userId, admin.id),
            eq(notifications.title, "Incoming Deadline")
          ));

        if (!existingAdmin) {
          const remainingDays = Math.ceil((activity.deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          await this.createNotification({
            userId: admin.id,
            activityId: activity.id,
            title: "Incoming Deadline",
            content: `${activity.title}\nDate: ${activity.deadlineDate.toLocaleDateString()}\n${remainingDays} days remaining`,
            isRead: false
          });
        }
      }
    }

    for (const activity of upcoming) {
      for (const user of nonAdminUsers) {
        // Notify all users about upcoming deadline
        const [existing] = await db.select().from(notifications)
          .where(and(
            eq(notifications.activityId, activity.id),
            eq(notifications.userId, user.id),
            eq(notifications.title, "Incoming Deadline")
          ));

        if (!existing) {
          const remainingDays = Math.ceil((activity.deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          await this.createNotification({
            userId: user.id,
            activityId: activity.id,
            title: "Incoming Deadline",
            content: `${activity.title}\nDate: ${activity.deadlineDate.toLocaleDateString()}\n${remainingDays} days remaining`,
            isRead: false
          });
        }
      }
    }
  }

  // Activity Submissions
  async getActivitySubmissions(activityId: number): Promise<any[]> {
    console.log('getActivitySubmissions called for activityId:', activityId);
    const submissions = await db
      .select()
      .from(activitySubmissions)
      .leftJoin(reports, eq(activitySubmissions.reportId, reports.id))
      .where(eq(activitySubmissions.activityId, activityId));
    
    console.log('Raw submissions from DB:', submissions.length);
    submissions.forEach((s, i) => {
      console.log(`Submission ${i}: reportId=${s.activity_submissions.reportId}, reports.fileData present=${!!s.reports?.fileData}, reports.fileData length=${s.reports?.fileData?.length || 0}`);
    });
    
    return submissions.map(sub => ({
      ...sub.activity_submissions,
      report: sub.reports ? {
        id: sub.reports.id,
        title: sub.reports.title,
        fileName: sub.reports.fileName,
        fileType: sub.reports.fileType,
        fileData: sub.reports.fileData,
      } : null,
    }));
  }

  async getUserSubmissionForActivity(userId: number, activityId: number): Promise<ActivitySubmission | undefined> {
    const [submission] = await db.select().from(activitySubmissions).where(
      and(
        eq(activitySubmissions.userId, userId),
        eq(activitySubmissions.activityId, activityId)
      )
    );
    return submission;
  }

  async createActivitySubmission(insertSubmission: InsertActivitySubmission): Promise<ActivitySubmission> {
    const [submission] = await db.insert(activitySubmissions).values(insertSubmission).returning();
    return submission;
  }

  // Notifications
  async getNotifications(userId: number): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(insertNotification).returning();
    return notification;
  }

  async markNotificationRead(id: number): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }

  async deleteNotification(id: number): Promise<void> {
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  async deleteAllNotifications(userId: number): Promise<void> {
    await db.delete(notifications).where(eq(notifications.userId, userId));
  }

  // Logs
  async getLogs(): Promise<any[]> {
    return db.select({
      id: activityLogs.id,
      userId: activityLogs.userId,
      action: activityLogs.action,
      description: activityLogs.description,
      timestamp: activityLogs.timestamp,
      userFullName: users.fullName,
      userRole: users.role,
    }).from(activityLogs).leftJoin(users, eq(activityLogs.userId, users.id)).orderBy(desc(activityLogs.timestamp)).limit(1000);
  }

  async createLog(userId: number, action: string, description: string): Promise<void> {
    await db.insert(activityLogs).values({
      userId,
      action,
      description,
    });
  }

  async deleteAllLogs(): Promise<void> {
    await db.delete(activityLogs);
  }

  async deleteLog(id: number): Promise<void> {
    await db.delete(activityLogs).where(eq(activityLogs.id, id));
  }

  // Holidays
  async getHolidays(): Promise<Holiday[]> {
    return db.select().from(holidays).orderBy(holidays.date);
  }

  async getHoliday(id: number): Promise<Holiday | undefined> {
    const [holiday] = await db.select().from(holidays).where(eq(holidays.id, id));
    return holiday;
  }

  async createHoliday(insertHoliday: InsertHoliday): Promise<Holiday> {
    const [holiday] = await db.insert(holidays).values(insertHoliday).returning();
    return holiday;
  }

  async updateHoliday(id: number, updates: Partial<Holiday>): Promise<Holiday> {
    const [holiday] = await db.update(holidays).set(updates).where(eq(holidays.id, id)).returning();
    return holiday;
  }

  async deleteHoliday(id: number): Promise<void> {
    await db.delete(holidays).where(eq(holidays.id, id));
  }

  // System Settings
  async getSetting(key: string): Promise<string | null> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return setting?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await db.insert(systemSettings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updatedAt: new Date() },
      });
  }
}

export const storage = new DatabaseStorage();
