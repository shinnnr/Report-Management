import { google } from 'googleapis';
import * as fs from 'fs';

// Google Drive API scope for file operations
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Google Drive configuration
interface GDriveConfig {
  credentialsPath: string;
  credentialsJson: string;
  folderId?: string;
}

let config: GDriveConfig = {
  credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || './gdrive-credentials.json',
  credentialsJson: process.env.GOOGLE_CREDENTIALS_JSON || '',
  folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '1_l0arYV5YJjouuU54RxOIod04u4bd3oA',
};

let driveInstance: any = null;

async function getDriveClient() {
  if (driveInstance) return driveInstance;
  
  // Try to get credentials from JSON env var first, then from file
  let credentials: any = null;
  
  if (config.credentialsJson) {
    try {
      credentials = JSON.parse(config.credentialsJson);
    } catch (e) {
      console.error('Failed to parse GOOGLE_CREDENTIALS_JSON:', e);
    }
  }
  
  if (!credentials && fs.existsSync(config.credentialsPath)) {
    try {
      const fileContent = fs.readFileSync(config.credentialsPath, 'utf8');
      credentials = JSON.parse(fileContent);
    } catch (e) {
      console.error('Failed to read credentials file:', e);
    }
  }
  
  if (!credentials) {
    console.log('Google Drive credentials not found, GDrive upload disabled');
    return null;
  }
  
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
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
  console.log('Attempting to upload to Google Drive...');
  console.log('- File:', fileName);
  console.log('- Type:', mimeType);
  console.log('- Configured:', isGDriveConfigured());
  
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
  // Check if credentials exist (either as JSON or file) and folder ID is set
  const hasJsonCredentials = !!process.env.GOOGLE_CREDENTIALS_JSON;
  const hasFileCredentials = fs.existsSync('./gdrive-credentials.json');
  const hasFolderId = !!config.folderId;
  
  console.log('GDrive Config Check:');
  console.log('- Has JSON credentials:', hasJsonCredentials);
  console.log('- Has file credentials:', hasFileCredentials);
  console.log('- Has folder ID:', hasFolderId);
  
  return (hasJsonCredentials || hasFileCredentials) && hasFolderId;
}

export default { configureGDrive, uploadToGoogleDrive, deleteFromGoogleDrive, isGDriveConfigured };
