import { google } from 'googleapis';
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';
import { Readable } from 'stream';

// Legacy OpenSSL provider note:
// If you encounter ERR_OSSL_UNSUPPORTED errors, ensure NODE_OPTIONS='--openssl-legacy-provider'
// is set when starting Node.js (not at runtime). Add to your start script:
//   "start": "NODE_OPTIONS='--openssl-legacy-provider' node dist/index.cjs"

let drive: any = null;

// Helper to resolve credential file path
function resolveCredentialsPath(): string | null {
  console.log('[GDrive] Resolving credentials path...');
  console.log('[GDrive] CWD:', process.cwd());
  console.log('[GDrive] GOOGLE_APPLICATION_CREDENTIALS env:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
  
  const possiblePaths = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    './gdrive-credentials.json',
    path.join(process.cwd(), 'gdrive-credentials.json'),
    path.join(process.cwd(), '..', 'gdrive-credentials.json'),
    path.join(__dirname, '..', 'gdrive-credentials.json'),
    path.join(__dirname, 'gdrive-credentials.json'),
  ].filter(Boolean) as string[];

  console.log('[GDrive] Checking these paths:', possiblePaths);

  for (const credPath of possiblePaths) {
    try {
      const fullPath = path.resolve(credPath);
      console.log('[GDrive] Checking path:', fullPath);
      if (existsSync(fullPath) && statSync(fullPath).isFile()) {
        console.log('[GDrive] Found credentials at:', fullPath);
        return fullPath;
      }
    } catch {
      continue;
    }
  }
  console.log('[GDrive] ERROR: Could not find credentials file');
  return null;
}

/**
 * Initialize Google Drive API client using service account credentials
 */
function getDriveClient() {
  if (drive) return drive;

  const credentialsPath = resolveCredentialsPath();
  
  if (!credentialsPath) {
    console.error('[GDrive] ERROR: Could not find Google credentials file');
    console.error('[GDrive] Current directory:', process.cwd());
    console.error('[GDrive] Files in current directory:');
    try {
      const fs = require('fs');
      console.error(fs.readdirSync(process.cwd()));
    } catch (e) {
      console.error('Could not list directory');
    }
    throw new Error('Failed to load Google Drive credentials');
  }

  try {
    const credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
    console.log('[GDrive] Successfully loaded credentials from:', credentialsPath);
    console.log('[GDrive] Service account email:', credentials.client_email);
    console.log('[GDrive] Project ID:', credentials.project_id);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    drive = google.drive({ version: 'v3', auth });
    console.log('[GDrive] Drive client initialized successfully');
    return drive;
  } catch (error) {
    console.error('[GDrive] Error loading credentials:', error);
    if (error instanceof Error) {
      console.error('[GDrive] Error message:', error.message);
      console.error('[GDrive] Error stack:', error.stack);
    }
    throw new Error('Failed to load Google Drive credentials');
  }
}

export interface UploadResult {
  success: boolean;
  fileId?: string;
  webViewLink?: string;
  webContentLink?: string;
  error?: string;
}

/**
 * Upload a file to Google Drive
 * @param fileBuffer - The file content as a Buffer
 * @param fileName - The name to give the file in Drive
 * @param mimeType - The MIME type of the file
 * @param folderId - Optional folder ID to upload into (defaults to GOOGLE_DRIVE_FOLDER_ID)
 */
export async function uploadFileToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId?: string
): Promise<UploadResult> {
  try {
    const driveClient = getDriveClient();
    const targetFolderId = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;

    console.log('[GDrive] Upload params - File:', fileName, 'Size:', fileBuffer.length, 'MimeType:', mimeType, 'Folder:', targetFolderId);

    const requestBody: any = {
      name: fileName,
    };

    // Add parent folder if specified
    if (targetFolderId) {
      requestBody.parents = [targetFolderId];
      console.log('[GDrive] Uploading to folder:', targetFolderId);
    } else {
      console.log('[GDrive] WARNING: No folder ID specified, uploading to root');
    }

    const media = {
      mimeType,
      body: Readable.from(fileBuffer),
    };

    const response = await driveClient.files.create({
      requestBody,
      media,
      fields: 'id, name, webViewLink, webContentLink',
    });

    console.log(`[GDrive] Uploaded file: ${fileName} (ID: ${response.data.id})`);
    console.log(`[GDrive] WebViewLink: ${response.data.webViewLink}`);

    return {
      success: true,
      fileId: response.data.id,
      webViewLink: response.data.webViewLink,
      webContentLink: response.data.webContentLink,
    };
  } catch (error) {
    console.error('[GDrive] Error uploading file:', error);
    if (error instanceof Error) {
      console.error('[GDrive] Error name:', error.name);
      console.error('[GDrive] Error stack:', error.stack);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Delete a file from Google Drive
 * @param fileId - The Google Drive file ID to delete
 */
export async function deleteFileFromDrive(fileId: string): Promise<boolean> {
  try {
    const driveClient = getDriveClient();
    await driveClient.files.delete({ fileId });
    console.log(`[GDrive] Deleted file: ${fileId}`);
    return true;
  } catch (error) {
    console.error('[GDrive] Error deleting file:', error);
    return false;
  }
}

/**
 * Get a file's web view link from Google Drive
 * @param fileId - The Google Drive file ID
 */
export async function getDriveFileLink(fileId: string): Promise<string | null> {
  try {
    const driveClient = getDriveClient();
    const response = await driveClient.files.get({
      fileId,
      fields: 'webViewLink, webContentLink',
    });
    return response.data.webViewLink || response.data.webContentLink || null;
  } catch (error) {
    console.error('[GDrive] Error getting file link:', error);
    return null;
  }
}

/**
 * Check if Google Drive is properly configured
 */
export function isGDriveConfigured(): boolean {
  console.log('[GDrive] Checking configuration...');
  console.log('[GDrive] GOOGLE_DRIVE_FOLDER_ID:', process.env.GOOGLE_DRIVE_FOLDER_ID);
  console.log('[GDrive] GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
  console.log('[GDrive] RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT || 'not detected');
  console.log('[GDrive] Current working directory:', process.cwd());
  
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  
  // Check if folder ID is configured
  if (!folderId) {
    console.log('[GDrive] Not configured: GOOGLE_DRIVE_FOLDER_ID is not set');
    return false;
  }
  
  const credentialsPath = resolveCredentialsPath();
  
  if (!credentialsPath) {
    console.log('[GDrive] Not configured: credentials file not found');
    console.log('[GDrive] Please ensure gdrive-credentials.json is available in Railway project files');
    return false;
  }
  
  console.log('[GDrive] Configuration OK - Credentials:', credentialsPath, 'Folder ID:', folderId);
  return true;
}

/**
 * Verify GDrive connection at startup
 */
export async function verifyGDriveConnection(): Promise<boolean> {
  try {
    console.log('[GDrive] Verifying connection at startup...');
    const configured = isGDriveConfigured();
    
    if (!configured) {
      console.log('[GDrive] WARNING: GDrive is not configured properly');
      return false;
    }
    
    // Try to get the drive client to verify credentials work
    const driveClient = getDriveClient();
    
    // Try a simple API call to verify connection
    await driveClient.files.list({
      pageSize: 1,
      fields: 'files(id, name)',
    });
    
    console.log('[GDrive] Connection verified successfully!');
    return true;
  } catch (error) {
    console.error('[GDrive] Failed to verify connection:', error);
    if (error instanceof Error) {
      console.error('[GDrive] Error:', error.message);
    }
    return false;
  }
}
