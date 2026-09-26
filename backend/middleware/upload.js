const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// Safe extension derived from the DECLARED mime type (never from the client filename).
// This prevents .html/.svg/.php name tricks from being served back.
const SAFE_EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'audio/webm': '.webm',
  'audio/mp3': '.mp3',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/m4a': '.m4a',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  'video/ogg': '.ogv',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'application/json': '.json'
};

// Magic-byte validators per declared mime type. Runs AFTER the file is written.
// Returns true when the type has no reliable signature (whitelist-only gate).
const MAGIC_VALIDATORS = {
  'image/jpeg': (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47,
  'image/gif': (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  'image/webp': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  'application/pdf': (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  'application/zip': (b) => b[0] === 0x50 && b[1] === 0x4B,
  'application/x-zip-compressed': (b) => b[0] === 0x50 && b[1] === 0x4B,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) => b[0] === 0x50 && b[1] === 0x4B,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (b) => b[0] === 0x50 && b[1] === 0x4B,
  'application/msword': (b) => b[0] === 0xD0 && b[1] === 0xCF,
  'application/vnd.ms-excel': (b) => b[0] === 0xD0 && b[1] === 0xCF,
  'application/json': (b) => b[0] === 0x7B || b[0] === 0x5B,
  'audio/webm': (b) => b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3,
  'audio/mp3': (b) => (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) || (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33),
  'audio/mpeg': (b) => (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) || (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33),
  'audio/wav': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46,
  'audio/ogg': (b) => b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53,
  'video/webm': (b) => b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3,
  'video/x-matroska': (b) => b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3,
  'video/ogg': (b) => b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53
};

/**
 * Verify the saved file's leading bytes against the declared mime type.
 * Call AFTER multer writes the file; delete the file and reject if it fails.
 */
function validateUploadedFile(filePath, mimetype) {
  const validator = MAGIC_VALIDATORS[mimetype];
  if (!validator) return true; // no reliable signature — whitelist-only gate
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    const n = fs.readSync(fd, buf, 0, 12, 0);
    return validator(buf.slice(0, Math.max(0, n)));
  } catch (e) {
    return false;
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (e) {}
    }
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = path.join(__dirname, '..', '..', 'uploads');

    if (config.ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      uploadPath = path.join(uploadPath, 'images');
    } else if (config.ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
      uploadPath = path.join(uploadPath, 'audio');
    } else if (config.ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
      uploadPath = path.join(uploadPath, 'videos');
    } else {
      uploadPath = path.join(uploadPath, 'docs');
    }

    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Extension comes from the SAFE map only — client-supplied names are discarded
    const ext = SAFE_EXT_BY_MIME[file.mimetype] || '';
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    ...config.ALLOWED_IMAGE_TYPES,
    ...config.ALLOWED_AUDIO_TYPES,
    ...config.ALLOWED_VIDEO_TYPES,
    ...config.ALLOWED_DOC_TYPES
  ];

  // Exact whitelist match only (no wildcard startsWith bypass)
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.MAX_FILE_SIZE
  }
});

module.exports = upload;
module.exports.validateUploadedFile = validateUploadedFile;
