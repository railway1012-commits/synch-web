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
- MongoDB with Mongoose
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
├── backend/
│   ├── server.js           # Main server file
│   ├── config.js           # Configuration
│   ├── routes/
│   │   ├── auth.js         # Authentication routes
│   │   ├── chat.js         # Chat routes
│   │   ├── message.js      # Message routes
│   │   └── user.js         # User routes
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── chatController.js
│   │   ├── messageController.js
│   │   └── userController.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Message.js
│   │   └── Chat.js
│   ├── sockets/
│   │   └── socketHandler.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── upload.js
│   └── uploads/
│       ├── images/
│       └── audio/
├── frontend/
│   ├── index.html          # Landing page
│   ├── login.html          # Login page
│   ├── signup.html         # Signup page
│   ├── chat.html           # Main chat interface
│   ├── settings.html       # Settings page
│   ├── css/
│   │   ├── main.css        # Global styles
│   │   ├── auth.css        # Authentication pages
│   │   ├── chat.css        # Chat interface
│   │   └── settings.css    # Settings page
│   ├── js/
│   │   ├── auth.js         # Authentication utilities
│   │   ├── ui.js           # UI utilities
│   │   ├── socket.js       # Socket.io client
│   │   ├── chat.js         # Chat functionality
│   │   └── settings.js     # Settings functionality
│   └── assets/
│       ├── icons/
│       ├── images/
│       └── audio/
├── package.json
└── README.md
```

## Installation

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or Atlas)

### Steps

1. **Clone and navigate to the project:**
   ```bash
   cd synch
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment (optional):**
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/synch
   JWT_SECRET=your-secure-secret-key
   ```

4. **Start MongoDB:**
   Make sure MongoDB is running on your system.

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

### Client → Server
- `message:send` - Send new message
- `message:edit` - Edit message
- `message:delete` - Delete message
- `message:reaction` - Add reaction
- `message:read` - Mark as read
- `typing:start` - Start typing indicator
- `typing:stop` - Stop typing indicator
- `chat:join` - Join chat room
- `chat:leave` - Leave chat room

### Server → Client
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
