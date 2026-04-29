import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './platform';

export const notificationManager = {
  async init() {
    if (!isNative()) return;
    
    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }
    
    // Create a high priority channel for alarms (Android only)
    await LocalNotifications.createChannel({
      id: 'water-alarms',
      name: 'Water Alarms',
      description: 'Critical hydration reminders',
      importance: 5, // max importance
      visibility: 1, // public
      vibration: true,
      sound: 'alarm_bright.wav', // We would need this asset, falling back to default if not found
    });
  },

  async schedule(timestamp: number, message: string) {
    if (!isNative()) {
      console.log(`[Web Sync] Scheduled notification for ${new Date(timestamp).toLocaleTimeString()}: ${message}`);
      return;
    }

    // Standard LocalNotifications for background visibility
    // We keep this so the user sees a notification even if the full-screen intent is blocked by OS settings
    await LocalNotifications.schedule({
      notifications: [
        {
          title: 'Hydration Alert!',
          body: message,
          id: 1,
          schedule: { 
            at: new Date(timestamp), 
            allowWhileIdle: true 
          },
          sound: 'alarm_bright.mp3',
          actionTypeId: 'OPEN_ALARM',
          channelId: 'water-alarms',
          ongoing: true,
          autoCancel: false,
          extra: {
            timestamp
          }
        }
      ]
    });
  },

  async cancelAll() {
    if (!isNative()) return;
    
    const list = await LocalNotifications.getPending();
    if (list.notifications.length > 0) {
      await LocalNotifications.cancel(list);
    }
  }
};
