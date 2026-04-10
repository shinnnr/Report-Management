import { users, folders, reports, activities, activityLogs, notifications, activitySubmissions, systemSettings, holidays } from "@shared/schema";
import { type User, type InsertUser, type Folder, type InsertFolder, type Report, type InsertReport, type Activity, type InsertActivity, type ActivityLog, type Notification, type InsertNotification, type ActivitySubmission, type InsertActivitySubmission, type Holiday, type InsertHoliday, type SystemSetting, type InsertSystemSetting } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, lt, gte, sql, isNull, ne, or } from "drizzle-orm";
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
  createReports(reports: InsertReport[]): Promise<Report[]>;
  updateReport(id: number, updates: Partial<InsertReport>): Promise<Report>;
  moveReports(reportIds: number[], folderId: number | null): Promise<void>;
  deleteReport(id: number): Promise<void>;

  // Activities
  getActivities(): Promise<Activity[]>;
  getActivity(id: number): Promise<Activity | undefined>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  createActivities(activities: InsertActivity[]): Promise<Activity[]>;
  generateRecurringActivitiesForYear(year: number, masterActivityId?: number): Promise<Activity[]>;
  updateActivity(id: number, updates: Partial<Activity>): Promise<Activity>;
  rescheduleRecurringActivitySeries(id: number, deadlineDate: Date): Promise<Activity>;
  deleteActivity(id: number): Promise<void>;
  deleteActivities(ids: number[]): Promise<number>;
  startActivity(id: number, userId: number): Promise<void>;
  completeActivity(id: number, userId: number): Promise<void>;
  checkDeadlines(): Promise<void>;

  // Activity Submissions
  getActivitySubmissions(activityId: number): Promise<ActivitySubmission[]>;
  getUserSubmissionForActivity(userId: number, activityId: number): Promise<ActivitySubmission | undefined>;
  createActivitySubmission(submission: InsertActivitySubmission): Promise<ActivitySubmission>;
  createActivitySubmissions(submissions: InsertActivitySubmission[]): Promise<ActivitySubmission[]>;

  // Notifications
  getNotifications(userId: number): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  createNotifications(notifications: InsertNotification[]): Promise<Notification[]>;
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
    await db.transaction(async (tx) => {
      // Delete activity logs for this user
      await tx.delete(activityLogs).where(eq(activityLogs.userId, id));
      // Delete notifications for this user
      await tx.delete(notifications).where(eq(notifications.userId, id));
      // Get activities created by this user first
      const userActivities = await tx.select({ id: activities.id }).from(activities).where(eq(activities.userId, id));
      const userActivityIds = userActivities.map(a => a.id);

      // Delete activity submissions by this user or that reference activities by this user
      let activitySubmissionConditions = [eq(activitySubmissions.userId, id)];
      if (userActivityIds.length > 0) {
        activitySubmissionConditions.push(sql`${activitySubmissions.activityId} IN ${userActivityIds}`);
      }
      await tx.delete(activitySubmissions).where(or(...activitySubmissionConditions));

      // Delete notifications that reference activities created by this user
      if (userActivityIds.length > 0) {
        await tx.delete(notifications).where(sql`${notifications.activityId} IN ${userActivityIds}`);
      }

      // Delete reports that reference activities created by this user
      if (userActivityIds.length > 0) {
        await tx.delete(reports).where(sql`${reports.activityId} IN ${userActivityIds}`);
      }

      // Update activities to remove completedBy reference, then delete activities created by this user
      await tx.update(activities).set({ completedBy: null }).where(eq(activities.completedBy, id));
      await tx.delete(activities).where(eq(activities.userId, id));

      // Delete reports uploaded by this user
      await tx.delete(reports).where(eq(reports.uploadedBy, id));
      // Handle folders created by this user
      const userFolders = await tx.select().from(folders).where(eq(folders.createdBy, id));
      if (userFolders.length > 0) {
        // Find another admin to reassign folders to
        const [otherAdmin] = await tx.select().from(users).where(and(eq(users.role, 'admin'), ne(users.id, id))).limit(1);
        if (otherAdmin) {
          await tx.update(folders).set({ createdBy: otherAdmin.id }).where(eq(folders.createdBy, id));
        } else {
          // If no other admin, delete the folders (cascade delete subfolders and files)
          for (const folder of userFolders) {
            await this._deleteFolderRecursive(folder.id, tx);
          }
        }
      }
      // Finally delete the user
      await tx.delete(users).where(eq(users.id, id));
    });
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

  async deleteFolder(id: number, tx?: any): Promise<void> {
    try {
      // Use a simpler approach - recursively delete from the bottom up
      await this._deleteFolderRecursive(id, tx);
    } catch (error) {
      console.error(`Error deleting folder ${id}:`, error);
      throw error;
    }
  }

  private async _deleteFolderRecursive(folderId: number, tx?: any): Promise<void> {
    const dbInstance = tx || db;
    try {
      // Collect all folder IDs to delete (including children recursively)
      const folderIdsToDelete: number[] = [];
      const reportIdsToDelete: number[] = [];

      const collectFolders = async (currentId: number) => {
        folderIdsToDelete.push(currentId);
        const children = await dbInstance.select().from(folders).where(eq(folders.parentId, currentId));
        for (const child of children) {
          await collectFolders(child.id);
        }
        // Collect reports in this folder
        const folderReports = await dbInstance.select({ id: reports.id }).from(reports).where(eq(reports.folderId, currentId));
        reportIdsToDelete.push(...folderReports.map((r: { id: number }) => r.id));
      };

      await collectFolders(folderId);

      // Delete activity submissions for all reports in these folders
      if (reportIdsToDelete.length > 0) {
        await dbInstance.delete(activitySubmissions).where(sql`${activitySubmissions.reportId} IN ${reportIdsToDelete}`);
      }

      // Delete all reports in these folders
      if (reportIdsToDelete.length > 0) {
        await dbInstance.delete(reports).where(sql`${reports.id} IN ${reportIdsToDelete}`);
      }

      // Delete all folders (children first due to foreign key constraints)
      folderIdsToDelete.reverse(); // Delete from leaves up to root
      for (const id of folderIdsToDelete) {
        await dbInstance.delete(folders).where(eq(folders.id, id));
      }
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
      return db.select({
        id: reports.id,
        title: reports.title,
        description: reports.description,
        fileName: reports.fileName,
        fileType: reports.fileType,
        fileSize: reports.fileSize,
        fileData: sql<string | null>`NULL`,
        folderId: reports.folderId,
        uploadedBy: reports.uploadedBy,
        activityId: reports.activityId,
        status: reports.status,
        year: reports.year,
        month: reports.month,
        createdAt: reports.createdAt,
      }).from(reports).where(and(...conditions));
    }
    return db.select({
      id: reports.id,
      title: reports.title,
      description: reports.description,
      fileName: reports.fileName,
      fileType: reports.fileType,
      fileSize: reports.fileSize,
      fileData: sql<string | null>`NULL`,
      folderId: reports.folderId,
      uploadedBy: reports.uploadedBy,
      activityId: reports.activityId,
      status: reports.status,
      year: reports.year,
      month: reports.month,
      createdAt: reports.createdAt,
    }).from(reports);
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

    if (conditions.length > 0) {
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(reports).where(and(...conditions));
      return Number(result?.count || 0);
    }
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(reports);
    return Number(result?.count || 0);
  }

  async createReport(insertReport: InsertReport): Promise<Report> {
    const [report] = await db.insert(reports).values(insertReport).returning();
    
    // Automation: Link to activity if provided
    if (report.activityId) {
      await this.completeActivity(report.activityId, report.uploadedBy!);
    }
    
    return report;
  }

  async createReports(insertReports: InsertReport[]): Promise<Report[]> {
    if (insertReports.length === 0) {
      return [];
    }

    return db.insert(reports).values(insertReports).returning();
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
  async createActivities(insertActivities: InsertActivity[]): Promise<Activity[]> {
    if (insertActivities.length === 0) {
      return [];
    }

    return db.insert(activities).values(insertActivities).returning();
  }

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

    const buildRecurringDeadline = (year: number, month: number, day: number, originalDeadline: Date): Date => {
      const maxDayInMonth = new Date(year, month + 1, 0).getDate();
      const clampedDay = Math.min(day, maxDayInMonth);
      const deadlineDate = new Date(year, month, clampedDay);

      deadlineDate.setHours(
        originalDeadline.getHours(),
        originalDeadline.getMinutes(),
        originalDeadline.getSeconds(),
        originalDeadline.getMilliseconds()
      );

      return adjustDateForWeekendOrHolidaySync(deadlineDate);
    };

    const getMonthlyWeekdayOccurrencesSync = (
      year: number,
      startBoundary: Date,
      recurrenceEndDate: Date | null,
      originalDeadline: Date,
      weekdayOption: string,
    ): { startDate: Date; deadlineDate: Date }[] => {
      if (weekdayOption === 'date') {
        return [];
      }

      const targetWeekday = Number(weekdayOption);
      if (Number.isNaN(targetWeekday)) {
        return [];
      }

      const occurrences: { startDate: Date; deadlineDate: Date }[] = [];
      const normalizedStartBoundary = new Date(startBoundary);
      normalizedStartBoundary.setHours(0, 0, 0, 0);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
      const effectiveEnd = recurrenceEndDate && recurrenceEndDate < yearEnd ? recurrenceEndDate : yearEnd;

      for (let month = 0; month < 12; month++) {
        for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
          const occurrenceStart = new Date(year, month, day);
          if (occurrenceStart.getDay() !== targetWeekday) {
            continue;
          }

          if (occurrenceStart < normalizedStartBoundary || occurrenceStart > effectiveEnd) {
            continue;
          }

          const occurrenceDeadline = new Date(occurrenceStart);
          occurrenceDeadline.setHours(
            originalDeadline.getHours(),
            originalDeadline.getMinutes(),
            originalDeadline.getSeconds(),
            originalDeadline.getMilliseconds()
          );

          occurrences.push({
            startDate: occurrenceStart,
            deadlineDate: adjustDateForWeekendOrHolidaySync(occurrenceDeadline),
          });
        }
      }

      return occurrences;
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
      const existingActivities = await db.select({
        deadlineDate: activities.deadlineDate,
      }).from(activities).where(
        and(
          eq(activities.title, activity.title),
          isNull(activities.recurrence)
        )
      );
      const existingDeadlineTimes = new Set(existingActivities.map((existing) => new Date(existing.deadlineDate).getTime()));

      if (activity.recurrence === 'monthly' && activity.monthlyPattern && activity.monthlyPattern !== 'date') {
        const monthlyOccurrences = getMonthlyWeekdayOccurrencesSync(
          year,
          startDate,
          endDate,
          originalDeadline,
          activity.monthlyPattern,
        );

        for (const occurrence of monthlyOccurrences) {
          const deadlineTime = occurrence.deadlineDate.getTime();
          if (existingDeadlineTimes.has(deadlineTime)) {
            continue;
          }

          existingDeadlineTimes.add(deadlineTime);
          newActivitiesToInsert.push({
            userId: activity.userId,
            title: activity.title,
            description: activity.description,
            startDate: occurrence.startDate,
            deadlineDate: occurrence.deadlineDate,
            status: occurrence.deadlineDate < now ? 'overdue' : 'pending',
            regulatoryAgency: activity.regulatoryAgency,
            concernDepartment: activity.concernDepartment,
            reportDetails: activity.reportDetails,
            remarks: activity.remarks,
            recurrence: activity.recurrence,
            recurrenceEndDate: null,
            monthlyPattern: activity.monthlyPattern,
          });
        }

        continue;
      }
      
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

      for (const month of targetMonths) {
        // Skip if this deadline is exactly the same as the original deadline
        const originalDeadlineYear = originalDeadline.getFullYear();
        const originalDeadlineMonth = originalDeadline.getMonth();
        if (year === originalDeadlineYear && month === originalDeadlineMonth) {
          continue;
        }
        
        // Build the recurring deadline while preserving the original time.
        let deadlineDate = buildRecurringDeadline(year, month, originalDay, originalDeadline);
        
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

          const exceedsRecurrenceRange = activity.recurrence === 'yearly'
            ? deadlineYear > endYear
            : deadlineYear > endYear || (deadlineYear === endYear && deadlineMonth > endMonth);

          if (exceedsRecurrenceRange) {
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
          monthlyPattern: activity.monthlyPattern,
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
      const requestedDeadline = new Date(updates.deadlineDate);
      const adjustedDeadline = await this.adjustDateForWeekendOrHoliday(requestedDeadline);
      const now = new Date();
      const newDeadline = new Date(adjustedDeadline);
      
      // Get current activity to check its status
      const [currentActivity] = await db.select().from(activities).where(eq(activities.id, id));

      updates.deadlineDate = newDeadline;

      // Preserve the requested slot date when rescheduling recurring items.
      if (currentActivity?.recurrence && currentActivity.recurrence !== 'none') {
        updates.startDate = requestedDeadline;
      }
      
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

  async rescheduleRecurringActivitySeries(id: number, deadlineDate: Date): Promise<Activity> {
    const currentActivity = await this.getActivity(id);
    if (!currentActivity) {
      throw new Error("Activity not found");
    }

    if (!currentActivity.recurrence || currentActivity.recurrence === 'none') {
      return this.updateActivity(id, { deadlineDate });
    }

    const targetDeadline = new Date(deadlineDate);
    const now = new Date();
    const restrictedStatuses = new Set(['completed', 'late', 'in-progress']);
    const currentSeriesSlotDate = new Date(currentActivity.startDate);
    const holidaysEnabled = await this.getSetting('holidays_enabled') !== 'false';
    const holidayList = holidaysEnabled ? await this.getHolidays() : [];

    const getMonthDifference = (from: Date, to: Date) =>
      ((to.getFullYear() - from.getFullYear()) * 12) + (to.getMonth() - from.getMonth());

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

    const seriesCandidates = await db.select().from(activities).where(
      and(
        eq(activities.title, currentActivity.title),
        eq(activities.recurrence, currentActivity.recurrence)
      )
    );

    const seriesActivities = seriesCandidates.filter((activity) =>
      activity.userId === currentActivity.userId &&
      activity.regulatoryAgency === currentActivity.regulatoryAgency &&
      activity.concernDepartment === currentActivity.concernDepartment
    );
    const isMonthlyPatternSeries =
      currentActivity.recurrence === 'monthly' &&
      !!currentActivity.monthlyPattern &&
      currentActivity.monthlyPattern !== 'date';

    const movableActivities = seriesActivities.filter((activity) => !restrictedStatuses.has(activity.status || ''));

    await db.transaction(async (tx) => {
      for (const seriesActivity of movableActivities) {
        const seriesSlotDate = new Date(seriesActivity.startDate);
        const monthOffset = getMonthDifference(currentSeriesSlotDate, seriesSlotDate);
        const nextSlotDate = new Date(
          targetDeadline.getFullYear(),
          targetDeadline.getMonth() + monthOffset,
          1,
        );
        const requestedSlotDeadline = isMonthlyPatternSeries
          ? buildWeekdayRecurringDeadlineForSlot(
              nextSlotDate,
              targetDeadline,
              getWeekdayOccurrenceIndex(seriesSlotDate),
            )
          : buildRecurringDeadlineForSlot(nextSlotDate, targetDeadline);
        const nextDeadline = adjustDateForWeekendOrHolidaySync(requestedSlotDeadline);

        await tx.update(activities).set({
          startDate: requestedSlotDeadline,
          deadlineDate: nextDeadline,
          status: nextDeadline > now ? 'pending' : 'overdue',
        }).where(eq(activities.id, seriesActivity.id));
      }
    });

    const [updatedActivity] = await db.select().from(activities).where(eq(activities.id, id));
    return updatedActivity;
  }

  async deleteActivity(id: number): Promise<void> {
    await this.deleteActivities([id]);
  }

  async deleteActivities(ids: number[]): Promise<number> {
    const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));

    if (uniqueIds.length === 0) {
      return 0;
    }

    await db.transaction(async (tx) => {
      const linkedReports = await tx
        .select({ id: reports.id })
        .from(reports)
        .where(sql`${reports.activityId} IN ${uniqueIds}`);
      const linkedReportIds = linkedReports.map((report) => report.id);

      // Delete related records first due to foreign key constraints
      await tx.delete(activitySubmissions).where(sql`${activitySubmissions.activityId} IN ${uniqueIds}`);
      if (linkedReportIds.length > 0) {
        await tx.delete(activitySubmissions).where(sql`${activitySubmissions.reportId} IN ${linkedReportIds}`);
        await tx.delete(reports).where(sql`${reports.id} IN ${linkedReportIds}`);
      }
      await tx.delete(notifications).where(sql`${notifications.activityId} IN ${uniqueIds}`);
      await tx.delete(activities).where(sql`${activities.id} IN ${uniqueIds}`);
    });

    return uniqueIds.length;
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

  async createActivitySubmissions(insertSubmissions: InsertActivitySubmission[]): Promise<ActivitySubmission[]> {
    if (insertSubmissions.length === 0) {
      return [];
    }

    return db.insert(activitySubmissions).values(insertSubmissions).returning();
  }

  // Notifications
  async getNotifications(userId: number): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(insertNotification).returning();
    return notification;
  }

  async createNotifications(insertNotifications: InsertNotification[]): Promise<Notification[]> {
    if (insertNotifications.length === 0) {
      return [];
    }

    return db.insert(notifications).values(insertNotifications).returning();
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
