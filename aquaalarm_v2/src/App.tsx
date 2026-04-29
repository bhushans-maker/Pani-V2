import { useEffect, useRef } from 'react';
import { useStore } from './store/useStore';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import History from './components/History';
import Settings from './components/Settings';
import AlarmScreen from './components/AlarmScreen';
import { Droplets, BarChart3, Settings as SettingsIcon } from 'lucide-react';
import { cn } from './lib/utils';
import { alarmNativeManager } from './lib/alarmNative';
import { motion, AnimatePresence } from 'motion/react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as CapApp } from '@capacitor/app';
import { isNative } from './lib/platform';

export default function App() {
  const {
    profile,
    theme,
    isAlarmRinging,
    isAlarmUIVisible,
    setAlarmRinging,
    activeTab,
    setActiveTab,
    getNextAlarmTime,
    isAlarmEnabled,
    intakeRecords,
  } = useStore();

  const scheduledRef = useRef<number>(0);

  // ── Schedule / cancel native alarm whenever state changes ──────────────────
  useEffect(() => {
    const scheduleNext = async () => {
      if (!profile || !isAlarmEnabled) {
        await alarmNativeManager.cancelAlarm();
        return;
      }
      const next = getNextAlarmTime();
      if (!next) {
        await alarmNativeManager.cancelAlarm();
        return;
      }
      // Only reschedule if the time actually changed (avoid hammering AlarmManager)
      if (next !== scheduledRef.current) {
        scheduledRef.current = next;
        await alarmNativeManager.setAlarm(next, "Time to drink water! 💧");
      }
    };
    scheduleNext();
  }, [profile, isAlarmEnabled, intakeRecords, getNextAlarmTime]);

  // ── Permissions + notification listener (native only) ──────────────────────
  useEffect(() => {
    if (!isNative()) return;

    // Request permissions on first launch
    const requestPerms = async () => {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') await LocalNotifications.requestPermissions();

      const overlayGranted = await alarmNativeManager.checkOverlayPermission();
      if (!overlayGranted) {
        alert("Please enable 'Display over other apps' for AquaAlarm so the alarm screen can appear.");
        await alarmNativeManager.requestOverlayPermission();
      }

      const batteryGranted = await alarmNativeManager.checkBatteryPermission();
      if (!batteryGranted) {
        alert("Please disable battery optimization for AquaAlarm so alarms fire reliably in the background.");
        await alarmNativeManager.requestBatteryPermission();
      }
    };
    requestPerms();

    // Notification tap → show alarm screen
    const notifListener = LocalNotifications.addListener(
      'localNotificationActionPerformed',
      () => {
        setAlarmRinging(true);
        setActiveTab('dashboard');
      }
    );

    // App comes to foreground → check if alarm was triggered
    const appStateListener = CapApp.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) return;
      const triggered = await alarmNativeManager.isAlarmTriggered();
      if (triggered) setAlarmRinging(true);
    });

    // Cold launch check
    alarmNativeManager.isAlarmTriggered().then(triggered => {
      if (triggered) setAlarmRinging(true);
    });

    return () => {
      notifListener.then(h => h.remove());
      appStateListener.then(h => h.remove());
    };
  }, [setAlarmRinging, setActiveTab]);

  // ── Hardware back button ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isNative()) return;
    const listener = CapApp.addListener('backButton', () => {
      if (isAlarmRinging || isAlarmUIVisible) return;
      if (activeTab !== 'dashboard') setActiveTab('dashboard');
      else CapApp.exitApp();
    });
    return () => { listener.then(h => h.remove()); };
  }, [activeTab, setActiveTab, isAlarmRinging, isAlarmUIVisible]);

  // ── Theme ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-blue');
    document.documentElement.classList.add(`theme-${theme}`);
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  // ── Polling fallback (app is open) ────────────────────────────────────────
  useEffect(() => {
    if (!profile || !isAlarmEnabled) return;
    const interval = setInterval(() => {
      const next = getNextAlarmTime();
      if (next && Date.now() >= next && !isAlarmRinging) {
        setAlarmRinging(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [profile, isAlarmEnabled, isAlarmRinging, getNextAlarmTime, setAlarmRinging]);

  if (!profile) return <Onboarding />;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col max-w-md mx-auto relative shadow-2xl overflow-hidden">
      <AnimatePresence>
        {isAlarmUIVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100]"
          >
            <AlarmScreen />
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 overflow-y-auto pb-20">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'history' && <History />}
        {activeTab === 'settings' && <Settings />}
      </main>

      <nav className="absolute bottom-0 w-full bg-card border-t border-border/50 px-6 py-4 flex justify-between items-center z-10">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={cn("flex flex-col items-center gap-1 transition-colors",
            activeTab === 'dashboard' ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          <Droplets className="w-6 h-6" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Today</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn("flex flex-col items-center gap-1 transition-colors",
            activeTab === 'history' ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          <BarChart3 className="w-6 h-6" />
          <span className="text-[10px] font-medium uppercase tracking-wider">History</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={cn("flex flex-col items-center gap-1 transition-colors",
            activeTab === 'settings' ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          <SettingsIcon className="w-6 h-6" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Settings</span>
        </button>
      </nav>
    </div>
  );
}
