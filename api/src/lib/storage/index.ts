import { env } from '../../config/env';
import { createCloudinaryStorage } from './cloudinaryStorage';
import { createDiskStorage } from './diskStorage';
import type { FileStorage } from './fileStorage';

export type { FileStorage } from './fileStorage';

// One storage for the whole app, chosen once at startup from STORAGE_DRIVER
export const storage: FileStorage =
  env.STORAGE_DRIVER === 'cloudinary' ? createCloudinaryStorage(env.CLOUDINARY_FOLDER) : createDiskStorage(env.UPLOAD_DIR);
