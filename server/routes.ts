import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session, { Store } from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { eq, and, sql, desc } from "drizzle-orm";
import { userSessions } from "@shared/schema";

// Custom Drizzle Session Store
class DrizzleSessionStore extends Store {
  constructor() {
    super();
  }

  async get(sid: string, callback: (err: any, session?: any) => void) {
    try {
      const result = await db
        .select()
        .from(userSessions)
        .where(and(eq(userSessions.sid, sid), sql`${userSessions.expire} > NOW()`))
        .limit(1);

      if (result.length > 0) {
        callback(null, result[0].sess);
      } else {
        callback(null, null);
      }
    } catch (err) {
      callback(err);
    }
  }

  async set(sid: string, session: any, callback: (err?: any) => void) {
    try {
      const expire = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await db
        .insert(userSessions)
        .values({
          sid,
          sess: session,
          expire,
        })
        .onConflictDoUpdate({
          target: userSessions.sid,
          set: {
            sess: session,
            expire,
          },
        });
      callback();
    } catch (err) {
      callback(err);
    }
  }

  async destroy(sid: string, callback: (err?: any) => void) {
    try {
      await db.delete(userSessions).where(eq(userSessions.sid, sid));
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

const scryptAsync = promisify(scrypt);

// --- Auth Helper Functions ---
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePassword(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedPasswordBuf = Buffer.from(hashed, "hex");
  const suppliedPasswordBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Trust proxy for Railway
  app.set('trust proxy', 1);

  // Ensure sessions table exists (Drizzle will handle this via migrations)
  // The table will be created when we run db:push

  // --- Session & Passport Setup ---
  app.use(
    session({
      store: new DrizzleSessionStore(),
      secret: process.env.SESSION_SECRET || "default_secret_dev_only",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: app.get("env") === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax'
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Incorrect username." });
        }
        const isValid = await comparePassword(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "Incorrect password." });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // Middleware to protect routes
  const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };

  // --- Background Jobs (Simple Cron Emulator) ---
  setInterval(async () => {
    try {
      await storage.checkDeadlines();
    } catch (err) {
      console.error("Error in checkDeadlines job:", err);
    }
  }, 1000 * 60 * 60 * 24); // Run daily


  // --- Auth Routes ---
  app.post(api.auth.login.path, (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info.message });
      req.logIn(user, async (err) => {
        if (err) return next(err);
        await storage.createLog(user.id, "LOGIN", "User logged in");
        res.json(user);
      });
    })(req, res, next);
  });

  app.post(api.auth.logout.path, (req, res, next) => {
    const userId = (req.user as any)?.id;
    req.logout((err) => {
      if (err) return next(err);
      if (userId) storage.createLog(userId, "LOGOUT", "User logged out");
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get(api.auth.me.path, isAuthenticated, (req, res) => {
    res.json(req.user);
  });

  // --- Folder Routes ---
  app.get(api.folders.list.path, isAuthenticated, async (req, res) => {
    const parentIdStr = req.query.parentId as string | undefined;

    // If no parentId specified, return root folders
    if (!parentIdStr) {
      const folders = await storage.getFolders(null);
      res.json(folders);
      return;
    }

    // If parentId is 'all', return all folders (for breadcrumbs)
    if (parentIdStr === 'all') {
      const folders = await storage.getFolders(undefined);
      res.json(folders);
      return;
    }

    let parentId: number | null | undefined;

    if (parentIdStr === "null" || parentIdStr === "root" || parentIdStr === "" || parentIdStr === "undefined") {
      parentId = null;
    } else {
      parentId = parseInt(parentIdStr);
      if (isNaN(parentId)) parentId = null;
    }

    const folders = await storage.getFolders(parentId);
    res.json(folders);
  });

  app.post(api.folders.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.folders.create.input.parse({
        ...req.body,
        createdBy: (req.user as any).id
      });
      const folder = await storage.createFolder(input);
      await storage.createLog((req.user as any).id, "CREATE_FOLDER", `Created folder: ${folder.name}`);
      res.status(201).json(folder);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/folders/:id/path", isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const path = await storage.getFolderPath(id);
    res.json(path);
  });

  app.patch("/api/folders/:id/rename", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const { name } = req.body;
      const folder = await storage.renameFolder(id, name);
      await storage.createLog((req.user as any).id, "RENAME_FOLDER", `Renamed folder to: ${name}`);
      res.json(folder);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/folders/:id/move", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const { targetParentId } = req.body;
      const folder = await storage.moveFolder(id, (targetParentId === "root" || targetParentId === null) ? null : parseInt(targetParentId));
      await storage.createLog((req.user as any).id, "MOVE_FOLDER", `Moved folder: ${folder.name}`);
      res.json(folder);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete(api.folders.delete.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    await storage.deleteFolder(id);
    await storage.createLog((req.user as any).id, "DELETE_FOLDER", `Deleted folder ID: ${id}`);
    res.json({ message: "Folder deleted" });
  });

  // --- Report Routes ---
  app.get(api.reports.list.path, isAuthenticated, async (req, res) => {
    const folderIdStr = req.query.folderId as string | undefined;
    let folderId: number | null | undefined;

    if (folderIdStr === "null" || folderIdStr === "root" || folderIdStr === "" || folderIdStr === undefined) {
      folderId = null;
    } else {
      folderId = parseInt(folderIdStr);
      if (isNaN(folderId)) folderId = null;
    }

    const status = req.query.status as string | undefined;
    const reports = await storage.getReports(folderId, status);
    res.json(reports);
  });

  app.post("/api/reports/move", isAuthenticated, async (req, res) => {
    const { reportIds, folderId } = req.body;
    await storage.moveReports(reportIds, folderId === "root" ? null : folderId);
    await storage.createLog((req.user as any).id, "MOVE_REPORTS", `Moved ${reportIds.length} reports`);
    res.json({ message: "Reports moved successfully" });
  });

  app.post(api.reports.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.reports.create.input.parse({
        ...req.body,
        uploadedBy: (req.user as any).id
      });
      const report = await storage.createReport(input);
      await storage.createLog((req.user as any).id, "UPLOAD_REPORT", `Uploaded report: ${report.title}`);
      res.status(201).json(report);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get(api.reports.get.path, isAuthenticated, async (req, res) => {
    const report = await storage.getReport(parseInt(req.params.id as string));
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(report);
  });

  app.patch(api.reports.update.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const updates = api.reports.update.input.parse(req.body);
    const report = await storage.updateReport(id, updates);
    await storage.createLog((req.user as any).id, "UPDATE_REPORT", `Updated report: ${report.title}`);
    res.json(report);
  });

  app.delete(api.reports.delete.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    await storage.deleteReport(id);
    await storage.createLog((req.user as any).id, "DELETE_REPORT", `Deleted report ID: ${id}`);
    res.json({ message: "Report deleted" });
  });

  // --- Activity Routes ---
  app.get(api.activities.list.path, isAuthenticated, async (req, res) => {
    const activities = await storage.getActivities();
    res.json(activities);
  });

  app.post(api.activities.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.activities.create.input.parse(req.body);
      // Override userId with authenticated user for security
      const activityData = { ...input, userId: (req.user as any).id };
      const activity = await storage.createActivity(activityData);
      await storage.createLog((req.user as any).id, "CREATE_ACTIVITY", `Created activity: ${activity.title}`);
      res.status(201).json(activity);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.patch(api.activities.update.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const updates = api.activities.update.input.parse(req.body);
    const activity = await storage.updateActivity(id, updates);
    await storage.createLog((req.user as any).id, "UPDATE_ACTIVITY", `Updated activity: ${activity.title}`);
    res.json(activity);
  });

  app.delete(api.activities.delete.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    await storage.deleteActivity(id);
    await storage.createLog((req.user as any).id, "DELETE_ACTIVITY", `Deleted activity ID: ${id}`);
    res.json({ message: "Activity deleted" });
  });

  // --- Activity Submission Routes ---
  app.get("/api/activities/:id/submissions", isAuthenticated, async (req, res) => {
    const activityId = parseInt(req.params.id as string);
    const submissions = await storage.getActivitySubmissions(activityId);
    res.json(submissions);
  });

  app.post("/api/activities/:id/submit", isAuthenticated, async (req, res) => {
    try {
      const activityId = parseInt(req.params.id as string);
      const userId = (req.user as any).id;

      // Check if user already submitted
      const existingSubmission = await storage.getUserSubmissionForActivity(userId, activityId);
      if (existingSubmission) {
        return res.status(400).json({ message: "You have already submitted for this activity" });
      }

      const { title, description, fileName, fileType, fileSize, fileData } = req.body;

      // Validate file type
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(fileType)) {
        return res.status(400).json({ message: "Invalid file type. Only PDF and Word documents are allowed." });
      }

      // Validate file size (10MB limit)
      if (fileSize > 10 * 1024 * 1024) {
        return res.status(400).json({ message: "File size too large. Maximum 10MB allowed." });
      }

      // Get activity details for folder creation
      const activity = await storage.getActivity(activityId);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      const deadline = new Date(activity.deadlineDate);
      const now = new Date();
      const isLate = now > deadline;

      // Create organized folder structure: Reports/{Year}/{Month}/Activity_{activity_id}/
      const year = deadline.getFullYear();
      const month = deadline.getMonth() + 1;

      // Create or get year folder
      let yearFolder = await storage.getFolderByNameAndParent(`${year}`, null);
      if (!yearFolder) {
        yearFolder = await storage.createFolder({
          name: `${year}`,
          parentId: null,
          createdBy: userId
        });
      }

      // Create or get month folder
      let monthFolder = await storage.getFolderByNameAndParent(`${month.toString().padStart(2, '0')}`, yearFolder.id);
      if (!monthFolder) {
        monthFolder = await storage.createFolder({
          name: `${month.toString().padStart(2, '0')}`,
          parentId: yearFolder.id,
          createdBy: userId
        });
      }

      // Create or get activity folder
      let activityFolder = await storage.getFolderByNameAndParent(`Activity_${activityId}`, monthFolder.id);
      if (!activityFolder) {
        activityFolder = await storage.createFolder({
          name: `Activity_${activityId}`,
          parentId: monthFolder.id,
          createdBy: userId
        });
      }

      // Create the report
      const report = await storage.createReport({
        title,
        description,
        fileName,
        fileType,
        fileSize,
        fileData,
        folderId: activityFolder.id,
        uploadedBy: userId,
        activityId,
        year,
        month,
        status: 'active'
      });

      // Create submission record
      const submission = await storage.createActivitySubmission({
        activityId,
        userId,
        reportId: report.id,
        status: isLate ? 'late' : 'submitted'
      });

      // Update activity status
      await storage.updateActivity(activityId, {
        status: isLate ? 'overdue' : 'completed',
        completionDate: now,
        completedBy: userId
      });

      // Log the submission
      await storage.createLog(userId, "ACTIVITY_SUBMIT", `Submitted report for activity: ${activity.title}`);

      res.status(201).json({
        submission,
        report,
        message: isLate ? "Submission received but marked as late" : "Submission successful"
      });
    } catch (err: any) {
      console.error("Submission error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Submission failed" });
    }
  });

  // --- Notification Routes ---
  app.get(api.notifications.list.path, isAuthenticated, async (req, res) => {
    const notifications = await storage.getNotifications((req.user as any).id);
    res.json(notifications);
  });

  app.post(api.notifications.markRead.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    await storage.markNotificationRead(id);
    res.json({ message: "Notification marked as read" });
  });

  // --- Logs ---
  app.get(api.logs.list.path, isAuthenticated, async (req, res) => {
    const logs = await storage.getLogs();
    res.json(logs);
  });


  // --- Seed Data Helper ---
  async function seed() {
    const admin = await storage.getUserByUsername("admin");
    if (!admin) {
      const adminPassword = await hashPassword("admin123");
      await storage.createUser({
        username: "admin",
        password: adminPassword,
        fullName: "System Admin",
        role: "admin",
        status: "active"
      });
      console.log("Seeded admin user");
    }

    const assistant = await storage.getUserByUsername("assistant");
    if (!assistant) {
      const assistantPassword = await hashPassword("assist123");
      await storage.createUser({
        username: "assistant",
        password: assistantPassword,
        fullName: "Assistant User",
        role: "assistant",
        status: "active"
      });
      console.log("Seeded assistant user");
    }
    
    // Trigger initial deadline check
    await storage.checkDeadlines();
  }

  // Run seed
  seed().catch(console.error);

  return httpServer;
}
