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
import { userSessions, type InsertReport, type User } from "@shared/schema";
import { format } from "date-fns";

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

async function getSubmissionHolidayConflict(date: Date, submissionDateKey?: string) {
  const holidaysEnabled = await storage.getSetting('holidays_enabled');
  if (holidaysEnabled === 'false') return null;

  const targetDateKey = submissionDateKey || format(date, 'yyyy-MM-dd');
  const holidays = await storage.getHolidays();

  return holidays.find((holiday) => {
    const holidayDateKey = format(new Date(holiday.date), 'yyyy-MM-dd');
    return holidayDateKey === targetDateKey;
  }) || null;
}

async function getOrCreateFolder(name: string, parentId: number | null, createdBy: number) {
  let folder = await storage.getActiveFolderByNameAndParent(name, parentId);
  if (folder) {
    return folder;
  }

  const existingFolder = await storage.getFolderByNameAndParentAnyStatus(name, parentId);
  if (existingFolder) {
    return existingFolder;
  }

  return storage.createFolder({
    name,
    parentId,
    createdBy,
  });
}

async function getSubmissionTargetFolder(options: {
  activityYear: number;
  activityMonthName: string;
  regulatoryAgency: string | null | undefined;
  recurrence: string | null | undefined;
  createdBy: number;
}) {
  const yearFolder = await getOrCreateFolder(`${options.activityYear}`, null, options.createdBy);
  const monthFolder = await getOrCreateFolder(options.activityMonthName, yearFolder.id, options.createdBy);
  const agencyFolderName = options.regulatoryAgency?.trim() || "Unassigned Agency";
  const agencyFolder = await getOrCreateFolder(agencyFolderName, monthFolder.id, options.createdBy);
  const submissionTypeFolderName =
    options.recurrence && options.recurrence !== "none"
      ? "Regular Submission"
      : "Special Submission";
  return getOrCreateFolder(
    submissionTypeFolderName,
    agencyFolder.id,
    options.createdBy,
  );
}

const PHILIPPINES_HOLIDAY_FEED_URL = "https://calendar.google.com/calendar/ical/en.philippines%23holiday%40group.v.calendar.google.com/public/basic.ics";
const PHILIPPINES_HOLIDAY_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

type ExternalHolidayFeedItem = {
  name: string;
  date: string;
};

let philippineHolidayFeedCache:
  | {
      fetchedAt: number;
      items: ExternalHolidayFeedItem[];
    }
  | null = null;

function unfoldIcsLines(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const unfolded: string[] = [];

  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
      continue;
    }

    unfolded.push(line);
  }

  return unfolded;
}

function decodeIcsText(value: string) {
  return value
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";");
}

function parseIcsDate(value: string) {
  const dateOnlyMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return `${year}-${month}-${day}`;
  }

  const dateTimeMatch = value.match(/^(\d{4})(\d{2})(\d{2})T/);
  if (dateTimeMatch) {
    const [, year, month, day] = dateTimeMatch;
    return `${year}-${month}-${day}`;
  }

  return null;
}

