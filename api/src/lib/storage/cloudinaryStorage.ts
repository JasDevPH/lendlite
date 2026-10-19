import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { v2 as cloudinary } from 'cloudinary';
import { AppError } from '../../utils/AppError';
import type { FileStorage } from './fileStorage';

// Payslips and IDs are private: upload as "authenticated" so Cloudinary refuses
// any unsigned URL. "raw" = store the bytes as-is (no image processing), the
// same for PDFs and images.
const DELIVERY = { resource_type: 'raw', type: 'authenticated' } as const;

// Signed download links only need to live long enough for our server to fetch them
const LINK_TTL_SECONDS = 60;

// Production storage (Railway's disk is wiped on every deploy).
// cloudinaryUrl = cloudinary://<api_key>:<api_secret>@<cloud_name>
export function createCloudinaryStorage(cloudinaryUrl: string, folder: string): FileStorage {
  // Configure explicitly from our validated env, rather than relying on the SDK
  // auto-reading process.env at import time (which can run before dotenv loads)
  const { hostname, username, password } = new URL(cloudinaryUrl);
  cloudinary.config({
    cloud_name: hostname,
    api_key: decodeURIComponent(username),
    api_secret: decodeURIComponent(password),
    secure: true,
  });
  const publicId = (key: string) => `${folder}/${key}`;

  return {
    save(key, data) {
      return new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ ...DELIVERY, public_id: publicId(key), overwrite: false }, (err) =>
            err ? reject(new Error(`Cloudinary upload failed: ${err.message}`)) : resolve(),
          )
          .end(data);
      });
    },

    // The browser never sees a Cloudinary URL: our API checks ownership, then
    // fetches with a short-lived signed link and streams the bytes through
    async read(key) {
      const url = cloudinary.utils.private_download_url(publicId(key), '', {
        ...DELIVERY,
        expires_at: Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS,
      });
      const res = await fetch(url);
      if (res.status === 404) throw new AppError(404, 'NOT_FOUND', 'Document file is missing');
      if (!res.ok || !res.body) throw new Error(`Cloudinary download failed with status ${res.status}`);
      return Readable.fromWeb(res.body as ReadableStream);
    },

    async remove(key) {
      // invalidate: also purge any CDN-cached copy
      await cloudinary.uploader.destroy(publicId(key), { ...DELIVERY, invalidate: true });
    },
  };
}
