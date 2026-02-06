import { z } from 'zod';
import { insertUserSchema, insertFolderSchema, insertReportSchema, insertActivitySchema, insertNotificationSchema, users, folders, reports, activities, activityLogs, notifications } from './schema';

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
  folders: {
    list: {
      method: 'GET' as const,
      path: '/api/folders',
      input: z.object({
        parentId: z.string().optional().transform(val => val === 'null' ? null : val ? parseInt(val) : null),
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
    delete: {
      method: 'DELETE' as const,
      path: '/api/folders/:id',
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
  },
  reports: {
    list: {
      method: 'GET' as const,
      path: '/api/reports',
      input: z.object({
        folderId: z.string().optional().transform(val => val ? parseInt(val) : undefined),
        status: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof reports.$inferSelect>()),
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
    markRead: {
      method: 'POST' as const,
      path: '/api/notifications/:id/read',
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
  },
  logs: {
    list: {
      method: 'GET' as const,
      path: '/api/logs',
      responses: {
        200: z.array(z.custom<typeof activityLogs.$inferSelect>()),
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
