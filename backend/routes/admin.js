const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { adminAuth } = require('../middleware/auth');

// All routes require adminAuth (noreply.synch@gmail.com)
router.use(adminAuth);

// 1. Dashboard Stats & Users List
router.get('/stats', adminController.getStats);
router.get('/users', adminController.getUsers);

// 2. User Detail & CRUD
router.get('/users/:userId', adminController.getUserDetails);
router.put('/users/:userId', adminController.updateUser);
router.post('/users/:userId/disconnect-google', adminController.disconnectGoogle);
router.post('/users/:userId/reset-password', adminController.resetPassword);
router.delete('/users/:userId', adminController.deleteUser);

// 3. User Sessions
router.get('/users/:userId/sessions', adminController.getUserSessions);
router.delete('/users/:userId/sessions/:sessionId', adminController.revokeUserSession);
router.delete('/users/:userId/sessions', adminController.revokeAllUserSessions);

// 4. Friends & Friend Requests
router.post('/users/:userId/friends', adminController.addFriend);
router.delete('/users/:userId/friends/:friendUserId', adminController.removeFriend);
router.post('/requests/:requestId/action', adminController.manageFriendRequest);

// 5. Chat Spy & Message Sending
router.get('/chats/:chatId/messages', adminController.getChatMessages);
router.post('/chats/:chatId/messages', adminController.sendUserMessage);
router.delete('/messages/:messageId', adminController.deleteMessage);

// 6. Ban / Unban System & Broadcast
router.post('/users/:userId/ban', adminController.banUser);
router.post('/users/:userId/unban', adminController.unbanUser);
router.post('/broadcast', adminController.broadcastAnnouncement);

// 7. Moderation: Shadowban, Freeze, Badge, Role, Notes, Avatar Reset
router.post('/users/:userId/shadowban', adminController.shadowbanUser);
router.post('/users/:userId/freeze', adminController.freezeUser);
router.post('/users/:userId/badge', adminController.setUserBadge);
router.patch('/users/:userId/badge', adminController.setUserBadge);
router.post('/users/:userId/role', adminController.setUserRole);
router.patch('/users/:userId/role', adminController.setUserRole);
router.post('/users/:userId/notes', adminController.setUserNotes);
router.post('/users/:userId/reset-avatar', adminController.resetUserAvatar);


// 8. System Health, Diagnostics & Maintenance Mode
router.get('/health', adminController.getHealth);
router.post('/maintenance', adminController.setMaintenanceMode);

// 9. IP Blacklist
router.get('/ip-blacklist', adminController.getIpBlacklist);
router.post('/ip-blacklist', adminController.addIpBlacklist);
router.delete('/ip-blacklist/:id', adminController.removeIpBlacklist);

// 10. Word Blacklist & Auto-Moderation
router.get('/word-blacklist', adminController.getWordBlacklist);
router.post('/word-blacklist', adminController.addWordBlacklist);
router.delete('/word-blacklist/:id', adminController.removeWordBlacklist);

// 11. Media Gallery & Storage
router.get('/media', adminController.getMediaFiles);
router.delete('/media/:filename', adminController.deleteMediaFile);

// 12. Feature Flags
router.get('/feature-flags', adminController.getFeatureFlags);
router.post('/feature-flags', adminController.updateFeatureFlag);

// 13. Interactive SQL Studio
router.post('/sql-console', adminController.executeSQL);

// 14. Audit Trail & Chat Export
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/chats/:chatId/export', adminController.exportChat);

// 15. Alt Accounts & Poison Ban
router.get('/users/:userId/alts', adminController.getUserAltAccounts);
router.post('/users/:userId/poison-ban', adminController.poisonBanUser);

// 16. Warnings System
router.get('/users/:userId/warnings', adminController.getUserWarnings);
router.post('/users/:userId/warnings', adminController.issueWarning);
router.delete('/warnings/:warningId', adminController.deleteWarning);

// 17. Reports Safety Queue
router.get('/reports', adminController.getReports);
router.post('/reports/:reportId/resolve', adminController.resolveReport);
router.post('/reports/:reportId/dismiss', adminController.dismissReport);

// 18. Bulk Message Purge
router.post('/users/:userId/messages/bulk-purge', adminController.bulkPurgeMessages);

// 19. Live System Diagnostics & DevOps
router.get('/system/diagnostics', adminController.getSystemDiagnostics);
router.post('/system/vacuum', adminController.runDatabaseVacuum);
router.post('/system/cleanup-orphaned-media', adminController.cleanupOrphanedMedia);

// 20. Custom Badges
router.get('/badges', adminController.getCustomBadges);
router.post('/badges', adminController.createCustomBadge);
router.delete('/badges/:badgeId', adminController.deleteCustomBadge);

// 21. Discord / Slack Webhooks
router.get('/webhooks', adminController.getWebhooks);
router.post('/webhooks', adminController.createWebhook);
router.delete('/webhooks/:webhookId', adminController.deleteWebhook);
// 22. Ban Appeals Queue
router.get('/appeals', adminController.getBanAppeals);
router.post('/appeals/:appealId/approve', adminController.approveBanAppeal);
router.post('/appeals/:appealId/reject', adminController.rejectBanAppeal);

module.exports = router;

