import { google } from 'googleapis';
import { readFileSync } from 'fs';
import path from 'path';

let drive: any = null;

/**
 * Initialize Google Drive API client using service account credentials
 */
function getDriveClient() {
  if (drive) return drive;

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './gdrive-credentials.json';
  
  let credentials: any;
  
  try {
    // Try to read from file
    const fullPath = path.resolve(credentialsPath);
    credentials = JSON.parse(readFileSync(fullPath, 'utf-8'));
  } catch (error) {
    console.error('Error reading Google credentials file:', error);
    throw new Error('Failed to load Google Drive credentials');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  drive = google.drive({ version: 'v3', auth });
  return drive;
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

    const requestBody: any = {
      name: fileName,
    };

    // Add parent folder if specified
    if (targetFolderId) {
      requestBody.parents = [targetFolderId];
    }

    const media = {
      mimeType,
      body: fileBuffer,
    };

    const response = await driveClient.files.create({
      requestBody,
      media,
      fields: 'id, name, webViewLink, webContentLink',
    });

    console.log(`[GDrive] Uploaded file: ${fileName} (ID: ${response.data.id})`);

    return {
      success: true,
      fileId: response.data.id,
      webViewLink: response.data.webViewLink,
      webContentLink: response.data.webContentLink,
    };
  } catch (error) {
    console.error('[GDrive] Error uploading file:', error);
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
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './gdrive-credentials.json';
  try {
    const fullPath = path.resolve(credentialsPath);
    const stats = require('fs').statSync(fullPath);
    return stats.isFile();
  } catch {
    return false;
  }
}
