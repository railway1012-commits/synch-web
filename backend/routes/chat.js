const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const chatController = require('../controllers/chatController');
const { auth } = require('../middleware/auth');

router.use(auth);

// Broad API limiter so chat endpoints can't be spammed
const chatLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1200, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please slow down.' } });
router.use(chatLimiter);

router.get('/ice-servers', chatController.getIceServers);
router.get('/', chatController.getChats);
router.post('/', chatController.createChat);
router.get('/:chatId', chatController.getChat);
router.put('/:chatId', chatController.updateGroup);
router.delete('/:chatId', chatController.deleteChat);
router.post('/:chatId/participants', chatController.addParticipants);
router.delete('/:chatId/participants/:userId', chatController.removeParticipant);
router.get('/:chatId/messages', chatController.getMessages);
router.get('/:chatId/search', chatController.searchMessages);
router.delete('/:chatId/clear', chatController.clearChat);
router.get('/:chatId/export', chatController.exportChat);
router.post('/:chatId/accept-request', chatController.acceptChatRequest);
router.post('/:chatId/read', chatController.markChatAsRead);

module.exports = router;

