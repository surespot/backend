# Frontend Notifications Setup Guide

This guide covers setting up both **in-app notifications via WebSockets** and **push notifications via Expo** in your React Native Expo app.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [WebSocket Setup (In-App Notifications)](#websocket-setup-in-app-notifications)
3. [Push Notifications Setup](#push-notifications-setup)
4. [Complete Integration Example](#complete-integration-example)
5. [Best Practices](#best-practices)

---

## Prerequisites

### Required Packages

Install the following packages:

```bash
npm install socket.io-client expo-notifications expo-device
```

Or with yarn:

```bash
yarn add socket.io-client expo-notifications expo-device
```

### Environment Variables

Add your backend API URL to your `.env` or `app.config.js`.

---

## WebSocket Setup (In-App Notifications)

### 1. Create WebSocket Service

Create a file `src/services/notifications/websocket.service.ts`:

```typescript
import { io, Socket } from 'socket.io-client';
import { API_URL } from '@env';

export interface NotificationPayload {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  channels: string[];
  isRead: boolean;
  createdAt: string;
}

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private listeners: Map<string, Set<(data: NotificationPayload) => void>> = new Map();
  private connectionListeners: Set<(connected: boolean) => void> = new Set();

  /**
   * Connect to the notifications WebSocket server
   * @param token - JWT access token for authentication
   */
  connect(token: string): void {
    if (this.socket?.connected) {
      console.log('[WebSocket] Already connected');
      return;
    }

    // Disconnect existing connection if any
    this.disconnect();

    console.log('[WebSocket] Connecting to notifications server...');

    this.socket = io(`${API_URL}/notifications`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      reconnectionDelayMax: 5000,
      auth: {
        token: token,
      },
    });

    this.setupEventHandlers();
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection successful
    this.socket.on('connect', () => {
      console.log('[WebSocket] Connected to notifications server');
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.notifyConnectionListeners(true);
    });

    // Connection confirmation from server
    this.socket.on('connected', (data: { success: boolean; userId: string }) => {
      console.log('[WebSocket] Server confirmed connection:', data);
    });

    // Receive notification
    this.socket.on('notification', (notification: NotificationPayload) => {
      console.log('[WebSocket] Received notification:', notification);
      this.notifyListeners('notification', notification);
    });

    // Disconnect event
    this.socket.on('disconnect', (reason: string) => {
      console.log('[WebSocket] Disconnected:', reason);
      this.notifyConnectionListeners(false);

      // Handle reconnection
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect
        this.socket?.connect();
      }
    });

    // Connection error
    this.socket.on('connect_error', (error: Error) => {
      console.error('[WebSocket] Connection error:', error.message);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[WebSocket] Max reconnection attempts reached');
        this.notifyConnectionListeners(false);
      }
    });

    // Reconnection attempt
    this.socket.io.on('reconnect_attempt', (attempt: number) => {
      console.log(`[WebSocket] Reconnection attempt ${attempt}`);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 5000); // Exponential backoff, max 5s
    });

    // Reconnection successful
    this.socket.io.on('reconnect', (attempt: number) => {
      console.log(`[WebSocket] Reconnected after ${attempt} attempts`);
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.notifyConnectionListeners(true);
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      console.log('[WebSocket] Disconnecting...');
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.notifyConnectionListeners(false);
    }
  }

  /**
   * Subscribe to notification events
   * @param callback - Function to call when a notification is received
   * @returns Unsubscribe function
   */
  onNotification(callback: (notification: NotificationPayload) => void): () => void {
    if (!this.listeners.has('notification')) {
      this.listeners.set('notification', new Set());
    }
    this.listeners.get('notification')?.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get('notification')?.delete(callback);
    };
  }

  /**
   * Subscribe to connection status changes
   * @param callback - Function to call when connection status changes
   * @returns Unsubscribe function
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback);

    // Return unsubscribe function
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of a notification event
   */
  private notifyListeners(event: string, data: NotificationPayload): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error('[WebSocket] Error in notification callback:', error);
        }
      });
    }
  }

  /**
   * Notify all connection listeners
   */
  private notifyConnectionListeners(connected: boolean): void {
    this.connectionListeners.forEach((callback) => {
      try {
        callback(connected);
      } catch (error) {
        console.error('[WebSocket] Error in connection callback:', error);
      }
    });
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

// Export singleton instance
export const webSocketService = new WebSocketService();
```

### 2. Create Notification Context

Create `src/contexts/NotificationContext.tsx`:

```typescript
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { webSocketService, NotificationPayload } from '../services/notifications/websocket.service';
import { useAuth } from './AuthContext'; // Adjust import path as needed

interface NotificationContextType {
  notifications: NotificationPayload[];
  unreadCount: number;
  isConnected: boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth(); // Get user and JWT token from auth context
  const [notifications, setNotifications] = useState<NotificationPayload[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // Connect WebSocket when user is authenticated
  useEffect(() => {
    if (user && token) {
      webSocketService.connect(token);

      // Listen for connection status
      const unsubscribeConnection = webSocketService.onConnectionChange((connected) => {
        setIsConnected(connected);
      });

      // Listen for notifications
      const unsubscribeNotification = webSocketService.onNotification((notification) => {
        setNotifications((prev) => {
          // Check if notification already exists (avoid duplicates)
          const exists = prev.some((n) => n.id === notification.id);
          if (exists) return prev;

          // Add new notification at the beginning
          return [notification, ...prev];
        });
      });

      return () => {
        unsubscribeConnection();
        unsubscribeNotification();
        webSocketService.disconnect();
      };
    } else {
      webSocketService.disconnect();
      setNotifications([]);
      setIsConnected(false);
    }
  }, [user, token]);

  // Fetch notifications from API on mount and refresh
  const refreshNotifications = useCallback(async () => {
    if (!user || !token) return;

    try {
      const response = await fetch(`${API_URL}/api/v1/notifications`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.notifications) {
          setNotifications(data.data.notifications);
        }
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }, [user, token]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/api/v1/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
        );
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, [token]);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/api/v1/notifications/read-all`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }, [token]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/api/v1/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }, [token]);

  // Calculate unread count
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Fetch notifications on mount
  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refreshNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};
