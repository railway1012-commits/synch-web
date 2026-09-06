const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(auth);

router.get('/', userController.getUsers);
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



