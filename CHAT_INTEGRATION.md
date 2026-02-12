# Chat Feature Integration Guide

This document provides integration instructions for the chat feature in both the **Customer App** and **Rider App**. The chat enables real-time communication between customers and riders for active orders.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [REST API Endpoints](#rest-api-endpoints)
4. [WebSocket Integration](#websocket-integration)
5. [Implementation Guide](#implementation-guide)
6. [Error Handling](#error-handling)
7. [UI/UX Recommendations](#uiux-recommendations)

---

## Overview

### Features

- **Real-time messaging** between customer and rider
- **File attachments** (images, PDFs) via Cloudinary
- **Read receipts** and unread message indicators
- **Typing indicators**
- **Cursor-based pagination** for message history
- **Automatic read-only mode** after order delivery

### When Chat is Available

- **Conversation creation**: Available once a rider is assigned to an order (`assignedRiderId` is set)
- **Sending messages**: Only allowed when order status is `OUT_FOR_DELIVERY`
- **Viewing messages**: Available once conversation exists (even before `OUT_FOR_DELIVERY`)
- **Read-only mode**: Chat becomes read-only after order status changes to `DELIVERED`
- Conversation is automatically created when you call `GET /chat/conversations/order/:orderId` (if rider is assigned)

### Prerequisites

- User must be authenticated (JWT token required)
- Order must have an assigned rider (`assignedRiderId` must be set)
- Order status must be `OUT_FOR_DELIVERY` to send messages

---

## Authentication

All API requests require JWT authentication. Include the token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

For WebSocket connections, pass the token in the handshake:

```javascript
socket.auth = { token: '<your_jwt_token>' };
```

---

## REST API Endpoints

Base URL: `https://api.surespot.app/v1/chat` (or your API base URL)

### 1. Get User Conversations

**Endpoint:** `GET /chat/conversations`

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 20) - Items per page
- `type` (optional) - Filter by type: `'order'` or `'support'`

**Response:**
```json
{
  "success": true,
  "message": "Conversations retrieved successfully",
  "data": {
    "conversations": [
      {
        "id": "507f1f77bcf86cd799439011",
        "type": "order",
        "orderId": "507f1f77bcf86cd799439012",
        "participants": [
          {
            "userId": "507f1f77bcf86cd799439013",
            "role": "user",
            "user": {
              "_id": "507f1f77bcf86cd799439013",
              "firstName": "John",
              "lastName": "Doe",
              "avatar": "https://..."
            }
          },
          {
            "userId": "507f1f77bcf86cd799439014",
            "role": "rider",
            "user": {
              "_id": "507f1f77bcf86cd799439014",
              "firstName": "Jane",
              "lastName": "Smith",
              "avatar": "https://..."
            }
          }
        ],
        "lastMessage": {
          "id": "507f1f77bcf86cd799439015",
          "content": "I'm on my way!",
          "senderId": "507f1f77bcf86cd799439014",
          "createdAt": "2024-01-15T12:30:00.000Z"
        },
        "lastMessageAt": "2024-01-15T12:30:00.000Z",
        "isActive": true,
        "createdAt": "2024-01-15T12:00:00.000Z",
        "updatedAt": "2024-01-15T12:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

**Example Request (React Native / JavaScript):**
```javascript
const getConversations = async (page = 1, limit = 20) => {
  const response = await fetch(
    `${API_BASE_URL}/chat/conversations?page=${page}&limit=${limit}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.json();
};
```

---

### 2. Get Conversation for an Order

**Endpoint:** `GET /chat/conversations/order/:orderId`

**Path Parameters:**
- `orderId` (required) - Order ID

**Response:**
```json
{
  "success": true,
  "message": "Conversation retrieved successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "type": "order",
    "orderId": "507f1f77bcf86cd799439012",
    "participants": [
      {
        "userId": "507f1f77bcf86cd799439013",
        "role": "user",
        "user": {
          "_id": "507f1f77bcf86cd799439013",
          "firstName": "John",
          "lastName": "Doe",
          "avatar": "https://..."
        }
      },
      {
        "userId": "507f1f77bcf86cd799439014",
        "role": "rider",
        "user": {
          "_id": "507f1f77bcf86cd799439014",
          "firstName": "Jane",
          "lastName": "Smith",
          "avatar": "https://..."
        }
      }
    ],
    "lastMessageAt": "2024-01-15T12:30:00.000Z",
    "isActive": true,
    "createdAt": "2024-01-15T12:00:00.000Z",
    "updatedAt": "2024-01-15T12:30:00.000Z"
  }
}
```

**Example Request:**
```javascript
const getConversationByOrder = async (orderId) => {
  const response = await fetch(
    `${API_BASE_URL}/chat/conversations/order/${orderId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.json();
};
```

**Notes:**
- This endpoint will **create a conversation** if it doesn't exist (when rider is assigned)
- You can call this endpoint even before order status is `OUT_FOR_DELIVERY` to create/view the conversation
- Returns 400 with `NO_RIDER_ASSIGNED` if order has no assigned rider yet
- Returns 403 with `ACCESS_DENIED` if user is not the customer or assigned rider
- Returns 404 with `ORDER_NOT_FOUND` if order doesn't exist
- Returns 404 with `RIDER_USER_NOT_FOUND` if rider profile exists but user account is missing

---

### 3. Get Messages for a Conversation

**Endpoint:** `GET /chat/conversations/:id/messages`

**Query Parameters:**
- `cursor` (optional) - ISO date string for pagination (from previous response)
- `limit` (optional, default: 50, max: 100) - Number of messages to retrieve

**Response:**
```json
{
  "success": true,
  "message": "Messages retrieved successfully",
  "data": {
    "messages": [
      {
        "id": "507f1f77bcf86cd799439015",
        "conversationId": "507f1f77bcf86cd799439011",
        "senderId": "507f1f77bcf86cd799439014",
        "receiverId": "507f1f77bcf86cd799439013",
        "content": "I'm on my way!",
        "attachments": [],
        "isRead": true,
        "readAt": "2024-01-15T12:31:00.000Z",
        "createdAt": "2024-01-15T12:30:00.000Z",
        "updatedAt": "2024-01-15T12:30:00.000Z",
        "sender": {
          "_id": "507f1f77bcf86cd799439014",
          "firstName": "Jane",
          "lastName": "Smith",
          "avatar": "https://..."
        }
      }
    ],
    "cursor": "2024-01-15T12:30:00.000Z",
    "hasMore": true
  }
}
```

**Example Request:**
```javascript
const getMessages = async (conversationId, cursor = null, limit = 50) => {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (cursor) params.append('cursor', cursor);
  
  const response = await fetch(
    `${API_BASE_URL}/chat/conversations/${conversationId}/messages?${params}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.json();
};
```

**Cursor Pagination:**
- First request: Don't include `cursor` parameter
- Subsequent requests: Use `cursor` from previous response
- Messages are returned in reverse chronological order (newest first)
- Use `hasMore` to determine if more messages are available

---

### 4. Send a Message

**Endpoint:** `POST /chat/messages`

**Content-Type:** `multipart/form-data`

**Form Data:**
- `orderId` (required) - Order ID
- `content` (required, max 5000 chars) - Message text
- `attachments` (optional) - Array of files (images or PDFs, max 10 files)

**Response:**
```json
{
  "success": true,
  "message": "Message sent successfully",
  "data": {
    "id": "507f1f77bcf86cd799439016",
    "conversationId": "507f1f77bcf86cd799439011",
    "senderId": "507f1f77bcf86cd799439013",
    "receiverId": "507f1f77bcf86cd799439014",
    "content": "Thanks! See you soon.",
    "attachments": [],
    "isRead": false,
    "createdAt": "2024-01-15T12:35:00.000Z",
    "updatedAt": "2024-01-15T12:35:00.000Z",
    "sender": {
      "_id": "507f1f77bcf86cd799439013",
      "firstName": "John",
      "lastName": "Doe",
      "avatar": "https://..."
    }
  }
}
```

**Example Request (React Native with file upload):**
```javascript
import * as ImagePicker from 'expo-image-picker';

const sendMessage = async (orderId, content, attachments = []) => {
  const formData = new FormData();
  formData.append('orderId', orderId);
  formData.append('content', content);
  
  // Add attachments if any
  attachments.forEach((file, index) => {
    formData.append('attachments', {
      uri: file.uri,
      type: file.type || 'image/jpeg',
      name: file.name || `attachment_${index}.jpg`,
    });
  });
  
  const response = await fetch(`${API_BASE_URL}/chat/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'multipart/form-data',
    },
    body: formData,
  });
  
  return response.json();
};

// Example usage with image picker
const sendMessageWithImage = async (orderId, content) => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 0.8,
  });
  
  if (!result.canceled) {
    const attachments = result.assets.map(asset => ({
      uri: asset.uri,
      type: asset.mimeType || 'image/jpeg',
      name: asset.fileName || 'image.jpg',
    }));
    
    return sendMessage(orderId, content, attachments);
  }
};
```

**Supported File Types:**
- Images: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`
- Documents: `application/pdf`
- Maximum 10 attachments per message

---

### 5. Mark Conversation as Read

**Endpoint:** `POST /chat/conversations/:id/read`

**Response:**
```json
{
  "success": true,
  "message": "Conversation marked as read",
  "data": {
    "conversationId": "507f1f77bcf86cd799439011",
    "readBy": "507f1f77bcf86cd799439013",
    "readAt": "2024-01-15T12:40:00.000Z",
    "markedCount": 5
  }
}
```

**Example Request:**
```javascript
const markAsRead = async (conversationId) => {
  const response = await fetch(
    `${API_BASE_URL}/chat/conversations/${conversationId}/read`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.json();
};
```

---

## WebSocket Integration

### Connection Setup

**Namespace:** `/chat`

**Connection URL:** `wss://api.surespot.app/chat` (or your WebSocket URL)

**Authentication:**
```javascript
import { io } from 'socket.io-client';

const socket = io('wss://api.surespot.app/chat', {
  auth: {
    token: authToken, // JWT token
  },
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});
```

### Connection Events

#### Client → Server Events

**1. `join-conversation`**
Join a conversation room to receive real-time messages.

```javascript
socket.emit('join-conversation', {
  conversationId: '507f1f77bcf86cd799439011',
});
```

**2. `leave-conversation`**
Leave a conversation room.

```javascript
socket.emit('leave-conversation', {
  conversationId: '507f1f77bcf86cd799439011',
});
```

**3. `send-message`**
Send a message via WebSocket (alternative to REST API).

```javascript
socket.emit('send-message', {
  conversationId: '507f1f77bcf86cd799439011',
  orderId: '507f1f77bcf86cd799439012',
  content: 'Hello! I\'m on my way.',
  attachments: [], // Optional
});
```

**4. `typing`**
Indicate that user is typing.

```javascript
socket.emit('typing', {
  conversationId: '507f1f77bcf86cd799439011',
});
```

**5. `stop-typing`**
Indicate that user stopped typing.

```javascript
socket.emit('stop-typing', {
  conversationId: '507f1f77bcf86cd799439011',
});
```

**6. `read-conversation`**
Mark conversation as read via WebSocket.

```javascript
socket.emit('read-conversation', {
  conversationId: '507f1f77bcf86cd799439011',
});
```

#### Server → Client Events

**1. `connected`**
Emitted when connection is established.

```javascript
socket.on('connected', (data) => {
  console.log('Connected to chat:', data);
  // { success: true, message: 'Connected to chat', userId: '...' }
});
```

**2. `new-message`**
Emitted when a new message is received.

```javascript
socket.on('new-message', (message) => {
  console.log('New message:', message);
  // Update UI with new message
  // {
  //   id: '...',
  //   conversationId: '...',
  //   senderId: '...',
  //   content: '...',
  //   attachments: [],
  //   isRead: false,
  //   createdAt: '...',
  //   sender: { ... }
  // }
});
```

**3. `messages-read`**
Emitted when messages are marked as read.

```javascript
socket.on('messages-read', (data) => {
  console.log('Messages read:', data);
  // {
  //   conversationId: '...',
  //   readBy: '...',
  //   readAt: '...'
  // }
  // Update UI to show read status
});
```

**4. `user-typing`**
Emitted when other user is typing.

```javascript
socket.on('user-typing', (data) => {
  console.log('User typing:', data);
  // {
  //   conversationId: '...',
  //   userId: '...',
  //   isTyping: true/false
  // }
  // Show/hide typing indicator in UI
});
```

**5. `conversation-read-only`**
Emitted when conversation becomes read-only (after delivery).

```javascript
socket.on('conversation-read-only', (data) => {
  console.log('Conversation read-only:', data);
  // {
  //   conversationId: '...',
  //   message: 'This conversation is now read-only'
  // }
  // Disable message input in UI
});
```

### Complete WebSocket Example

```javascript
class ChatSocketManager {
  constructor(authToken) {
    this.socket = null;
    this.authToken = authToken;
    this.onMessageCallback = null;
    this.onTypingCallback = null;
  }
  
  connect() {
    this.socket = io('wss://api.surespot.app/chat', {
      auth: { token: this.authToken },
      transports: ['websocket'],
      reconnection: true,
    });
    
    this.socket.on('connected', (data) => {
      console.log('Chat connected:', data);
    });
    
    this.socket.on('new-message', (message) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(message);
      }
    });
    
    this.socket.on('user-typing', (data) => {
      if (this.onTypingCallback) {
        this.onTypingCallback(data);
      }
    });
    
    this.socket.on('messages-read', (data) => {
      // Handle read receipts
    });
    
    this.socket.on('conversation-read-only', (data) => {
      // Handle read-only state
    });
    
    this.socket.on('disconnect', () => {
      console.log('Chat disconnected');
    });
  }
  
  joinConversation(conversationId) {
    if (this.socket) {
      this.socket.emit('join-conversation', { conversationId });
    }
  }
  
  leaveConversation(conversationId) {
    if (this.socket) {
      this.socket.emit('leave-conversation', { conversationId });
    }
  }
  
  sendMessage(conversationId, orderId, content) {
    if (this.socket) {
      this.socket.emit('send-message', {
        conversationId,
        orderId,
        content,
      });
    }
  }
  
  setTyping(conversationId, isTyping) {
    if (this.socket) {
      if (isTyping) {
        this.socket.emit('typing', { conversationId });
      } else {
        this.socket.emit('stop-typing', { conversationId });
      }
    }
  }
  
  markAsRead(conversationId) {
    if (this.socket) {
      this.socket.emit('read-conversation', { conversationId });
    }
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// Usage
const chatSocket = new ChatSocketManager(authToken);
chatSocket.connect();
chatSocket.onMessageCallback = (message) => {
  // Update UI with new message
};
chatSocket.joinConversation(conversationId);
```

---

## Implementation Guide

### Step 1: Check Chat Availability

Before showing chat UI, verify:
1. Order has `assignedRiderId`
2. User is either the customer or assigned rider

**Note:** You can show the chat UI once a rider is assigned, but sending messages is only allowed when order status is `OUT_FOR_DELIVERY`.

```javascript
// Check if chat UI can be shown (conversation can be created/viewed)
const canChat = (order) => {
  if (!order.assignedRiderId) return false;
  // Chat UI can be shown once rider is assigned
  return true;
};

// Check if user can send messages
const canSendMessages = (order) => {
  if (!order.assignedRiderId) return false;
  if (order.status === 'out-for-delivery') return true;
  return false; // Can't send messages in other statuses
};
```

### Step 2: Get or Create Conversation

When user opens chat for an order, use the dedicated endpoint:

```javascript
const openChat = async (orderId) => {
  try {
    // Get or create conversation for this order
    const { data } = await getConversationByOrder(orderId);
    return data;
  } catch (error) {
    if (error.response?.status === 404) {
      // Order not found or no rider assigned
      console.log('Chat not available for this order');
      return null;
    }
    if (error.response?.status === 403) {
      // User doesn't have access
      console.log('Access denied to this conversation');
      return null;
    }
    console.error('Error opening chat:', error);
    return null;
  }
};
```

**Alternative:** You can also search through all conversations:

```javascript
const openChatAlternative = async (orderId) => {
  try {
    // Get conversations and find one for this order
    const { data } = await getConversations();
    const conversation = data.conversations.find(
      conv => conv.orderId === orderId
    );
    
    if (conversation) {
      return conversation;
    }
    
    // If not found, use the dedicated endpoint to create it
    return await getConversationByOrder(orderId);
  } catch (error) {
    console.error('Error opening chat:', error);
  }
};
```

### Step 3: Load Message History

```javascript
const loadMessages = async (conversationId, cursor = null) => {
  try {
    const { data } = await getMessages(conversationId, cursor, 50);
    
    // Messages are in reverse chronological order (newest first)
    // Reverse for display if needed
    const messages = data.messages.reverse();
    
    return {
      messages,
      cursor: data.cursor,
      hasMore: data.hasMore,
    };
  } catch (error) {
    console.error('Error loading messages:', error);
  }
};
```

### Step 4: Send Messages

**Option A: REST API (Recommended for file uploads)**
```javascript
const handleSendMessage = async (orderId, content, attachments = []) => {
  try {
    const { data } = await sendMessage(orderId, content, attachments);
    
    // Update UI with sent message
    // Also listen for WebSocket confirmation
    return data;
  } catch (error) {
    if (error.response?.status === 400) {
      // Handle validation errors
      const errorData = error.response.data;
      if (errorData.error?.code === 'CHAT_NOT_AVAILABLE') {
        // Show error: Chat only available when order is out for delivery
      }
    }
  }
};
```

**Option B: WebSocket**
```javascript
const handleSendMessage = (conversationId, orderId, content) => {
  chatSocket.sendMessage(conversationId, orderId, content);
  // Optimistically update UI
  // Wait for 'new-message' event for confirmation
};
```

### Step 5: Real-time Updates

```javascript
// Set up WebSocket listeners when conversation is opened
useEffect(() => {
  if (conversationId) {
    chatSocket.joinConversation(conversationId);
    chatSocket.onMessageCallback = (message) => {
      // Add message to UI
      setMessages(prev => [...prev, message]);
      
      // Mark as read if conversation is active
      if (isActive) {
        chatSocket.markAsRead(conversationId);
      }
    };
  }
  
  return () => {
    if (conversationId) {
      chatSocket.leaveConversation(conversationId);
    }
  };
}, [conversationId]);
```

### Step 6: Typing Indicators

```javascript
let typingTimeout;

const handleTextChange = (text) => {
  setMessageText(text);
  
  // Send typing indicator
  if (text.length > 0) {
    chatSocket.setTyping(conversationId, true);
    
    // Clear existing timeout
    if (typingTimeout) clearTimeout(typingTimeout);
    
    // Stop typing after 3 seconds of inactivity
    typingTimeout = setTimeout(() => {
      chatSocket.setTyping(conversationId, false);
    }, 3000);
  } else {
    chatSocket.setTyping(conversationId, false);
  }
};
```

---

## Error Handling

### Common Error Codes

| Code | HTTP Status | Description | Solution |
|------|-------------|-------------|----------|
| `ORDER_NOT_FOUND` | 404 | Order does not exist | Verify order ID |
| `NO_RIDER_ASSIGNED` | 400 | Order has no assigned rider | Wait for rider assignment |
| `RIDER_USER_NOT_FOUND` | 404 | Rider user account not found | Contact support |
| `CHAT_NOT_AVAILABLE` | 400 | Chat only available when order is OUT_FOR_DELIVERY | Check order status |
| `CONVERSATION_NOT_FOUND` | 404 | Conversation does not exist | Verify conversation ID |
| `CONVERSATION_READ_ONLY` | 400 | Conversation is read-only (order delivered) | Disable message input |
| `ACCESS_DENIED` | 403 | User is not a participant | Verify user is customer or assigned rider |
| `INVALID_CURSOR` | 400 | Invalid cursor format | Use cursor from previous response |
| `VALIDATION_ERROR` | 400 | Missing required fields | Check request payload |

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "CHAT_NOT_AVAILABLE",
    "message": "Chat is only available when order is out for delivery. Current status: ready"
  }
}
```

### Error Handling Example

```javascript
const handleError = (error) => {
  if (error.response) {
    const { status, data } = error.response;
    
    switch (data.error?.code) {
      case 'CHAT_NOT_AVAILABLE':
        showAlert('Chat is only available when your order is out for delivery.');
        break;
      case 'CONVERSATION_READ_ONLY':
        showAlert('This conversation is read-only. The order has been delivered.');
        disableMessageInput();
        break;
      case 'ACCESS_DENIED':
        showAlert('You do not have access to this conversation.');
        break;
      case 'RIDER_USER_NOT_FOUND':
        showAlert('Rider account not found. Please contact support.');
        break;
      case 'CONVERSATION_NOT_FOUND':
        showAlert('Conversation not found.');
        break;
      default:
        showAlert(data.error?.message || 'An error occurred');
    }
  } else {
    showAlert('Network error. Please check your connection.');
  }
};
```

---

## UI/UX Recommendations

### 1. Chat Availability Indicator

Show a clear indicator when chat is available:

```javascript
const getChatStatus = (order) => {
  if (!order.assignedRiderId) {
    return { available: false, message: 'Waiting for rider assignment' };
  }
  if (order.status === 'out-for-delivery') {
    return { available: true, readOnly: false, message: 'Chat with rider' };
  }
  if (order.status === 'delivered') {
    return { available: true, readOnly: true, message: 'Chat (read-only)' };
  }
  return { available: false, message: 'Chat not available' };
};
```

### 2. Message List UI

- Display messages in chronological order (oldest first)
- Show sender name/avatar for each message
- Display read receipts (✓ for sent, ✓✓ for read)
- Show timestamps (relative time for recent, absolute for older)
- Highlight unread messages

### 3. Typing Indicator

```javascript
const [typingUsers, setTypingUsers] = useState({});