```

### 3. Usage in Components

```typescript
import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useNotifications } from '../contexts/NotificationContext';

const NotificationsScreen: React.FC = () => {
  const {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  return (
    <View>
      <Text>Connection Status: {isConnected ? 'Connected' : 'Disconnected'}</Text>
      <Text>Unread: {unreadCount}</Text>
      
      <TouchableOpacity onPress={markAllAsRead}>
        <Text>Mark All as Read</Text>
      </TouchableOpacity>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => markAsRead(item.id)}
            style={{ opacity: item.isRead ? 0.6 : 1 }}
          >
            <Text style={{ fontWeight: item.isRead ? 'normal' : 'bold' }}>
              {item.title}
            </Text>
            <Text>{item.message}</Text>
            <Text>{new Date(item.createdAt).toLocaleString()}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};
```

---

## Push Notifications Setup

### 1. Configure app.json/app.config.js

Add notification configuration to your `app.json` or `app.config.js`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#D4AF37",
          "sounds": ["./assets/notification-sound.wav"],
          "mode": "production"
        }
      ]
    ],
    "android": {
      "googleServicesFile": "./google-services.json",
      "useNextNotificationsApi": true
    },
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["remote-notification"]
      }
    }
  }
}
```

### 2. Create Push Notification Service

Create `src/services/notifications/push-notification.service.ts`:

```typescript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { API_URL } from '@env';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class PushNotificationService {
  private token: string | null = null;
  private registrationError: string | null = null;

  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    if (!Device.isDevice) {
      console.warn('[Push] Must use physical device for Push Notifications');
      return false;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('[Push] Failed to get push token for push notification!');
        this.registrationError = 'Permission not granted';
        return false;
      }

      return true;
    } catch (error) {
      console.error('[Push] Error requesting permissions:', error);
      this.registrationError = error instanceof Error ? error.message : 'Unknown error';
      return false;
    }
  }

  /**
   * Register for push notifications and get token
   */
  async registerForPushNotifications(): Promise<string | null> {
    try {
      // Request permissions first
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return null;
      }

      // Get the push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: 'your-expo-project-id', // Get from app.json or EAS
      });

      this.token = tokenData.data;
      console.log('[Push] Push token:', this.token);

      // Configure Android channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#D4AF37',
          sound: 'default',
        });
      }

      return this.token;
    } catch (error) {
      console.error('[Push] Error registering for push notifications:', error);
      this.registrationError = error instanceof Error ? error.message : 'Unknown error';
      return null;
    }
  }

  /**
   * Register push token with backend
   */
  async registerTokenWithBackend(token: string, authToken: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/api/v1/notifications/push-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token }),
      });

      if (response.ok) {
        console.log('[Push] Token registered with backend');
        return true;
      } else {
        const error = await response.json();
        console.error('[Push] Failed to register token:', error);
        return false;
      }
    } catch (error) {
      console.error('[Push] Error registering token with backend:', error);
      return false;
    }
  }

  /**
   * Remove push token from backend
   */
  async removeTokenFromBackend(token: string, authToken: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/api/v1/notifications/push-token/${token}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        console.log('[Push] Token removed from backend');
        return true;
      } else {
        console.error('[Push] Failed to remove token');
        return false;
      }
    } catch (error) {
      console.error('[Push] Error removing token from backend:', error);
      return false;
    }
  }

  /**
   * Setup notification listeners
   */
  setupNotificationListeners(
    onNotificationReceived: (notification: Notifications.Notification) => void,
    onNotificationTapped: (response: Notifications.NotificationResponse) => void
  ): () => void {
    // Listener for notifications received while app is foregrounded
    const receivedListener = Notifications.addNotificationReceivedListener(
      onNotificationReceived
    );

    // Listener for when user taps on notification
    const responseListener = Notifications.addNotificationResponseReceivedListener(
      onNotificationTapped
    );

    // Return cleanup function
    return () => {
      Notifications.removeNotificationSubscription(receivedListener);
      Notifications.removeNotificationSubscription(responseListener);
    };
  }

  /**
   * Get current token
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Get registration error
   */
  getRegistrationError(): string | null {
    return this.registrationError;
  }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();
```

### 3. Integrate Push Notifications in App

Update your `App.tsx` or main component:

```typescript
import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { pushNotificationService } from './src/services/notifications/push-notification.service';
import { useAuth } from './src/contexts/AuthContext';
import { useNotifications } from './src/contexts/NotificationContext';

export default function App() {
  const { user, token } = useAuth();
  const { refreshNotifications } = useNotifications();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    if (user && token) {
      // Register for push notifications
      pushNotificationService
        .registerForPushNotifications()
        .then((pushToken) => {
          if (pushToken) {
            // Register token with backend
            pushNotificationService.registerTokenWithBackend(pushToken, token);
          }
        })
        .catch((error) => {
          console.error('Failed to register for push notifications:', error);
        });

      // Setup notification listeners
      const cleanup = pushNotificationService.setupNotificationListeners(
        (notification) => {
          console.log('Notification received:', notification);
          // Refresh notifications list
          refreshNotifications();
        },
        (response) => {
          console.log('Notification tapped:', response);
          const data = response.notification.request.content.data;
          
          // Navigate based on notification data
          // Example: navigate to order details if orderId is present
          if (data?.orderId) {
            // navigation.navigate('OrderDetails', { orderId: data.orderId });
          }
        }
      );

      return () => {
        cleanup();
      };
    } else {
      // Remove token when user logs out
      const currentToken = pushNotificationService.getToken();
      if (currentToken && token) {
        pushNotificationService.removeTokenFromBackend(currentToken, token);
      }
    }
  }, [user, token, refreshNotifications]);

  return (
    // Your app components
  );
}
```

### 4. Handle Notification Permissions UI

Create a component to request permissions:

```typescript
import React, { useState, useEffect } from 'react';
import { View, Text, Button, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { pushNotificationService } from '../services/notifications/push-notification.service';

const NotificationPermissionScreen: React.FC = () => {
  const [permissionStatus, setPermissionStatus] = useState<string>('unknown');

  useEffect(() => {
    checkPermissionStatus();
  }, []);

  const checkPermissionStatus = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setPermissionStatus(status);
  };

  const requestPermission = async () => {
    const granted = await pushNotificationService.requestPermissions();
    if (granted) {
      Alert.alert('Success', 'Push notifications enabled!');
      checkPermissionStatus();
    } else {
      Alert.alert(
        'Permission Denied',
        'Please enable notifications in your device settings to receive updates about your orders.'
      );
    }
  };

  return (
    <View>
      <Text>Notification Permission: {permissionStatus}</Text>
      {permissionStatus !== 'granted' && (
        <Button title="Enable Notifications" onPress={requestPermission} />
      )}
    </View>
  );
};
```

---

## Complete Integration Example

### App.tsx (Complete Setup)

```typescript
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { NotificationProvider } from './src/contexts/NotificationContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { pushNotificationService } from './src/services/notifications/push-notification.service';
import { webSocketService } from './src/services/notifications/websocket.service';
import MainNavigator from './src/navigation/MainNavigator';

export default function App() {
  useEffect(() => {
    // Setup push notification listeners on app start
    const cleanup = pushNotificationService.setupNotificationListeners(
      (notification) => {
        console.log('Push notification received:', notification);
      },
      (response) => {
        console.log('Push notification tapped:', response);
        // Handle navigation based on notification data
      }
    );

    return cleanup;
  }, []);

  return (
    <AuthProvider>
      <NotificationProvider>
        <NavigationContainer>
          <MainNavigator />
        </NavigationContainer>
      </NotificationProvider>
    </AuthProvider>
  );
}
```

---

## Best Practices

### 1. **Token Management**
- Register token after successful login
- Remove token on logout
- Re-register token if it changes (Expo may issue new tokens)

### 2. **Error Handling**
- Always handle permission denials gracefully
- Show user-friendly messages
- Provide fallback to in-app notifications if push fails

### 3. **Connection Management**
- Connect WebSocket only when user is authenticated
- Disconnect on logout
- Handle reconnection automatically

### 4. **Notification Display**
- Show badge count for unread notifications
- Group notifications by type
- Allow users to mark as read/delete

### 5. **Testing**
- Test on physical devices (push notifications don't work on simulators)
- Test WebSocket reconnection scenarios
- Test notification permissions flow

### 6. **Performance**
- Limit notification history (e.g., last 50 notifications)
- Implement pagination for notification list
- Cache notifications locally

---

## Troubleshooting

### WebSocket Issues

**Problem**: WebSocket not connecting
- **Solution**: Check that JWT token is valid and not expired
- **Solution**: Verify API_URL is correct
- **Solution**: Check backend CORS settings

**Problem**: Notifications not received
- **Solution**: Verify user is in correct room (userId matches)
- **Solution**: Check backend logs for WebSocket connection status

### Push Notification Issues

**Problem**: Token registration fails
- **Solution**: Verify EXPO_ACCESS_TOKEN is set (optional but recommended)
- **Solution**: Check that projectId matches your Expo project

**Problem**: Notifications not received on Android
- **Solution**: Ensure notification channel is created
- **Solution**: Check app is not in battery optimization mode

**Problem**: Notifications not received on iOS
- **Solution**: Verify APNs certificates are configured
- **Solution**: Check notification permissions are granted

---

## API Endpoints Reference

### Register Push Token
```
POST /api/v1/notifications/push-token
Headers: Authorization: Bearer <token>
Body: { "token": "ExponentPushToken[...]" }
```

### Remove Push Token
```
DELETE /api/v1/notifications/push-token/:token
Headers: Authorization: Bearer <token>
```

### Get Notifications
```
GET /api/v1/notifications?page=1&limit=20
Headers: Authorization: Bearer <token>
```

### Mark as Read
```
POST /api/v1/notifications/:id/read
Headers: Authorization: Bearer <token>
```

### Mark All as Read
```
POST /api/v1/notifications/read-all
Headers: Authorization: Bearer <token>
```

---

## Additional Resources

- [Expo Notifications Documentation](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Socket.IO Client Documentation](https://socket.io/docs/v4/client-api/)
- [React Native Navigation](https://reactnavigation.org/)

