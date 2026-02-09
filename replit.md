# Report Management System

## Overview

This is a **Report Management and File Uploading** application built for NEECO (likely a cooperative/utility organization). It provides a dashboard-based interface for managing documents, folders, activities/tasks with deadlines, and archived files. The system supports role-based access (admin/assistant), file uploads stored as Base64 in the database, a calendar view for activity tracking, and activity logging.

Key features:
- **Dashboard** with statistics (folders, files, pending/overdue tasks)
- **Drive** (file manager) with nested folders and file upload
- **Calendar/Activities** with deadline tracking and notifications
- **Archives** for soft-deleted/archived documents
- **Authentication** with session-based login (Passport.js + local strategy)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state; no global client state library
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming; custom green color palette (#023020 primary, #1f8f5f secondary, #34c38f accent)
- **Fonts**: Inter (body) and Outfit (headers/display) via Google Fonts
- **Charts**: Recharts (for dashboard analytics)
- **Date Handling**: date-fns
- **Build Tool**: Vite with React plugin
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript, executed via tsx
- **Authentication**: Passport.js with local strategy, express-session with MemoryStore
- **Password Hashing**: Node.js crypto (scrypt with random salt)
- **API Design**: REST API with routes defined in `shared/routes.ts` using Zod schemas for request/response validation. All API routes are prefixed with `/api/`
- **File Uploads**: Files are Base64-encoded and stored in the database `fileData` text field (not on disk)
- **Request Size Limit**: 50MB for JSON and URL-encoded bodies

### Shared Code (`shared/` directory)
- **Schema** (`shared/schema.ts`): Drizzle ORM table definitions and Zod insert schemas. Tables: `users`, `folders`, `reports`, `activities`, `activityLogs`, `notifications`
- **Routes** (`shared/routes.ts`): Typed API route definitions with Zod validation schemas, shared between client and server for type safety

### Database
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Database**: PostgreSQL (connection via `DATABASE_URL` environment variable)
- **Connection**: node-postgres (`pg`) Pool
- **Schema Management**: `drizzle-kit push` for schema synchronization (no migration files committed)
- **Key Tables**:
  - `users` — id, username, password (hashed), role (admin/assistant), fullName, status
  - `folders` — id, name, parentId (self-referencing for nesting), createdBy
  - `reports` — id, title, fileName, fileType, fileSize, fileData (Base64), folderId, uploadedBy, activityId, status, year, month
  - `activities` — id, userId, title, description, startDate, deadline, status (pending/completed/overdue)
  - `activityLogs` — audit trail of user actions
  - `notifications` — per-user notifications

### Storage Layer
- `server/storage.ts` implements `IStorage` interface with `DatabaseStorage` class
- Provides CRUD operations for all entities plus specialized methods (checkDeadlines, completeActivity, etc.)

### Build & Deployment
- **Development**: `tsx server/index.ts` runs the dev server with Vite middleware for HMR
- **Production Build**: Custom build script (`script/build.ts`) that:
  1. Builds client with Vite → `dist/public/`
  2. Bundles server with esbuild → `dist/index.cjs`
  3. Selectively bundles certain dependencies to reduce cold start syscalls
- **Static Serving**: In production, Express serves built files from `dist/public/` with SPA fallback

### Authentication Flow
- Session-based auth using express-session with MemoryStore
- Login via POST `/api/login` with username/password
- Session check via GET `/api/user`
- Client-side protected routes redirect to `/login` if unauthenticated
- Passwords hashed with scrypt + random salt, compared with timing-safe comparison

## External Dependencies

### Required Services
- **PostgreSQL Database**: Required. Connection string provided via `DATABASE_URL` environment variable
- **Session Secret**: `SESSION_SECRET` environment variable (falls back to dev default)

### Key npm Packages
- **Server**: express, passport, passport-local, express-session, memorystore, drizzle-orm, pg, zod
- **Client**: react, wouter, @tanstack/react-query, recharts, date-fns, react-hook-form, zod, numerous @radix-ui packages via shadcn/ui
- **Build**: vite, esbuild, tsx, drizzle-kit

### Replit-Specific Integrations
- `@replit/vite-plugin-runtime-error-modal` — Runtime error overlay in development
- `@replit/vite-plugin-cartographer` — Dev tooling (development only)
- `@replit/vite-plugin-dev-banner` — Dev banner (development only)