socket.on('user-typing', (data) => {
  setTypingUsers(prev => ({
    ...prev,
    [data.conversationId]: data.isTyping ? data.userId : null,
  }));
});

// In UI
{typingUsers[conversationId] && (
  <Text style={styles.typingIndicator}>
    {getOtherUserName()} is typing...
  </Text>
)}
```

### 4. Read-Only State

When conversation is read-only:
- Disable message input field
- Show banner: "This conversation is read-only. The order has been delivered."
- Allow viewing message history

### 5. Attachment Handling

- Show image previews in chat
- For PDFs, show file icon with download option
- Limit file size (recommend max 5MB per file)
- Show upload progress for multiple files

### 6. Unread Badge

```javascript
const getUnreadCount = async (conversationId) => {
  // Calculate from local messages or fetch from API
  const unreadMessages = messages.filter(
    msg => !msg.isRead && msg.senderId !== currentUserId
  );
  return unreadMessages.length;
};
```

### 7. Connection Status

Show connection status indicator:
- 🟢 Connected
- 🟡 Connecting
- 🔴 Disconnected

```javascript
socket.on('connect', () => {
  setConnectionStatus('connected');
});

socket.on('disconnect', () => {
  setConnectionStatus('disconnected');
});

socket.on('connect_error', () => {
  setConnectionStatus('error');
});
```

---

## Testing Checklist

- [ ] Connect to WebSocket successfully
- [ ] Join/leave conversation rooms
- [ ] Send and receive messages via REST API
- [ ] Send and receive messages via WebSocket
- [ ] Upload and display image attachments
- [ ] Upload and display PDF attachments
- [ ] Typing indicators work correctly
- [ ] Read receipts update properly
- [ ] Cursor pagination loads message history
- [ ] Chat unavailable when order not OUT_FOR_DELIVERY
- [ ] Chat becomes read-only after delivery
- [ ] Error handling for all error codes
- [ ] Reconnection after network loss
- [ ] Multiple conversations work correctly
- [ ] Access control (only participants can access)

---

## Support

For issues or questions:
- Check error codes and messages
- Verify authentication token is valid
- Ensure order status and rider assignment
- Review WebSocket connection status
- Check API base URL and WebSocket URL configuration

---

## Changelog

### Version 1.0.0
- Initial release
- Real-time messaging
- File attachments
- Read receipts
- Typing indicators
- Cursor-based pagination
