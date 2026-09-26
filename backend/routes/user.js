const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const userController = require('../controllers/userController');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(auth);

// Broad API limiter so user endpoints can't be spammed
const userLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please slow down.' } });
router.use(userLimiter);

router.get('/', userController.getUsers);
router.put('/profile', userController.updateProfile);
router.get('/friends', userController.getFriends);
router.delete('/friends/:friendId', userController.removeFriend);
router.get('/friend-requests/incoming', userController.getIncomingRequests);
router.get('/friend-requests/outgoing', userController.getOutgoingRequests);
router.post('/friend-requests', userController.sendFriendRequest);
router.post('/friend-requests/:id/accept', userController.acceptFriendRequest);
router.post('/friend-requests/:id/decline', userController.declineFriendRequest);
router.delete('/friend-requests/:id/cancel', userController.cancelFriendRequest);
router.get('/blocked', userController.getBlockedUsers);
router.get('/username/:username', userController.findByUsername);
router.post('/report', userController.submitReport);
router.put('/settings', userController.updateSettings);
router.put('/avatar', upload.single('avatar'), userController.updateAvatar);
router.get('/:userId', userController.getUser);
router.post('/:userId/report', userController.submitReport);
router.post('/:userId/block', userController.blockUser);
router.delete('/:userId/block', userController.unblockUser);

module.exports = router;



