import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import MemoryStore from "memorystore";

const scryptAsync = promisify(scrypt);
const SessionStore = MemoryStore(session);

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

  // --- Session & Passport Setup ---
  app.use(
    session({
      store: new SessionStore({ checkPeriod: 86400000 }),
      secret: process.env.SESSION_SECRET || "default_secret_dev_only",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: app.get("env") === "production" },
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
    const parentId = parentIdStr === "null" ? null : (parentIdStr ? parseInt(parentIdStr) : undefined);
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
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.patch("/api/folders/:id/rename", isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const { name } = req.body;
    const folder = await storage.renameFolder(id, name);
    await storage.createLog((req.user as any).id, "RENAME_FOLDER", `Renamed folder to: ${name}`);
    res.json(folder);
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
    const folderId = folderIdStr === "root" ? null : (folderIdStr ? parseInt(folderIdStr) : undefined);
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
      const input = api.activities.create.input.parse({
        ...req.body,
        userId: (req.user as any).id
      });
      const activity = await storage.createActivity(input);
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
