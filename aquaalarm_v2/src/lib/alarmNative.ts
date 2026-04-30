import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform';

export interface AlarmPlugin {
  setAlarm(options: { timestamp: number; message: string }): Promise<void>;
  cancelAlarm(): Promise<void>;
  dismissAlarm(): Promise<void>;
  playAlarmNow(options: { message: string }): Promise<void>;
  getAlarmStatus(): Promise<{ isAlarmTriggered: boolean }>;
  checkOverlayPermission(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<void>;
  checkBatteryPermission(): Promise<{ granted: boolean }>;
  requestBatteryPermission(): Promise<void>;
}

const NativeAlarm = registerPlugin<AlarmPlugin>('AlarmPlugin');

export const alarmNativeManager = {

  async setAlarm(timestamp: number, message: string) {
    if (!isNative()) {
      console.log(`[Web] Alarm scheduled: ${new Date(timestamp).toLocaleTimeString()}`);
      return;
    }
    try { await NativeAlarm.setAlarm({ timestamp, message }); }
    catch (e) { console.error('setAlarm error:', e); }
  },

  // playAlarmNow — call this when alarm fires while app is open.
  // Plays ringtone + vibration DIRECTLY without needing ForegroundService.
  async playAlarmNow(message = 'Time to drink water! 💧') {
    if (!isNative()) {
      console.log('[Web] playAlarmNow — would play ringtone here');
      return;
    }
    try { await NativeAlarm.playAlarmNow({ message }); }
    catch (e) { console.error('playAlarmNow error:', e); }
  },

  async cancelAlarm() {
    if (!isNative()) return;
    try { await NativeAlarm.cancelAlarm(); }
    catch (e) { console.error('cancelAlarm error:', e); }
  },

  async dismissAlarm() {
    if (!isNative()) return;
    try { await NativeAlarm.dismissAlarm(); }
    catch (e) { console.error('dismissAlarm error:', e); }
  },

  async isAlarmTriggered(): Promise<boolean> {
    if (!isNative()) return false;
    try {
      const { isAlarmTriggered } = await NativeAlarm.getAlarmStatus();
      return isAlarmTriggered;
    } catch { return false; }
  },

  async checkOverlayPermission(): Promise<boolean> {
    if (!isNative()) return true;
    try { return (await NativeAlarm.checkOverlayPermission()).granted; }
    catch { return true; }
  },

  async requestOverlayPermission() {
    if (!isNative()) return;
    try { await NativeAlarm.requestOverlayPermission(); }
    catch (e) { console.error(e); }
  },

  async checkBatteryPermission(): Promise<boolean> {
    if (!isNative()) return true;
    try { return (await NativeAlarm.checkBatteryPermission()).granted; }
    catch { return true; }
  },

  async requestBatteryPermission() {
    if (!isNative()) return;
    try { await NativeAlarm.requestBatteryPermission(); }
    catch (e) { console.error(e); }
  },
};
