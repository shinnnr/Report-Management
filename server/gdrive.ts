import { google } from 'googleapis';
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';
import { Readable } from 'stream';

// Enable legacy OpenSSL provider for Node.js 22 compatibility
process.env.NODE_OPTIONS = '--openssl-legacy-provider ' + (process.env.NODE_OPTIONS || '');

let drive: any = null;

// Helper to resolve credential file path
function resolveCredentialsPath(): string | null {
  const possiblePaths = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    './gdrive-credentials.json',
    path.join(process.cwd(), 'gdrive-credentials.json'),
    path.join(process.cwd(), '..', 'gdrive-credentials.json'),
  ].filter(Boolean) as string[];

  for (const credPath of possiblePaths) {
    try {
      const fullPath = path.resolve(credPath);
      if (existsSync(fullPath) && statSync(fullPath).isFile()) {
        console.log('[GDrive] Found credentials at:', fullPath);
        return fullPath;
      }
    } catch {
      continue;
    }
  }
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
    throw new Error('Failed to load Google Drive credentials');
  }

  try {
    const credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
    console.log('[GDrive] Successfully loaded credentials from:', credentialsPath);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    drive = google.drive({ version: 'v3', auth });
    return drive;
  } catch (error) {
    console.error('[GDrive] Error loading credentials:', error);
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
  
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  
  // Check if folder ID is configured
  if (!folderId) {
    console.log('[GDrive] Not configured: GOOGLE_DRIVE_FOLDER_ID is not set');
    return false;
  }
  
  const credentialsPath = resolveCredentialsPath();
  
  if (!credentialsPath) {
    console.log('[GDrive] Not configured: credentials file not found');
    return false;
  }
  
  console.log('[GDrive] Configuration OK - Credentials:', credentialsPath, 'Folder ID:', folderId);
  return true;
}
