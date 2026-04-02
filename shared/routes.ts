import { z } from 'zod';
import { insertUserSchema, insertFolderSchema, insertReportSchema, insertActivitySchema, insertNotificationSchema, insertHolidaySchema, users, folders, reports, activities, activityLogs, notifications, holidays, ActivityLogWithUser } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/login',
      input: z.object({
        username: z.string(),
        password: z.string(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/logout',
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/user',
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
  },
  users: {
    list: {
      method: 'GET' as const,
      path: '/api/users',
      responses: {
        200: z.array(z.custom<typeof users.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/users',
      input: insertUserSchema.extend({
        password: z.string().min(8),
      }),
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/users/:id',
      input: z.object({
        username: z.string().optional(),
        fullName: z.string().optional(),
        role: z.enum(['admin', 'cps', 'ets']).optional(),
        status: z.enum(['active', 'inactive']).optional(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/users/:id',
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    updatePassword: {
      method: 'POST' as const,
      path: '/api/users/:id/password',
      input: z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8),
      }),
      responses: {
        200: z.object({ message: z.string() }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
  },
  folders: {
    list: {
      method: 'GET' as const,
      path: '/api/folders',
      input: z.object({
        parentId: z.string().optional().transform(val => val === 'null' ? null : val ? parseInt(val) : null),
        status: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof folders.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/folders',
      input: insertFolderSchema,
      responses: {
        201: z.custom<typeof folders.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    rename: {
      method: 'PATCH' as const,
      path: '/api/folders/:id/rename',
      input: z.object({
        name: z.string().min(1),
      }),
      responses: {
        200: z.custom<typeof folders.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/folders/:id',
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    move: {
      method: 'PATCH' as const,
      path: '/api/folders/:id/move',
      input: z.object({
        targetParentId: z.number().nullable(),
      }),
      responses: {
        200: z.custom<typeof folders.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/folders/:id',
      input: insertFolderSchema.partial(),
      responses: {
        200: z.custom<typeof folders.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  reports: {
    list: {
      method: 'GET' as const,
      path: '/api/reports',
      input: z.object({
        folderId: z.string().optional(),
        status: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof reports.$inferSelect>()),
      },
    },
    count: {
      method: 'GET' as const,
      path: '/api/reports/count',
      input: z.object({
        folderId: z.string().optional(),
        status: z.string().optional(),
      }).optional(),
      responses: {
        200: z.object({ count: z.number() }),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/reports',
      input: insertReportSchema,
      responses: {
        201: z.custom<typeof reports.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    move: {
      method: 'POST' as const,
      path: '/api/reports/move',
      input: z.object({
        reportIds: z.array(z.number()),
        folderId: z.number().nullable(),
      }),
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/reports/:id',
      responses: {
        200: z.custom<typeof reports.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/reports/:id',
      input: insertReportSchema.partial(),
      responses: {
        200: z.custom<typeof reports.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/reports/:id',
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
  },
  settings: {
    get: {
      method: 'GET' as const,
      path: '/api/settings/:key',
      responses: {
        200: z.object({ value: z.string().nullable() }),
      },
    },
    set: {
      method: 'POST' as const,
      path: '/api/settings',
      input: z.object({
        key: z.string(),
        value: z.string(),
      }),
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
  },
  activities: {
    list: {
      method: 'GET' as const,
      path: '/api/activities',
      responses: {
        200: z.array(z.custom<typeof activities.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/activities',
      input: insertActivitySchema,
      responses: {
        201: z.custom<typeof activities.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/activities/:id',
      input: insertActivitySchema.partial(),
      responses: {
        200: z.custom<typeof activities.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/activities/:id',
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
  },
  notifications: {
    list: {
      method: 'GET' as const,
      path: '/api/notifications',
      responses: {
        200: z.array(z.custom<typeof notifications.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/notifications',
      responses: {
        201: z.custom<typeof notifications.$inferSelect>(),
      },
    },
    markRead: {
      method: 'POST' as const,
      path: '/api/notifications/:id/read',
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
  },
  holidays: {
    list: {
      method: 'GET' as const,
      path: '/api/holidays',
      responses: {
        200: z.array(z.custom<typeof holidays.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/holidays',
      input: insertHolidaySchema,
      responses: {
        201: z.custom<typeof holidays.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/holidays/:id',
      input: insertHolidaySchema.partial(),
      responses: {
        200: z.custom<typeof holidays.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/holidays/:id',
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
  },
  logs: {
    list: {
      method: 'GET' as const,
      path: '/api/logs',
      responses: {
        200: z.array(z.custom<ActivityLogWithUser>()),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/logs/:id',
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
    deleteAll: {
      method: 'DELETE' as const,
      path: '/api/logs',
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
