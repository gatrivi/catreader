/**
 * Utility for handling image operations on the client-side.
 */

/**
 * Resizes an input image (File or base64 data URL) to fit within the specified bounds,
 * returning a lightweight compressed JPEG thumbnail and a unique content hash.
 */
export function createThumbnail(
  source: string | File,
  maxWidth = 300,
  maxHeight = 400
): Promise<{ thumbnail: string; thumbHash: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Keep aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.85);

      // Simple hash generation for unique naming/sync hashes
      let hash = 0;
      for (let i = 0; i < Math.min(thumbnail.length, 1000); i++) {
        hash = (hash << 5) - hash + thumbnail.charCodeAt(i);
        hash |= 0;
      }
      const thumbHash = `thumb_${Math.abs(hash)}_${thumbnail.length}`;
      resolve({ thumbnail, thumbHash });
    };
    img.onerror = () => reject(new Error('Failed to load image for resizing'));

    if (typeof source === 'string') {
      img.src = source;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(source);
    }
  });
}
