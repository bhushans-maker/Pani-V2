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
import { App as CapApp } from '@capacitor/app';
import { isNative } from './lib/platform';

export default function App() {
  const {
    profile, theme,
    isAlarmRinging, isAlarmUIVisible,
    setAlarmRinging, setAlarmUIVisible,
    activeTab, setActiveTab,
    getNextAlarmTime, isAlarmEnabled, intakeRecords,
  } = useStore();

  const scheduledRef = useRef<number>(0);

  // ── Schedule native alarm whenever relevant state changes ──────────────────
  useEffect(() => {
    const go = async () => {
      if (!profile || !isAlarmEnabled) {
        await alarmNativeManager.cancelAlarm();
        return;
      }
      const next = getNextAlarmTime();
      if (!next) { await alarmNativeManager.cancelAlarm(); return; }
      if (next !== scheduledRef.current) {
        scheduledRef.current = next;
        await alarmNativeManager.setAlarm(next, "Time to drink water! 💧");
      }
    };
    go();
  }, [profile, isAlarmEnabled, intakeRecords, getNextAlarmTime]);

  // ── Native lifecycle (permissions + alarm trigger detection) ───────────────
  useEffect(() => {
    if (!isNative()) return;

    const requestPerms = async () => {
      // Overlay permission
      const overlayOk = await alarmNativeManager.checkOverlayPermission();
      if (!overlayOk) {
        alert("AquaAlarm needs 'Display over other apps' permission to show the alarm screen. Please grant it on the next screen.");
        await alarmNativeManager.requestOverlayPermission();
      }
      // Battery optimization
      const batteryOk = await alarmNativeManager.checkBatteryPermission();
      if (!batteryOk) {
        alert("To ensure alarms fire reliably, please tap 'Allow' to exempt AquaAlarm from battery optimization.");
        await alarmNativeManager.requestBatteryPermission();
      }
    };
    requestPerms();

    // When app comes to foreground — check if alarm service launched us
    const appStateListener = CapApp.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) return;
      const triggered = await alarmNativeManager.isAlarmTriggered();
      if (triggered) {
        setActiveTab('dashboard');
        setAlarmRinging(true);
      }
    });

    // Cold launch — check if we were opened by alarm intent
    alarmNativeManager.isAlarmTriggered().then(triggered => {
      if (triggered) {
        setActiveTab('dashboard');
        setAlarmRinging(true);
      }
    });

    return () => { appStateListener.then(h => h.remove()); };
  }, [setAlarmRinging, setActiveTab]);

  // ── Hardware back button ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isNative()) return;
    const listener = CapApp.addListener('backButton', () => {
      if (isAlarmRinging || isAlarmUIVisible) return; // block back during alarm
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

  // ── Polling fallback when app is open ────────────────────────────────────
  useEffect(() => {
    if (!profile || !isAlarmEnabled) return;
    const iv = setInterval(() => {
      const next = getNextAlarmTime();
      if (next && Date.now() >= next && !isAlarmRinging) setAlarmRinging(true);
    }, 3000);
    return () => clearInterval(iv);
  }, [profile, isAlarmEnabled, isAlarmRinging, getNextAlarmTime, setAlarmRinging]);

  if (!profile) return <Onboarding />;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col max-w-md mx-auto relative shadow-2xl overflow-hidden">

      {/* Alarm Screen Overlay — only way to dismiss is logging water */}
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
        {activeTab === 'history'   && <History />}
        {activeTab === 'settings'  && <Settings />}
      </main>

      <nav className="absolute bottom-0 w-full bg-card border-t border-border/50 px-6 py-4 flex justify-between items-center z-10">
        {[
          { tab: 'dashboard', label: 'Today',   icon: <Droplets className="w-6 h-6" /> },
          { tab: 'history',   label: 'History', icon: <BarChart3 className="w-6 h-6" /> },
          { tab: 'settings',  label: 'Settings', icon: <SettingsIcon className="w-6 h-6" /> },
        ].map(({ tab, label, icon }) => (
          <button key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={cn("flex flex-col items-center gap-1 transition-colors",
              activeTab === tab ? "text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            {icon}
            <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
