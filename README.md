# SYNCH - Real-time Messaging Application

A production-ready, full-stack real-time messaging application with modern UI and comprehensive features.

## Features

### Authentication
- User signup and login with JWT authentication
- Secure password hashing with bcrypt
- Session management with multiple device support
- Account deletion with password confirmation

### Real-time Messaging
- Instant message delivery with Socket.io
- Text messages with emoji support
- Image sharing with preview
- Voice message recording and playback
- Message replies
- Message editing and deletion
- Message reactions (emoji)
- Typing indicators
- Online/offline status
- Read receipts

### User Interface
- Modern, responsive design (mobile, tablet, desktop)
- Dark/light theme toggle
- Customizable accent colors
- Adjustable font sizes
- Multiple chat bubble styles
- Glassmorphism effects
- Smooth animations
- Context menus for message actions

### Settings
- **Account**: Change username, password, manage sessions
- **Appearance**: Theme, accent color, font size, bubble style
- **Privacy**: Online status, read receipts, last seen, block users
- **Notifications**: Sound toggle, desktop notifications, volume control
- **Chat**: Enter to send, auto-download media, message preview
- **Advanced**: Export data, clear chats, logout

## Tech Stack

### Backend
- Node.js
- Express.js
- Socket.io
- PostgreSQL (pg driver)
- JWT for authentication
- bcryptjs for password hashing
- Multer for file uploads

### Frontend
- HTML5
- CSS3 (Custom properties, Flexbox, Grid)
- Vanilla JavaScript
- Socket.io client

## Project Structure

```
synch/
â”œâ”€â”€ backend/
â”‚   â”œâ”€â”€ server.js           # Main server file
â”‚   â”œâ”€â”€ config.js           # Configuration
â”‚   â”œâ”€â”€ routes/
â”‚   â”‚   â”œâ”€â”€ auth.js         # Authentication routes
â”‚   â”‚   â”œâ”€â”€ chat.js         # Chat routes
â”‚   â”‚   â”œâ”€â”€ message.js      # Message routes
â”‚   â”‚   â””â”€â”€ user.js         # User routes
â”‚   â”œâ”€â”€ controllers/
â”‚   â”‚   â”œâ”€â”€ authController.js
â”‚   â”‚   â”œâ”€â”€ chatController.js
â”‚   â”‚   â”œâ”€â”€ messageController.js
â”‚   â”‚   â””â”€â”€ userController.js
â”‚   â”œâ”€â”€ models/
â”‚   â”‚   â”œâ”€â”€ User.js
â”‚   â”‚   â”œâ”€â”€ Message.js
â”‚   â”‚   â””â”€â”€ Chat.js
â”‚   â”œâ”€â”€ sockets/
â”‚   â”‚   â””â”€â”€ socketHandler.js
â”‚   â”œâ”€â”€ middleware/
â”‚   â”‚   â”œâ”€â”€ auth.js
â”‚   â”‚   â””â”€â”€ upload.js
â”‚   â””â”€â”€ uploads/
â”‚       â”œâ”€â”€ images/
â”‚       â””â”€â”€ audio/
â”œâ”€â”€ frontend/
â”‚   â”œâ”€â”€ index.html          # Landing page
â”‚   â”œâ”€â”€ auth.html           # Authentication pages (login/signup)
â”‚   â”œâ”€â”€ chat.html           # Main chat & embedded settings interface
â”‚   â”œâ”€â”€ css/
â”‚   â”‚   â”œâ”€â”€ main.css        # Global styles
â”‚   â”‚   â”œâ”€â”€ auth.css        # Authentication pages
â”‚   â”‚   â”œâ”€â”€ chat.css        # Chat interface
â”‚   â”‚   â””â”€â”€ settings.css    # Settings panel styling
â”‚   â”œâ”€â”€ js/
â”‚   â”‚   â”œâ”€â”€ auth.js         # Authentication utilities
â”‚   â”‚   â”œâ”€â”€ ui.js           # UI utilities
â”‚   â”‚   â”œâ”€â”€ socket.js       # Socket.io client
â”‚   â”‚   â””â”€â”€ chat.js         # Chat & settings functionality
â”‚   â””â”€â”€ assets/
â”‚       â”œâ”€â”€ icons/
â”‚       â”œâ”€â”€ images/
â”‚       â””â”€â”€ audio/
â”œâ”€â”€ package.json
â””â”€â”€ README.md
```

## Installation

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (local or Railway)

### Steps

1. **Clone and navigate to the project:**
   ```bash
   cd synch
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   Copy `.env.example` to `.env` and fill it in (JWT_SECRET is required):
   ```env
   PORT=3000
   DATABASE_URL=postgres://postgres:password@localhost:5432/synch_web
   JWT_SECRET=your-long-random-secret
   ```

4. **Start PostgreSQL:**
   Make sure PostgreSQL is running and reachable via `DATABASE_URL`. Tables are created automatically on startup.

5. **Start the server:**
   ```bash
   npm start
   ```

   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

6. **Access the application:**
   Open your browser and navigate to `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/password` - Change password
- `PUT /api/auth/username` - Change username
- `DELETE /api/auth/account` - Delete account
- `GET /api/auth/sessions` - Get active sessions
- `DELETE /api/auth/sessions/:id` - Revoke session

### Chats
- `GET /api/chats` - Get all chats
- `POST /api/chats` - Create new chat
- `GET /api/chats/:id` - Get specific chat
- `DELETE /api/chats/:id` - Delete chat
- `GET /api/chats/:id/messages` - Get chat messages
- `GET /api/chats/:id/search` - Search messages
- `DELETE /api/chats/:id/clear` - Clear chat history
- `GET /api/chats/:id/export` - Export chat

### Messages
- `POST /api/messages` - Send message (with file upload)
- `PUT /api/messages/:id` - Edit message
- `DELETE /api/messages/:id` - Delete message
- `POST /api/messages/:id/reaction` - Add/remove reaction
- `POST /api/messages/:id/pin` - Pin/unpin message
- `POST /api/messages/read` - Mark messages as read

### Users
- `GET /api/users` - Search users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/settings` - Update settings
- `PUT /api/users/avatar` - Update avatar
- `POST /api/users/:id/block` - Block user
- `DELETE /api/users/:id/block` - Unblock user
- `GET /api/users/blocked` - Get blocked users

## Socket Events

### Client â†’ Server
- `message:send` - Send new message
- `message:edit` - Edit message
- `message:delete` - Delete message
- `message:reaction` - Add reaction
- `message:read` - Mark as read
- `typing:start` - Start typing indicator
- `typing:stop` - Stop typing indicator
- `chat:join` - Join chat room
- `chat:leave` - Leave chat room

### Server â†’ Client
- `message:new` - New message received
- `message:edited` - Message edited
- `message:deleted` - Message deleted
- `message:reacted` - Reaction added/removed
- `message:read` - Messages marked as read
- `message:notification` - Message notification
- `typing:start` - User started typing
- `typing:stop` - User stopped typing
- `user:status` - User status changed

## License

MIT License
