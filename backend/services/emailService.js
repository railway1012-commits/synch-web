const nodemailer = require('nodemailer');
const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');

let transporter = null;
let resendKey = process.env.RESEND_API_KEY || (process.env.EMAIL_PASS && process.env.EMAIL_PASS.startsWith('re_') ? process.env.EMAIL_PASS : null);

function initEmailService(config) {
  if (config?.password?.startsWith('re_') || process.env.RESEND_API_KEY) {
    resendKey = config?.password?.startsWith('re_') ? config.password : process.env.RESEND_API_KEY;
    console.log('Email service initialized with Resend API');
    return;
  }

  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT) || 587;
  const secure = process.env.EMAIL_SECURE === 'true' || port === 465;

  transporter = nodemailer.createTransport({
    host: host,
    port: port,
    secure: secure,
    auth: {
      user: config.email,
      pass: config.password
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  // Verify connection
  transporter.verify((error, success) => {
    if (error) {
      console.error('Email transporter error:', error.message);
    } else {
      console.log(`Email server (${host}) is ready to send messages`);
    }
  });
}

async function sendViaResend(to, subject, html) {
  const sender = process.env.EMAIL_FROM || 'SYNCH <noreply@synchapp.dev>';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Synch/1.0'
      },
      body: JSON.stringify({
        from: sender,
        to: Array.isArray(to) ? to : [to],
        subject: subject,
        html: html
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Resend API error:', data);
      return false;
    }
    console.log(`Email sent via Resend to ${to} (ID: ${data.id})`);
    return true;
  } catch (err) {
    console.error('Failed to send via Resend:', err);
    return false;
  }
}

async function sendVerificationEmail(to, code) {
  const sender = process.env.EMAIL_FROM || `SYNCH <${process.env.EMAIL_USER || 'noreply@synchapp.dev'}>`;
  const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #0f0f0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; text-align: center; border: 1px solid #2a2a4a;">
            <h1 style="color: #0084FF; font-size: 32px; font-weight: 700; letter-spacing: 4px; margin: 0 0 10px 0;">SYNCH</h1>
            <p style="color: #888; font-size: 14px; margin: 0 0 30px 0;">Secure Messaging Platform</p>

            <div style="background: #0f0f1a; border-radius: 12px; padding: 30px; margin-bottom: 30px;">
              <p style="color: #ffffff; font-size: 16px; margin: 0 0 20px 0;">Your verification code is:</p>
              <div style="background: linear-gradient(135deg, #0084FF 0%, #0066cc 100%); border-radius: 8px; padding: 20px; display: inline-block;">
                <span style="color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: 8px;">${code}</span>
              </div>
              <p style="color: #888; font-size: 13px; margin: 20px 0 0 0;">This code expires in 10 minutes</p>
            </div>

            <p style="color: #666; font-size: 13px; margin: 0;">
              If you didn't request this code, you can safely ignore this email.
            </p>
          </div>

          <p style="color: #444; font-size: 12px; text-align: center; margin-top: 20px;">
            &copy; 2024 SYNCH. All rights reserved.
          </p>
        </div>
      </body>
      </html>
    `;

  if (resendKey) {
    return await sendViaResend(to, 'SYNCH - Verify Your Email', html);
  }

  if (!transporter) {
    console.error('Email service not configured');
    return false;
  }

  const mailOptions = {
    from: sender,
    to: to,
    subject: 'SYNCH - Verify Your Email',
    html: html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to ${to}`);
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
}

async function sendPasswordResetEmail(to, code) {
  const sender = process.env.EMAIL_FROM || `SYNCH <${process.env.EMAIL_USER || 'noreply@synchapp.dev'}>`;
  const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #0f0f0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; text-align: center; border: 1px solid #2a2a4a;">
            <h1 style="color: #0084FF; font-size: 32px; font-weight: 700; letter-spacing: 4px; margin: 0 0 10px 0;">SYNCH</h1>
            <p style="color: #888; font-size: 14px; margin: 0 0 30px 0;">Password Reset Request</p>

            <div style="background: #0f0f1a; border-radius: 12px; padding: 30px; margin-bottom: 30px;">
              <p style="color: #ffffff; font-size: 16px; margin: 0 0 20px 0;">Your password reset code is:</p>
              <div style="background: linear-gradient(135deg, #0084FF 0%, #0066cc 100%); border-radius: 8px; padding: 20px; display: inline-block;">
                <span style="color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: 8px;">${code}</span>
              </div>
              <p style="color: #888; font-size: 13px; margin: 20px 0 0 0;">This code expires in 10 minutes</p>
            </div>

            <p style="color: #666; font-size: 13px; margin: 0;">
              If you didn't request a password reset, please secure your account.
            </p>
          </div>

          <p style="color: #444; font-size: 12px; text-align: center; margin-top: 20px;">
            &copy; 2024 SYNCH. All rights reserved.
          </p>
        </div>
      </body>
      </html>
    `;

  if (resendKey) {
    return await sendViaResend(to, 'SYNCH - Reset Your Password', html);
  }

  if (!transporter) {
    console.error('Email service not configured');
    return false;
  }
  const mailOptions = {
    from: sender,
    to: to,
    subject: 'SYNCH - Reset Your Password',
    html: html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent to ${to}`);
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
}

module.exports = {
  initEmailService,
  sendVerificationEmail,
  sendPasswordResetEmail
};
