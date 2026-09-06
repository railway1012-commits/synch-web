const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

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
    const ext = path.extname(file.originalname);
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

  if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
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

