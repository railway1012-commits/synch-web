const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');

// Generous limit for read-only checks, stricter for actual credential attempts.
const checkLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please slow down.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please try again in a few minutes.' } });
const emailSendLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 3, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many email requests. Please wait 15 minutes before requesting another code.' } });

// Public
router.get('/config', authController.getPublicConfig);
router.post('/check-identifier', checkLimiter, authController.checkIdentifier);
router.post('/signup', authLimiter, authController.signup);
router.post('/signup/send-code', emailSendLimiter, authController.sendSignupCode);
router.post('/signup/verify', authLimiter, authController.verifySignupCode);
router.post('/signup/complete', authLimiter, authController.completeSignup);
router.post('/resend-code', emailSendLimiter, authController.resendCode);
router.post('/login', authLimiter, authController.login);
router.post('/login/verify-2fa', authLimiter, authController.verifyLogin2FA);
router.post('/google', authLimiter, authController.googleAuth);
router.post('/forgot-password', emailSendLimiter, authController.forgotPassword);
router.post('/verify-reset-code', authLimiter, authController.verifyResetCode);
router.post('/reset-password', authLimiter, authController.resetPassword);

// 2FA Endpoints (Public & Authenticated)
router.post('/2fa/send-device-prompt', checkLimiter, authController.sendDevicePrompt);
router.get('/2fa/check-device-prompt/:challengeId', checkLimiter, authController.checkDevicePrompt);
router.post('/2fa/send-email-code', emailSendLimiter, authController.send2FAEmailCode);
router.post('/2fa/verify-password', auth, authController.verifyPasswordFor2FA);
router.post('/2fa/respond-device-prompt', auth, authController.respondDevicePrompt);
router.get('/2fa/pending-prompts', auth, authController.getPendingDevicePrompts);

// Authenticated
router.post('/logout', auth, authController.logout);
router.put('/2fa', auth, authController.toggle2FA);
router.get('/me', auth, authController.getMe);
router.put('/password', auth, authController.changePassword);
router.put('/username', auth, authController.changeUsername);
router.post('/complete-profile', auth, authController.completeProfile);
router.post('/set-password', auth, authController.setPassword);
router.post('/link-google', auth, authController.linkGoogle);
router.post('/unlink-google', auth, authController.unlinkGoogle);
router.delete('/account', auth, authController.deleteAccount);
router.get('/sessions', auth, authController.getSessions);
router.delete('/sessions/:sessionId', auth, authController.revokeSession);

module.exports = router;
