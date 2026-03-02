import { google } from 'googleapis';
import * as fs from 'fs';

// Google Drive API scope for file operations
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Google Drive configuration
interface GDriveConfig {
  credentialsPath: string;
  folderId?: string;
}

let config: GDriveConfig = {
  credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || './gdrive-credentials.json',
  folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
};

let driveInstance: any = null;

async function getDriveClient() {
  if (driveInstance) return driveInstance;
  
  // Check if credentials file exists
  if (!fs.existsSync(config.credentialsPath)) {
    console.log('Google Drive credentials file not found, GDrive upload disabled');
    return null;
  }
  
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: config.credentialsPath,
      scopes: SCOPES,
    });
    driveInstance = google.drive({ version: 'v3', auth });
    return driveInstance;
  } catch (error) {
    console.error('Failed to initialize Google Drive client:', error);
    return null;
  }
}

export function configureGDrive(newConfig: Partial<GDriveConfig>) {
  config = { ...config, ...newConfig };
}

export async function uploadToGoogleDrive(
  fileData: string,
  fileName: string,
  mimeType: string,
  folderId?: string
): Promise<{
  fileId: string;
  webViewLink: string;
  webContentLink: string;
  name: string;
}> {
  const drive = await getDriveClient();
  
  // If drive client is not initialized, skip upload
  if (!drive) {
    throw new Error('Google Drive not configured');
  }

  const buffer = Buffer.from(fileData, 'base64');
  const targetFolderId = folderId || config.folderId;

  const requestBody: any = {
    name: fileName,
    mimeType: mimeType,
  };

  if (targetFolderId) {
    requestBody.parents = [targetFolderId];
  }

  const media = {
    mimeType: mimeType,
    body: buffer,
  };

  try {
    const response = await drive.files.create({
      requestBody,
      media,
      fields: 'id, name, webViewLink, webContentLink',
    });

    if (!response.data.id) {
      throw new Error('Failed to upload file to Google Drive');
    }

    await drive.permissions.create({
      fileId: response.data.id!,
      requestBody: { type: 'anyone', role: 'reader' },
    });

    console.log(`File uploaded to Google Drive: ${response.data.name} (${response.data.id})`);

    return {
      fileId: response.data.id!,
      webViewLink: response.data.webViewLink || '',
      webContentLink: response.data.webContentLink || '',
      name: response.data.name || fileName,
    };
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    throw error;
  }
}

export async function deleteFromGoogleDrive(fileId: string): Promise<void> {
  const drive = await getDriveClient();
  try {
    await drive.files.delete({ fileId });
    console.log(`File deleted from Google Drive: ${fileId}`);
  } catch (error) {
    console.error('Error deleting from Google Drive:', error);
    throw error;
  }
}

export function isGDriveConfigured(): boolean {
  // Check if credentials file exists and folder ID is set
  const hasCredentials = fs.existsSync(config.credentialsPath);
  const hasFolderId = !!config.folderId;
  return hasCredentials || hasFolderId;
}

export default { configureGDrive, uploadToGoogleDrive, deleteFromGoogleDrive, isGDriveConfigured };
