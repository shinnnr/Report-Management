import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === USERS ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("assistant"), // 'admin' | 'assistant'
  fullName: text("full_name").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === FOLDERS ===
export const folders = pgTable("folders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  parentId: integer("parent_id"), // Nullable for root folders
  createdBy: integer("created_by").references(() => users.id),
  status: text("status").default("active"), // 'active', 'archived', 'deleted'
  createdAt: timestamp("created_at").defaultNow(),
});

// === REPORTS (FILES) ===
export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  fileData: text("file_data"), // Base64 encoded content for simplicity in this setup
  folderId: integer("folder_id").references(() => folders.id),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  activityId: integer("activity_id"), // Linked activity if uploaded as submission
  status: text("status").default("active"), // 'active', 'archived', 'deleted'
  year: integer("report_year"),
  month: integer("report_month"),
  createdAt: timestamp("created_at").defaultNow(),
  // Google Drive fields
  gdriveId: text("gdrive_id"), // Google Drive file ID
  gdriveLink: text("gdrive_link"), // Google Drive web view link
  gdriveWebLink: text("gdrive_web_link"), // Google Drive download link
});

// === ACTIVITIES ===
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  deadlineDate: timestamp("deadline_date").notNull(),
  status: text("status").default("pending"), // 'pending', 'completed', 'overdue', 'in-progress'
  regulatoryAgency: text("regulatory_agency"),
  concernDepartment: text("concern_department"),
  reportDetails: text("report_details"),
  completionDate: timestamp("completion_date"),
  completedBy: integer("completed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// === ACTIVITY SUBMISSIONS ===
export const activitySubmissions = pgTable("activity_submissions", {
  id: serial("id").primaryKey(),
  activityId: integer("activity_id").references(() => activities.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  reportId: integer("report_id").references(() => reports.id).notNull(),
  submissionDate: timestamp("submission_date").defaultNow(),
  status: text("status").default("submitted"), // 'submitted', 'late', 'approved', 'rejected'
  notes: text("notes"),
});

// === NOTIFICATIONS ===
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  activityId: integer("activity_id").references(() => activities.id).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === ACTIVITY LOGS ===
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(), // 'LOGIN', 'UPLOAD', 'DELETE', etc.
  description: text("description").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

// === SESSIONS ===
export const userSessions = pgTable("user_sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

// === RELATIONS ===
export const foldersRelations = relations(folders, ({ one, many }) => ({
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
    relationName: "parent_child",
  }),
  children: many(folders, {
    relationName: "parent_child",
  }),
  files: many(reports),
  creator: one(users, {
    fields: [folders.createdBy],
    references: [users.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  folder: one(folders, {
    fields: [reports.folderId],
    references: [folders.id],
  }),
  uploader: one(users, {
    fields: [reports.uploadedBy],
    references: [users.id],
  }),
  activity: one(activities, {
    fields: [reports.activityId],
    references: [activities.id],
  }),
}));

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  user: one(users, {
    fields: [activities.userId],
    references: [users.id],
  }),
  submissions: many(activitySubmissions),
  notifications: many(notifications),
}));

export const activitySubmissionsRelations = relations(activitySubmissions, ({ one }) => ({
  activity: one(activities, {
    fields: [activitySubmissions.activityId],
    references: [activities.id],
  }),
  user: one(users, {
    fields: [activitySubmissions.userId],
    references: [users.id],
  }),
  report: one(reports, {
    fields: [activitySubmissions.reportId],
    references: [reports.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  activity: one(activities, {
    fields: [notifications.activityId],
    references: [activities.id],
  }),
}));

// === SCHEMAS ===
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertFolderSchema = createInsertSchema(folders).omit({ id: true, createdAt: true });
export const insertReportSchema = createInsertSchema(reports).omit({ id: true, createdAt: true });
export const insertActivitySchema = createInsertSchema(activities)
  .omit({ id: true, createdAt: true, userId: true })
  .extend({
    startDate: z.string().transform(str => new Date(str)),
    deadlineDate: z.string().transform(str => new Date(str)),
  });
export const insertActivitySubmissionSchema = createInsertSchema(activitySubmissions).omit({ id: true, submissionDate: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });

// === TYPES ===
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Folder = typeof folders.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;
export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type ActivitySubmission = typeof activitySubmissions.$inferSelect;
export type InsertActivitySubmission = z.infer<typeof insertActivitySubmissionSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type ActivityLogWithUser = {
  id: number;
  userId: number | null;
  action: string;
  description: string;
  timestamp: Date | null;
  userFullName: string | null;
};
