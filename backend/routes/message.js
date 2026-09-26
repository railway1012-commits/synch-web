const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const messageController = require('../controllers/messageController');
const userController = require('../controllers/userController');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(auth);

// Broad API limiter so message endpoints can't be spammed
const messageLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please slow down.' } });
router.use(messageLimiter);

router.post('/', upload.single('media'), messageController.sendMessage);
router.post('/report', userController.submitReport);
router.post('/:messageId/report', userController.submitReport);
router.put('/:messageId', messageController.editMessage);
router.delete('/:messageId', messageController.deleteMessage);
router.post('/:messageId/delete-for-me', messageController.deleteForMe);
router.post('/delete-for-me-bulk', messageController.deleteForMeBulk);
router.post('/:messageId/reaction', messageController.addReaction);
router.post('/:messageId/pin', messageController.pinMessage);
router.post('/read', messageController.markAsRead);

module.exports = router;

