import { users, folders, reports, activities, activityLogs } from "@shared/schema";
import { type User, type InsertUser, type Folder, type InsertFolder, type Report, type InsertReport, type Activity, type InsertActivity, type ActivityLog } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Folders
  getFolders(parentId?: number): Promise<Folder[]>;
  getFolder(id: number): Promise<Folder | undefined>;
  createFolder(folder: InsertFolder): Promise<Folder>;
  deleteFolder(id: number): Promise<void>;

  // Reports
  getReports(folderId?: number, status?: string): Promise<Report[]>;
  getReport(id: number): Promise<Report | undefined>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(id: number, updates: Partial<InsertReport>): Promise<Report>;
  deleteReport(id: number): Promise<void>;

  // Activities
  getActivities(): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  updateActivity(id: number, updates: Partial<InsertActivity>): Promise<Activity>;
  deleteActivity(id: number): Promise<void>;

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
  async getFolders(parentId?: number): Promise<Folder[]> {
    if (parentId === undefined) {
      return db.select().from(folders).where(eq(folders.parentId, null as any)); // Helper for null check if needed, but drizzle handles it
    }
    // Handle root folders (parentId is null)
    if (parentId === null) { 
        // @ts-ignore
        return db.select().from(folders).where(sql`${folders.parentId} IS NULL`); 
    }
    // Standard query
    const result = await db.select().from(folders);
    // Filter in memory for simplicity with nulls or use raw sql helper, but let's try standard filtering
    if (parentId) {
      return result.filter(f => f.parentId === parentId);
    } else {
      return result.filter(f => f.parentId === null);
    }
  }

  async getFolder(id: number): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(eq(folders.id, id));
    return folder;
  }

  async createFolder(insertFolder: InsertFolder): Promise<Folder> {
    const [folder] = await db.insert(folders).values(insertFolder).returning();
    return folder;
  }

  async deleteFolder(id: number): Promise<void> {
    // Recursive delete handling needs to happen here or be assumed by DB cascade (if configured)
    // Since we didn't strictly configure cascade in Drizzle schema `references` options without extra config,
    // we should manually delete children first.
    
    // 1. Find all children
    const children = await db.select().from(folders).where(eq(folders.parentId, id));
    
    // 2. Delete each child recursively
    for (const child of children) {
      await this.deleteFolder(child.id);
    }

    // 3. Delete files in this folder
    await db.delete(reports).where(eq(reports.folderId, id));

    // 4. Delete the folder itself
    await db.delete(folders).where(eq(folders.id, id));
  }

  // Reports
  async getReports(folderId?: number, status?: string): Promise<Report[]> {
    let conditions = [];
    if (folderId !== undefined) conditions.push(eq(reports.folderId, folderId));
    if (status) conditions.push(eq(reports.status, status));

    if (conditions.length > 0) {
      return db.select().from(reports).where(and(...conditions));
    }
    return db.select().from(reports);
  }

  async getReport(id: number): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report;
  }

  async createReport(insertReport: InsertReport): Promise<Report> {
    const [report] = await db.insert(reports).values(insertReport).returning();
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

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const [activity] = await db.insert(activities).values(insertActivity).returning();
    return activity;
  }

  async updateActivity(id: number, updates: Partial<InsertActivity>): Promise<Activity> {
    const [activity] = await db.update(activities).set(updates).where(eq(activities.id, id)).returning();
    return activity;
  }

  async deleteActivity(id: number): Promise<void> {
    await db.delete(activities).where(eq(activities.id, id));
  }

  // Logs
  async getLogs(): Promise<ActivityLog[]> {
    return db.select().from(activityLogs).orderBy(desc(activityLogs.timestamp));
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
