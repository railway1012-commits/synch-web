const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const userController = require('../controllers/userController');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(auth);



router.post('/', upload.single('media'), messageController.sendMessage);
router.post('/report', userController.submitReport);
router.post('/:messageId/report', userController.submitReport);
router.put('/:messageId', messageController.editMessage);
router.delete('/:messageId', messageController.deleteMessage);
router.post('/:messageId/reaction', messageController.addReaction);
router.post('/:messageId/pin', messageController.pinMessage);
router.post('/read', messageController.markAsRead);

module.exports = router;

