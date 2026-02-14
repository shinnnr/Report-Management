import { users, folders, reports, activities, activityLogs, notifications } from "@shared/schema";
import { type User, type InsertUser, type Folder, type InsertFolder, type Report, type InsertReport, type Activity, type InsertActivity, type ActivityLog, type Notification, type InsertNotification } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, lt, gte, sql, isNull, ne } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Folders
  getFolders(parentId?: number): Promise<Folder[]>;
  getFolder(id: number): Promise<Folder | undefined>;
  getFolderPath(id: number): Promise<Folder[]>;
  createFolder(folder: InsertFolder): Promise<Folder>;
  renameFolder(id: number, name: string): Promise<Folder>;
  deleteFolder(id: number): Promise<void>;
  moveFolder(id: number, targetParentId: number | null): Promise<Folder>;

  // Reports
  getReports(folderId?: number | null, status?: string): Promise<Report[]>;
  getReport(id: number): Promise<Report | undefined>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(id: number, updates: Partial<InsertReport>): Promise<Report>;
  moveReports(reportIds: number[], folderId: number | null): Promise<void>;
  deleteReport(id: number): Promise<void>;

  // Activities
  getActivities(): Promise<Activity[]>;
  getActivity(id: number): Promise<Activity | undefined>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  updateActivity(id: number, updates: Partial<Activity>): Promise<Activity>;
  deleteActivity(id: number): Promise<void>;
  completeActivity(id: number, userId: number): Promise<void>;
  checkDeadlines(): Promise<void>;

  // Notifications
  getNotifications(userId: number): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number): Promise<void>;

  // Logs
  getLogs(): Promise<ActivityLog[]>;
  createLog(userId: number, action: string, description: string): Promise<void>;
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

  // Folders
  async getFolders(parentId?: number | null): Promise<Folder[]> {
    if (parentId === undefined) {
      return db.select().from(folders);
    }
    if (parentId === null || parentId === 0) {
      return db.select().from(folders).where(sql`(${folders.parentId} IS NULL OR ${folders.parentId}::text = '0' OR ${folders.parentId}::text = '')`);
    }
    return db.select().from(folders).where(sql`${folders.parentId}::text = ${parentId.toString()}`);
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

  async createFolder(insertFolder: InsertFolder): Promise<Folder> {
    return await db.transaction(async (tx) => {
      // Prevent duplicate folder names in the same parent
      const existing = await tx.select().from(folders).where(
        and(
          eq(folders.name, insertFolder.name),
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
    await db.transaction(async (tx) => {
      const children = await tx.select().from(folders).where(eq(folders.parentId, id));
      for (const child of children) {
        // Recursively delete children within the same transaction context if possible, 
        // but since we are using DatabaseStorage methods which might create their own transactions,
        // we should ideally pass the transaction object. For now, let's just use raw deletes here
        // to stay within this transaction.
        await this._recursiveDelete(tx, child.id);
      }
      await tx.delete(reports).where(eq(reports.folderId, id));
      await tx.delete(folders).where(eq(folders.id, id));
    });
  }

  private async _recursiveDelete(tx: any, id: number): Promise<void> {
    const children = await tx.select().from(folders).where(eq(folders.parentId, id));
    for (const child of children) {
      await this._recursiveDelete(tx, child.id);
    }
    await tx.delete(reports).where(eq(reports.folderId, id));
    await tx.delete(folders).where(eq(folders.id, id));
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

  async createReport(insertReport: InsertReport): Promise<Report> {
    const [report] = await db.insert(reports).values(insertReport).returning();
    
    // Automation: Link to activity if provided
    if (report.activityId) {
      await this.completeActivity(report.activityId, report.uploadedBy!);
    }
    
    return report;
  }

  async updateReport(id: number, updates: Partial<InsertReport>): Promise<Report> {
    const [report] = await db.update(reports).set(updates).where(eq(reports.id, id)).returning();
    return report;
  }

  async deleteReport(id: number): Promise<void> {
    await db.delete(reports).where(eq(reports.id, id));
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
    return activity;
  }

  async updateActivity(id: number, updates: Partial<Activity>): Promise<Activity> {
    const [activity] = await db.update(activities).set(updates).where(eq(activities.id, id)).returning();
    return activity;
  }

  async deleteActivity(id: number): Promise<void> {
    await db.delete(activities).where(eq(activities.id, id));
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

  async checkDeadlines(): Promise<void> {
    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));

    // 1. Mark overdue activities
    await db.update(activities)
      .set({ status: 'overdue' })
      .where(and(
        lt(activities.deadlineDate, now),
        sql`${activities.status} NOT IN ('completed', 'overdue')`
      ));

    // 2. Notify for upcoming deadlines (within 3 days)
    const upcoming = await db.select().from(activities).where(and(
      gte(activities.deadlineDate, now),
      lt(activities.deadlineDate, threeDaysLater),
      sql`${activities.status} NOT IN ('completed')`
    ));

    for (const activity of upcoming) {
      // Check if notification already exists
      const [existing] = await db.select().from(notifications).where(and(
        eq(notifications.activityId, activity.id),
        eq(notifications.userId, activity.userId!)
      ));

      if (!existing) {
        const remainingDays = Math.ceil((activity.deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        await this.createNotification({
          userId: activity.userId!,
          activityId: activity.id,
          title: "Upcoming Deadline",
          content: `Activity "${activity.title}" is due on ${activity.deadlineDate.toLocaleDateString()}. ${remainingDays} days remaining.`,
          isRead: false
        });
      }
    }
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

  // Logs
  async getLogs(): Promise<any[]> {
    return db.select({
      id: activityLogs.id,
      userId: activityLogs.userId,
      action: activityLogs.action,
      description: activityLogs.description,
      timestamp: activityLogs.timestamp,
      userFullName: users.fullName,
    }).from(activityLogs).leftJoin(users, eq(activityLogs.userId, users.id)).orderBy(desc(activityLogs.timestamp)).limit(10);
  }

  async createLog(userId: number, action: string, description: string): Promise<void> {
    await db.insert(activityLogs).values({
      userId,
      action,
      description,
    });
  }
}

export const storage = new DatabaseStorage();