function parseHolidayFeedFromIcs(content: string): ExternalHolidayFeedItem[] {
  const lines = unfoldIcsLines(content);
  const items: ExternalHolidayFeedItem[] = [];
  const seen = new Set<string>();
  let currentName = "";
  let currentDate = "";
  let inEvent = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      currentName = "";
      currentDate = "";
      continue;
    }

    if (line === "END:VEVENT") {
      if (currentName && currentDate) {
        const key = `${currentDate}|${currentName}`;
        if (!seen.has(key)) {
          seen.add(key);
          items.push({
            name: currentName,
            date: currentDate,
          });
        }
      }

      inEvent = false;
      currentName = "";
      currentDate = "";
      continue;
    }

    if (!inEvent) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);

    if (key.startsWith("SUMMARY")) {
      currentName = decodeIcsText(value);
    } else if (key.startsWith("DTSTART")) {
      currentDate = parseIcsDate(value) || "";
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

async function getPhilippineHolidayFeed() {
  if (
    philippineHolidayFeedCache &&
    Date.now() - philippineHolidayFeedCache.fetchedAt < PHILIPPINES_HOLIDAY_CACHE_TTL_MS
  ) {
    return philippineHolidayFeedCache.items;
  }

  const response = await fetch(PHILIPPINES_HOLIDAY_FEED_URL, {
    headers: {
      Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Holiday feed request failed with status ${response.status}`);
  }

  const content = await response.text();
  const parsedItems = api.holidays.philippines.responses[200].parse(parseHolidayFeedFromIcs(content));

  philippineHolidayFeedCache = {
    fetchedAt: Date.now(),
    items: parsedItems,
  };

  return parsedItems;
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
        // Check if user is active
        if (user.status !== 'active') {
          return done(null, false, { message: "Your account has been deactivated. Please contact the administrator." });
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
  // Run deadline check at 00:00 (midnight) UTC daily for consistent timing
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  
  const scheduleDeadlineCheck = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0); // Next midnight UTC
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(async () => {
      try {
        await storage.checkDeadlines();
      } catch (err) {
        console.error("Error in checkDeadlines job:", err);
      }
      // After running, schedule next run for 24 hours later
      setInterval(async () => {
        try {
          await storage.checkDeadlines();
        } catch (err) {
          console.error("Error in checkDeadlines job:", err);
        }
      }, MS_PER_DAY);
    }, msUntilMidnight);
  };
  
  scheduleDeadlineCheck();


  // --- Auth Routes ---
  app.post(api.auth.login.path, (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        if (info?.message && info.message.includes("deactivated")) {
          return res.json({ authenticated: false, message: info.message, deactivated: true });
        }
        return res.json({ authenticated: false, message: "Invalid username or password" });
      }
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

  app.get(api.auth.me.path, isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      // Re-fetch user from database to check their current status
      const freshUser = await storage.getUser(user.id);
      if (!freshUser) {
        return res.status(401).json({ message: "User not found" });
      }
      if (freshUser.status !== 'active') {
        return res.json({ 
          message: "Your account has been deactivated by the administrator.",
          deactivated: true 
        });
      }
      res.json(user);
    } catch (err) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // --- Settings Routes ---
  app.get(api.settings.get.path, isAuthenticated, async (req, res) => {
    const key = req.params.key as string;
    const value = await storage.getSetting(key);
    res.json({ value });
  });

  app.post(api.settings.set.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.settings.set.input.parse(req.body);
      const currentUser = req.user as any;

      // Admins can change any setting; non-admins may only toggle holiday display settings when that feature is allowed
      if (currentUser.role !== 'admin') {
        if (input.key !== 'holidays_enabled' && input.key !== 'show_philippine_holidays') {
          return res.status(403).json({ message: "Only admins can update settings" });
        }
        const allowNonAdminHolidayAdd = await storage.getSetting('allow_non_admin_holiday_add');
        if (allowNonAdminHolidayAdd === 'false') {
          return res.status(403).json({ message: "Only admins can update settings" });
        }
      }

      await storage.setSetting(input.key, input.value);

      const on = input.value === 'true';
      const settingLog = (() => {
        switch (input.key) {
          case 'allow_non_admin_file_management':
            return {
              action: on ? 'FILE_MANAGEMENT_ENABLED' : 'FILE_MANAGEMENT_DISABLED',
              description: on ? 'Enabled File Management' : 'Disabled File Management',
            };
          case 'allow_non_admin_activity_delete':
            return {
              action: on ? 'ACTIVITY_DELETION_ENABLED' : 'ACTIVITY_DELETION_DISABLED',
              description: on ? 'Enabled Activity Deletion' : 'Disabled Activity Deletion',
            };
          case 'allow_non_admin_holiday_add':
            return {
              action: on ? 'HOLIDAY_MANAGEMENT_ENABLED' : 'HOLIDAY_MANAGEMENT_DISABLED',
              description: on ? 'Enabled Holiday Management' : 'Disabled Holiday Management',
            };
          case 'holidays_enabled':
            return {
              action: on ? 'HOLIDAYS_ENABLED' : 'HOLIDAYS_DISABLED',
              description: on ? 'Enabled Holidays' : 'Disabled Holidays',
            };
          case 'show_philippine_holidays':
            return {
              action: on ? 'PHILIPPINE_HOLIDAYS_ENABLED' : 'PHILIPPINE_HOLIDAYS_DISABLED',
              description: on ? 'Enabled Philippines Holidays' : 'Disabled Philippines Holidays',
            };
          case 'enable_role_filtering':
            return {
              action: on ? 'ROLE_FILTER_ENABLED' : 'ROLE_FILTER_DISABLED',
              description: on ? 'Enabled Role-Based Activity Filtering' : 'Disabled Role-Based Activity Filtering',
            };
          default:
            return null;
        }
      })();

      if (settingLog) {
        await storage.createLog(currentUser.id, settingLog.action, settingLog.description);
      } else {
        await storage.createLog(currentUser.id, 'UPDATE_SETTING', `Updated setting: ${input.key}`);
      }
      
      res.json({ message: "Setting updated successfully" });
    } catch (error) {
      console.error("Error updating setting:", error);
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // --- User Routes ---
  app.get(api.users.list.path, isAuthenticated, async (req, res) => {
    const users = await storage.getUsers();
    res.json(users);
  });

  // Create user (Admin only)
  app.post(api.users.create.path, isAuthenticated, async (req, res) => {
    try {
      // Check if user is admin
      const currentUser = req.user as any;
      if (currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can create users" });
      }

      const input = api.users.create.input.parse(req.body);
      
      // Hash the password
      const hashedPassword = await hashPassword(input.password);
      
      const user = await storage.createUser({
        username: input.username,
        password: hashedPassword,
        role: input.role || 'cps',
        fullName: input.fullName,
        status: 'active'
      });
      
      await storage.createLog(currentUser.id, "CREATE_USER", `Created user: ${user.username}`);
      res.status(201).json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err.message.includes('unique') || err.message.includes('duplicate')) {
        return res.status(400).json({ message: "Username already exists" });
      }
      res.status(400).json({ message: err.message });
    }
  });

  // Update user (Admin can update any user, users can update their own profile)
  app.patch(api.users.update.path, isAuthenticated, async (req, res) => {
    try {
      const userId = parseInt(req.params.id as string);
      const currentUser = req.user as any;
      
      // Check if user has permission: admin or own profile
      if (currentUser.role !== 'admin' && currentUser.id !== userId) {
        return res.status(403).json({ message: "You can only update your own profile" });
      }

      const input = api.users.update.input.parse(req.body);

      // Check if this is a self-update
      const isSelfUpdate = currentUser.id === userId;

      // If not admin, restrict what fields can be updated
      if (currentUser.role !== 'admin') {
        // Non-admins can only update username, fullName, and profilePicture
        const allowedUpdates: Partial<User> = {};
        if (input.username) allowedUpdates.username = input.username;
        if (input.fullName) allowedUpdates.fullName = input.fullName;
        if (input.profilePicture !== undefined) allowedUpdates.profilePicture = input.profilePicture;

        const user = await storage.updateUser(userId, allowedUpdates);

        // Log specific profile update actions
        if (input.profilePicture !== undefined) {
          await storage.createLog(currentUser.id, input.profilePicture ? "UPDATE_PROFILE_PICTURE" : "REMOVE_PROFILE_PICTURE", input.profilePicture ? `Updated profile picture` : `Removed profile picture`);
        } else if (input.username) {
          await storage.createLog(currentUser.id, "UPDATE_USERNAME", `Changed username to ${input.username}`);
        } else if (input.fullName) {
          await storage.createLog(currentUser.id, "UPDATE_NAME", `Changed name to ${input.fullName}`);
        } else {
          await storage.createLog(currentUser.id, "UPDATE_PROFILE", `Updated own profile`);
        }

        return res.json(user);
      }

      // Admin updates
      const user = await storage.updateUser(userId, input);

      // Log specific actions based on what was updated
      if (input.role) {
        const displayName = user.fullName?.replace(/\s+User$/i, '') || user.username;
        await storage.createLog(currentUser.id, "CHANGE_ROLE", `Changed user ${displayName} (${user.username}) to ${input.role} role`);
      } else if (input.status) {
        const displayName = user.fullName?.replace(/\s+User$/i, '') || user.username;
        await storage.createLog(currentUser.id, input.status === "active" ? "ACTIVATE_USER" : "DEACTIVATE_USER", `${input.status === "active" ? "Activated" : "Deactivated"} user ${displayName} (${user.username})`);
      } else if (input.profilePicture !== undefined) {
        if (isSelfUpdate) {
          await storage.createLog(currentUser.id, input.profilePicture ? "UPDATE_PROFILE_PICTURE" : "REMOVE_PROFILE_PICTURE", input.profilePicture ? `Updated profile picture` : `Removed profile picture`);
        } else {
          const displayName = user.fullName?.replace(/\s+User$/i, '') || user.username;
          await storage.createLog(currentUser.id, input.profilePicture ? "UPDATE_PROFILE_PICTURE" : "REMOVE_PROFILE_PICTURE", input.profilePicture ? `Updated profile picture for ${displayName}` : `Removed profile picture for ${displayName}`);
        }
      } else if (input.username !== undefined) {
        if (isSelfUpdate) {
          await storage.createLog(currentUser.id, "UPDATE_USERNAME", `Changed username to ${input.username}`);
        } else {
          const displayName = user.fullName?.replace(/\s+User$/i, '') || user.username;
          await storage.createLog(currentUser.id, "UPDATE_USERNAME", `Changed username for ${displayName} to ${input.username}`);
        }
      } else if (input.fullName !== undefined) {
        if (isSelfUpdate) {
          await storage.createLog(currentUser.id, "UPDATE_NAME", `Changed name to ${input.fullName}`);
        } else {
          await storage.createLog(currentUser.id, "UPDATE_NAME", `Changed name for ${user.username} to ${input.fullName}`);
        }
      } else {
        await storage.createLog(currentUser.id, "UPDATE_USER", `Updated user: ${user.username}`);
      }
      res.json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err.message.includes('unique') || err.message.includes('duplicate')) {
        return res.status(400).json({ message: "Username already exists" });
      }
      res.status(400).json({ message: err.message });
    }
  });

  // Delete user (Admin only)
  app.delete(api.users.delete.path, isAuthenticated, async (req, res) => {
    try {
      const userId = parseInt(req.params.id as string);
      const currentUser = req.user as any;
      
      // Check if user is admin
      if (currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can delete users" });
      }

      // Prevent admin from deleting themselves
      if (currentUser.id === userId) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.deleteUser(userId);
      await storage.createLog(currentUser.id, "DELETE_USER", `Deleted user: ${user.username}`);
      res.json({ message: "User deleted successfully" });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Update password
  app.post(api.users.updatePassword.path, isAuthenticated, async (req, res) => {
    try {
      const userId = parseInt(req.params.id as string);
      const currentUser = req.user as any;
      
      // Check if user has permission: admin or own profile
      if (currentUser.role !== 'admin' && currentUser.id !== userId) {
        return res.status(403).json({ message: "You can only change your own password" });
      }

      const { currentPassword, newPassword } = api.users.updatePassword.input.parse(req.body);
      
      // Get the user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isValid = await comparePassword(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Hash new password
      const hashedPassword = await hashPassword(newPassword);
      
      // Update password
      await storage.updateUser(userId, { password: hashedPassword });
      await storage.createLog(currentUser.id, "CHANGE_PASSWORD", `Changed password`);
      
      res.json({ message: "Password updated successfully" });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message });
    }
  });

  // --- Folder Routes ---
  app.get(api.folders.list.path, isAuthenticated, async (req, res) => {
    const parentIdStr = req.query.parentId as string | undefined;
    const status = req.query.status as string | undefined;

    // If no parentId specified, return root folders
    if (!parentIdStr) {
      const folders = await storage.getFolders(null, status);
      res.json(folders);
      return;
    }

    // If parentId is 'all', return all folders (for breadcrumbs)
    if (parentIdStr === 'all') {
      const folders = await storage.getFolders(undefined, status);
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

    const folders = await storage.getFolders(parentId, status);
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

  app.patch(api.folders.update.path, isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const updates = api.folders.update.input.parse(req.body);
      const folder = await storage.updateFolder(id, updates);

      // Log specific action based on what was updated
      if (updates.status === 'archived') {
        await storage.createLog((req.user as any).id, "ARCHIVE_FOLDER", `Archived folder: ${folder.name}`);
      } else if (updates.status === 'active') {
        await storage.createLog((req.user as any).id, "RESTORE_FOLDER", `Restored folder: ${folder.name}`);
      } else {
        await storage.createLog((req.user as any).id, "UPDATE_FOLDER", `Updated folder: ${folder.name}`);
      }

      res.json(folder);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message });
    }
  });

  app.delete(api.folders.delete.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const folder = await storage.getFolder(id);
    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }
    await storage.deleteFolder(id);
    const truncatedName = folder.name.length > 20 ? folder.name.substring(0, 20) + "..." : folder.name;
    await storage.createLog((req.user as any).id, "DELETE_FOLDER", `Deleted folder ${truncatedName}`);
    res.json({ message: "Folder deleted" });
  });

  // --- Report Routes ---
  app.get(api.reports.list.path, isAuthenticated, async (req, res) => {
    const folderIdStr = req.query.folderId as string | undefined;
    let folderId: number | null | undefined;

    if (folderIdStr === "null" || folderIdStr === "root" || folderIdStr === "") {
      folderId = null;
    } else if (folderIdStr !== undefined) {
      folderId = parseInt(folderIdStr);
      if (isNaN(folderId)) folderId = null;
    }
    // If folderIdStr is undefined, folderId remains undefined, meaning get all reports

    const status = req.query.status as string | undefined;
    const reports = await storage.getReports(folderId, status);
    res.json(reports);
  });

  // Count reports endpoint (lightweight, no fileData)
  app.get(api.reports.count.path, isAuthenticated, async (req, res) => {
    const folderIdStr = req.query.folderId as string | undefined;
    let folderId: number | null | undefined;

    if (folderIdStr === "null" || folderIdStr === "root" || folderIdStr === "") {
      folderId = null;
    } else if (folderIdStr !== undefined) {
      folderId = parseInt(folderIdStr);
      if (isNaN(folderId)) folderId = null;
    }

    const status = req.query.status as string | undefined;
    const count = await storage.getReportsCount(folderId, status);
    res.json({ count });
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

      // Check for duplicate file name in the same folder and append (n) if needed
      const existingReports = input.folderId === null ? [] : await storage.getReports(input.folderId);
      let finalFileName = input.fileName;
      let counter = 1;
      const nameWithoutExt = input.fileName.replace(/\.[^/.]+$/, '');
      const ext = input.fileName.includes('.') ? '.' + input.fileName.split('.').pop() : '';

      while (existingReports.some(r => r.fileName === finalFileName)) {
        finalFileName = `${nameWithoutExt} (${counter})${ext}`;
        counter++;
      }

      // Update the input with the unique filename
      const reportInput = {
        ...input,
        fileName: finalFileName,
        title: finalFileName // Also update title to match
      };

      const report = await storage.createReport(reportInput);
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
    try {
      const id = parseInt(req.params.id as string);
      const updates = api.reports.update.input.parse(req.body);
      const report = await storage.updateReport(id, updates);

      // Log specific action based on what was updated
      if (updates.status === 'archived') {
        await storage.createLog((req.user as any).id, "ARCHIVE_REPORT", `Archived report: ${report.title}`);
      } else if (updates.status === 'active') {
        await storage.createLog((req.user as any).id, "RESTORE_REPORT", `Restored report: ${report.title}`);
      } else if (updates.fileName || updates.title) {
        await storage.createLog((req.user as any).id, "RENAME_REPORT", `Renamed file to: ${updates.fileName || updates.title}`);
      } else {
        await storage.createLog((req.user as any).id, "UPDATE_REPORT", `Updated report: ${report.title}`);
      }

      res.json(report);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete(api.reports.delete.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const report = await storage.getReport(id);
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }
    await storage.deleteReport(id);
    const truncatedTitle = report.title.length > 20 ? report.title.substring(0, 20) + "..." : report.title;
    await storage.createLog((req.user as any).id, "DELETE_REPORT", `Deleted report ${truncatedTitle}`);
    res.json({ message: "Report deleted" });
  });

  app.get(api.activities.list.path, isAuthenticated, async (req, res) => {
    const user = (req.user as any);
    const userRole = user?.role;
    const userDepartment = userRole === 'cps' ? 'CITET-CPS' : userRole === 'ets' ? 'CITET-ETS' : null;
    
    let activities = await storage.getActivities();
    
    // Get the role-based filtering setting
    const enableRoleFiltering = await storage.getSetting('enable_role_filtering');
    const isRoleFilteringEnabled = enableRoleFiltering !== 'false'; // Default to true if not set
    
    // Filter activities based on user role (only if enabled)
    if (isRoleFilteringEnabled && (userRole === 'cps' || userRole === 'ets')) {
      if (userRole === 'cps') {
        activities = activities.filter(a => 
          a.concernDepartment?.includes('CITET-CPS')
        );
      } else if (userRole === 'ets') {
        activities = activities.filter(a => 
          a.concernDepartment?.includes('CITET-ETS')
        );
      }
    }
    // Admin sees all activities
    
    res.json(activities);
  });

  app.post(api.activities.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.activities.create.input.parse(req.body);

      // Check if deadline falls on a holiday or weekend
      const deadlineDate = new Date(input.deadlineDate);
      const dayOfWeek = deadlineDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6

      // Check if it's a holiday (only when the holidays feature is enabled)
      const holidaysEnabledSetting = await storage.getSetting('holidays_enabled');
      const holidaysEnabled = holidaysEnabledSetting !== 'false';

      const holidays = await storage.getHolidays();
      const isHoliday = holidays.some(holiday =>
        holiday.date.getFullYear() === deadlineDate.getFullYear() &&
        holiday.date.getMonth() === deadlineDate.getMonth() &&
        holiday.date.getDate() === deadlineDate.getDate()
      );

      if (isWeekend || (holidaysEnabled && isHoliday)) {
        return res.status(400).json({
          message: `Cannot create activities on ${holidaysEnabled && isHoliday ? 'holidays' : 'weekends'}. Activities will be automatically moved to the previous working day.`
        });
      }

      // Check if deadline is in the past - if so, mark as overdue immediately
      const now = new Date();
      const isOverdue = deadlineDate < now;
      
      // Override userId with authenticated user for security
      // Also set status to overdue if deadline is in the past
      const activityData = { 
        ...input, 
        userId: (req.user as any).id,
        ...(isOverdue && { status: 'overdue' })
      };
      const activity = await storage.createActivity(activityData);
      
      // Get creator's user info for notification
      const [creator] = await storage.getUsers();
      const creatorUser = creator.id === (req.user as any).id ? creator : await storage.getUser((req.user as any).id);
      
      await storage.createLog((req.user as any).id, "CREATE_ACTIVITY", `Created activity: ${activity.title}`);

      // Create notification for all users (except the creator)
      const users = await storage.getUsers();
      await storage.createNotifications(
        users
          .filter((user) => user.id !== (req.user as any).id)
          .map((user) => ({
            userId: user.id,
            activityId: activity.id,
            title: "New Activity Added",
            content: `${activity.title}\nAdded by: ${creatorUser?.fullName || 'Unknown'}\nConcern Department: ${input.concernDepartment || 'N/A'}`,
            isRead: false,
          }))
      );
      
      res.status(201).json(activity);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const zodMessage = err.errors[0]?.message;
        console.error("[Activity] Zod validation error:", err.errors);
        return res.status(400).json({ message: zodMessage ?? "Validation error" });
      }
      console.error("[Activity] Error creating activity:", err);
      throw err;
    }
  });

  app.post(api.activities.createMany.path, isAuthenticated, async (req, res) => {
    try {
      const { activities: inputActivities } = api.activities.createMany.input.parse(req.body);
      const userId = (req.user as any).id;

      const activitiesToCreate = inputActivities.map((activity) => ({
        ...activity,
        userId,
      }));

      const createdActivities = await storage.createActivities(activitiesToCreate);
      res.status(201).json({
        activities: createdActivities,
        createdCount: createdActivities.length,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        const zodMessage = err.errors[0]?.message;
        console.error("[Activity] Bulk create validation error:", err.errors);
        return res.status(400).json({ message: zodMessage ?? "Validation error" });
      }
      console.error("[Activity] Error creating activities in bulk:", err);
      throw err;
    }
  });

  app.patch(api.activities.update.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const parsedInput = api.activities.update.input.parse(req.body);
    const { applyToSeries, ...updates } = parsedInput;

    const activity = applyToSeries && updates.deadlineDate
      ? await storage.rescheduleRecurringActivitySeries(id, updates.deadlineDate)
      : await storage.updateActivity(id, updates);
    
    // Check if deadlineDate was changed - this is a reschedule operation
    if (updates.deadlineDate) {
      await storage.createLog(
        (req.user as any).id,
        "MOVE_ACTIVITY",
        `${applyToSeries ? 'Moved recurring activity series' : 'Moved activity'}: ${activity.title} to ${new Date(activity.deadlineDate).toLocaleDateString()}`
      );
    } else {
      await storage.createLog((req.user as any).id, "UPDATE_ACTIVITY", `Updated activity: ${activity.title}`);
    }
    
    res.json(activity);
  });

  app.delete(api.activities.delete.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    await storage.deleteActivity(id);
    await storage.createLog((req.user as any).id, "DELETE_ACTIVITY", `Deleted activity ID: ${id}`);
    res.json({ message: "Activity deleted" });
  });

  app.post(api.activities.deleteMany.path, isAuthenticated, async (req, res) => {
    const { ids } = api.activities.deleteMany.input.parse(req.body);
    const deletedCount = await storage.deleteActivities(ids);
    await storage.createLog(
      (req.user as any).id,
      "DELETE_ACTIVITY",
      `Deleted ${deletedCount} activities in batch`,
    );
    res.json({
      message: deletedCount === 1 ? "Activity deleted" : "Activities deleted",
      deletedCount,
    });
  });

  // GET single activity by ID
  app.get("/api/activities/:id", isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const activity = await storage.getActivity(id);
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }
    res.json(activity);
  });

  // --- Start Activity Route ---
  app.post("/api/activities/:id/start", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const userId = (req.user as any).id;
      
      const activity = await storage.getActivity(id);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }
      
      if (activity.status !== 'pending') {
        return res.status(400).json({ message: "Only pending activities can be started" });
      }
      
      await storage.startActivity(id, userId);
      res.json({ message: "Activity started" });
    } catch (err) {
      console.error("Error starting activity:", err);
      res.status(500).json({ message: "Failed to start activity" });
    }
  });

  // --- Manual Deadline Check Route ---
  app.post("/api/check-deadlines", isAuthenticated, async (req, res) => {
    try {
      await storage.checkDeadlines();
      res.json({ message: "Deadline check completed" });
    } catch (err) {
      console.error("Error in manual deadline check:", err);
      res.status(500).json({ message: "Failed to check deadlines" });
    }
  });

  // --- Holiday Routes ---
  app.get(api.holidays.list.path, isAuthenticated, async (req, res) => {
    const holidays = await storage.getHolidays();
    res.json(holidays);
  });

  app.get(api.holidays.philippines.path, isAuthenticated, async (_req, res) => {
    try {
      const holidays = await getPhilippineHolidayFeed();
      res.json(holidays);
    } catch (error) {
      console.error("Failed to fetch Philippines holiday feed:", error);
      res.status(500).json({ message: "Failed to fetch Philippines holidays" });
    }
  });

  app.post(api.holidays.create.path, isAuthenticated, async (req, res) => {
    try {
      const currentUser = req.user as any;

      // Check if user is admin or holiday management is allowed for non-admins
      if (currentUser.role !== 'admin') {
        const allowNonAdminHolidayAdd = await storage.getSetting('allow_non_admin_holiday_add');
        // Default to true if setting doesn't exist, meaning holiday management is allowed by default
        const holidayManagementAllowed = allowNonAdminHolidayAdd !== 'false';
        if (!holidayManagementAllowed) {
          return res.status(403).json({ message: "Holiday management is disabled for your role" });
        }
      }

      const input = api.holidays.create.input.parse(req.body);
      const holiday = await storage.createHoliday(input);
      await storage.createLog((req.user as any).id, "CREATE_HOLIDAY", `Created holiday: ${holiday.name}`);
      res.status(201).json(holiday);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message });
    }
  });

  app.patch(api.holidays.update.path, isAuthenticated, async (req, res) => {
    try {
      const currentUser = req.user as any;

      // Check if user is admin or holiday management is allowed for non-admins
      if (currentUser.role !== 'admin') {
        const allowNonAdminHolidayAdd = await storage.getSetting('allow_non_admin_holiday_add');
        // Default to true if setting doesn't exist, meaning holiday management is allowed by default
        const holidayManagementAllowed = allowNonAdminHolidayAdd !== 'false';
        if (!holidayManagementAllowed) {
          return res.status(403).json({ message: "Holiday management is disabled for your role" });
        }
      }

      const id = parseInt(req.params.id as string);
      const updates = api.holidays.update.input.parse(req.body);
      const holiday = await storage.updateHoliday(id, updates);
      await storage.createLog((req.user as any).id, "UPDATE_HOLIDAY", `Updated holiday: ${holiday.name}`);
      res.json(holiday);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message });
    }
  });

  app.delete(api.holidays.delete.path, isAuthenticated, async (req, res) => {
    try {
      const currentUser = req.user as any;

      // Check if user is admin or holiday management is allowed for non-admins
      if (currentUser.role !== 'admin') {
        const allowNonAdminHolidayAdd = await storage.getSetting('allow_non_admin_holiday_add');
        // Default to true if setting doesn't exist, meaning holiday management is allowed by default
        const holidayManagementAllowed = allowNonAdminHolidayAdd !== 'false';
        if (!holidayManagementAllowed) {
          return res.status(403).json({ message: "Holiday management is disabled for your role" });
        }
      }

      const id = parseInt(req.params.id as string);
      const holiday = await storage.getHoliday(id);
      if (!holiday) {
        return res.status(404).json({ message: "Holiday not found" });
      }
      await storage.deleteHoliday(id);
      await storage.createLog((req.user as any).id, "DELETE_HOLIDAY", `Deleted holiday: ${holiday.name}`);
      res.json({ message: "Holiday deleted successfully" });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // --- Activity Submission Routes ---
  app.get("/api/activities/:id/submissions", isAuthenticated, async (req, res) => {
    try {
      const activityId = parseInt(req.params.id as string, 10);
      if (Number.isNaN(activityId)) {
        return res.status(400).json({ message: "Invalid activity ID" });
      }

      const submissions = await storage.getActivitySubmissions(activityId);
      res.json(submissions);
    } catch (err: any) {
      console.error("Failed to fetch activity submissions:", err);
      res.status(500).json({ message: "Failed to fetch activity submissions" });
    }
  });

  app.post("/api/activities/:id/submit", isAuthenticated, async (req, res) => {
    try {
      const activityId = parseInt(req.params.id as string);
      const userId = (req.user as any).id;
      const suppressNotification = req.body.suppressNotification === true;

      // Allow multiple submissions to the same activity (user can upload additional files)
      // No check needed here as we want to allow multiple files per activity

      const { title, description, fileName, fileType, fileSize, fileData, deadlineYear, deadlineMonth, submissionDate, submissionDateKey, remarks } = req.body;

      // Validate file type
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(fileType)) {
        return res.status(400).json({ message: "Invalid file type. Only PDF and Word documents are allowed." });
      }

      // No file size limit - allow larger files

      // Get activity details for folder creation
      const activity = await storage.getActivity(activityId);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      const deadline = new Date(activity.deadlineDate);
      const now = submissionDate ? new Date(submissionDate) : new Date();
      const holidayConflict = await getSubmissionHolidayConflict(now, submissionDateKey);
      if (holidayConflict) {
        return res.status(400).json({
          message: "Submission date is a holiday"
        });
      }
      const isLate = now > deadline;

      // Create organized folder structure: {Activity Year}/{Activity Month}/(files uploaded)
      // Use deadlineYear and deadlineMonth from client if available (represents local timezone)
      // Otherwise extract from the deadline date
      let activityYear: number;
      let activityMonth: number;
      
      if (deadlineYear && deadlineMonth) {
        // Use client-provided year/month (in local timezone)
        activityYear = deadlineYear;
        activityMonth = deadlineMonth - 1; // Convert 1-indexed to 0-indexed
      } else {
        // Fallback: extract from ISO string to avoid timezone issues
        const deadlineISO = deadline.toISOString();
        activityYear = parseInt(deadlineISO.substring(0, 4));
        activityMonth = parseInt(deadlineISO.substring(5, 7)) - 1; // 0-indexed
      }
      
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const activityMonthName = monthNames[activityMonth];

      const submissionFolder = await getSubmissionTargetFolder({
        activityYear,
        activityMonthName,
        regulatoryAgency: activity.regulatoryAgency,
        recurrence: activity.recurrence,
        createdBy: userId,
      });

      // Check for duplicate file name and append (n) if needed
      const existingReports = await storage.getReports(submissionFolder.id);
      let finalFileName = fileName;
      let counter = 1;
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
      const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
      
      while (existingReports.some(r => r.fileName === finalFileName)) {
        finalFileName = `${nameWithoutExt} (${counter})${ext}`;
        counter++;
      }

      // Create the report
      const report = await storage.createReport({
        title,
        description,
        fileName: finalFileName,
        fileType,
        fileSize,
        fileData,
        folderId: submissionFolder.id,
        uploadedBy: userId,
        activityId,
        year: activityYear,
        month: deadline.getMonth() + 1,
        status: 'active'
      });

      // Create submission record
      const submission = await storage.createActivitySubmission({
        activityId,
        userId,
        reportId: report.id,
        status: isLate ? 'late' : 'submitted',
        submissionDate: now,
        notes: typeof remarks === "string" && remarks.trim().length > 0 ? remarks.trim() : null,
      });

      // Update activity status - mark as 'late' if overdue, 'completed' otherwise
      await storage.updateActivity(activityId, {
        status: isLate ? 'late' : 'completed',
        completionDate: now,
        completedBy: userId
      });

      // Log the submission
      await storage.createLog(userId, "ACTIVITY_SUBMIT", `Submitted report for activity: ${activity.title}`);

      // Create notification for all OTHER users about the submission
      if (!suppressNotification) {
        const users = await storage.getUsers();
        const submittingUser = await storage.getUser(userId);
        for (const user of users) {
          // Exclude the submitter from receiving notification
          if (user.id !== userId) {
            await storage.createNotification({
              userId: user.id,
              activityId: activity.id,
              title: "Activity Submitted",
              content: `${submittingUser?.fullName || 'A user'} submitted a report for: ${activity.title}`,
              isRead: false
            });
          }
        }
      }

      res.status(201).json({
        submission,
        report,
        message: isLate ? "Submission successful (marked as late)" : "Submission successful",
        isLate
      });
    } catch (err: any) {
      console.error("Submission error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Submission failed" });
    }
  });

  // Batch submit endpoint - submit multiple files at once
  app.post("/api/activities/:id/submit-batch", isAuthenticated, async (req, res) => {
    try {
      const activityId = parseInt(req.params.id as string);
      const userId = (req.user as any).id;
      const { files, activityTitle, suppressNotification, deadlineYear, deadlineMonth, submissionDate, submissionDateKey, remarks } = req.body;

      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ message: "No files provided" });
      }

      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      const hasInvalidFileType = files.some((file) => !allowedTypes.includes(file.type));
      if (hasInvalidFileType) {
        return res.status(400).json({ message: "Invalid file type. Only PDF and Word documents are allowed." });
      }

      // Get activity details for folder creation
      const activity = await storage.getActivity(activityId);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      const deadline = new Date(activity.deadlineDate);
      const now = submissionDate ? new Date(submissionDate) : new Date();
      const holidayConflict = await getSubmissionHolidayConflict(now, submissionDateKey);
      if (holidayConflict) {
        return res.status(400).json({
          message: "Submission date is a holiday"
        });
      }
      const isLate = now > deadline;

      // Calculate year/month (use client-provided values or extract from deadline)
      let activityYear: number;
      let activityMonth: number;
      
      if (deadlineYear && deadlineMonth) {
        activityYear = deadlineYear;
        activityMonth = deadlineMonth - 1;
      } else {
        const deadlineISO = deadline.toISOString();
        activityYear = parseInt(deadlineISO.substring(0, 4));
        activityMonth = parseInt(deadlineISO.substring(5, 7)) - 1;
      }
      
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const activityMonthName = monthNames[activityMonth];

      const submissionFolder = await getSubmissionTargetFolder({
        activityYear,
        activityMonthName,
        regulatoryAgency: activity.regulatoryAgency,
        recurrence: activity.recurrence,
        createdBy: userId,
      });

      // Get existing reports in the submission folder
      const existingReports = await storage.getReports(submissionFolder.id);

      const reportInputs: InsertReport[] = [];
      for (const file of files) {
        // Check for duplicate file name and append (n) if needed
        let finalFileName = file.name;
        let counter = 1;
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
        
        while (existingReports.some(r => r.fileName === finalFileName)) {
          finalFileName = `${nameWithoutExt} (${counter})${ext}`;
          counter++;
        }

        const reportInput: InsertReport = {
          title: `${activityTitle} - ${file.name}`,
          description: `Submission for activity: ${activityTitle}`,
          fileName: finalFileName,
          fileType: file.type,
          fileSize: file.size,
          fileData: file.data,
          folderId: submissionFolder.id,
          uploadedBy: userId,
          activityId,
          year: activityYear,
          month: deadline.getMonth() + 1,
          status: 'active'
        };

        reportInputs.push(reportInput);
        existingReports.push({ fileName: finalFileName } as any);
      }

      const createdReports = await storage.createReports(reportInputs);
      await storage.createActivitySubmissions(
        createdReports.map((report) => ({
          activityId,
          userId,
          reportId: report.id,
          status: isLate ? 'late' : 'submitted',
          submissionDate: now,
          notes: typeof remarks === "string" && remarks.trim().length > 0 ? remarks.trim() : null,
        }))
      );

      // Update activity status
      await storage.updateActivity(activityId, {
        status: isLate ? 'late' : 'completed',
        completionDate: now,
        completedBy: userId
      });

      // Log the submission
      await storage.createLog(userId, "ACTIVITY_SUBMIT", `Submitted ${files.length} report(s) for activity: ${activity.title}`);

      // Create notification
      if (!suppressNotification) {
        const users = await storage.getUsers();
        const submittingUser = await storage.getUser(userId);
        await storage.createNotifications(
          users
            .filter((user) => user.id !== userId)
            .map((user) => ({
              userId: user.id,
              activityId: activity.id,
              title: "Activity Submitted",
              content: `${submittingUser?.fullName || 'A user'} submitted ${files.length} files for: ${activity.title}`,
              isRead: false,
            }))
        );
      }

      res.status(201).json({
        message: isLate ? `Submitted ${files.length} files (marked as late)` : `Successfully submitted ${files.length} files`,
        reports: createdReports,
        isLate
      });
    } catch (err: any) {
      console.error("Batch submission error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Batch submission failed" });
    }
  });

  // --- Notification Routes ---
  app.get(api.notifications.list.path, isAuthenticated, async (req, res) => {
    const user = (req.user as any);
    const userId = user.id;
    
    // Get all notifications for the user (no filtering by role)
    const notifications = await storage.getNotifications(userId);
    
    res.json(notifications);
  });

  app.post(api.notifications.create.path, isAuthenticated, async (req, res) => {
    const { userId, activityId, title, content, isRead } = req.body;
    const notification = await storage.createNotification({
      userId,
      activityId: activityId || null,
      title,
      content,
      isRead: isRead || false
    });
    res.status(201).json(notification);
  });

  app.post(api.notifications.markRead.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    await storage.markNotificationRead(id);
    res.json({ message: "Notification marked as read" });
  });

  app.delete("/api/notifications/:id", isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id as string);
    await storage.deleteNotification(id);
    res.json({ message: "Notification deleted" });
  });

  app.delete("/api/notifications", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).id;
    await storage.deleteAllNotifications(userId);
    res.json({ message: "All notifications deleted" });
  });

  // --- Logs ---
  app.get(api.logs.list.path, isAuthenticated, async (req, res) => {
    const logs = await storage.getLogs();
    res.json(logs);
  });

  // Delete a single log (admin only)
  app.delete(api.logs.delete.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can delete logs" });
      }
      
      const logId = parseInt(req.params.id as string);
      if (isNaN(logId)) {
        return res.status(400).json({ message: "Invalid log ID" });
      }
      
      await storage.deleteLog(logId);
      res.json({ message: "Log deleted successfully" });
    } catch (err) {
      console.error("Error deleting log:", err);
      res.status(500).json({ message: "Failed to delete log" });
    }
  });

  // Delete all logs (admin only)
  app.delete(api.logs.deleteAll.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can delete all logs" });
      }
      
      await storage.deleteAllLogs();
      res.json({ message: "All logs deleted successfully" });
    } catch (err) {
      console.error("Error deleting logs:", err);
      res.status(500).json({ message: "Failed to delete logs" });
    }
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

    // Seed CPS and ETS users if they don't exist
    const cps = await storage.getUserByUsername("cps");
    if (!cps) {
      const cpsPassword = await hashPassword("cps123");
      await storage.createUser({
        username: "cps",
        password: cpsPassword,
        fullName: "CPS User",
        role: "cps",
        status: "active"
      });
      console.log("Seeded CPS user");
    }

    const ets = await storage.getUserByUsername("ets");
    if (!ets) {
      const etsPassword = await hashPassword("ets123");
      await storage.createUser({
        username: "ets",
        password: etsPassword,
        fullName: "ETS User",
        role: "ets",
        status: "active"
      });
      console.log("Seeded ETS user");
    }
    
    // Trigger initial deadline check
    await storage.checkDeadlines();
  }

  // Run seed
  seed().catch(console.error);

  return httpServer;
}
