import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Droplets } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { alarmNativeManager } from '../lib/alarmNative';

export default function AlarmScreen() {
  const { snoozeAlarm, addIntake, alarmAmount, getNextAlarmTime, isAlarmEnabled, profile } = useStore();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── LOG WATER → only way to fully stop the alarm ──────────────────────────
  const handleLogWater = async () => {
    // 1. Stop the native ringtone + vibration immediately
    await alarmNativeManager.dismissAlarm();

    // 2. Log intake — this also sets isAlarmRinging=false & isAlarmUIVisible=false in store
    addIntake(alarmAmount);

    // 3. Schedule the NEXT alarm
    setTimeout(async () => {
      const next = useStore.getState().getNextAlarmTime();
      if (next && isAlarmEnabled && profile) {
        await alarmNativeManager.setAlarm(next, "Time to drink water! 💧");
      }
    }, 300);
  };

  // ── SNOOZE → 15 min delay, alarm still fires after snooze ────────────────
  const handleSnooze = async () => {
    // Stop ringing now
    await alarmNativeManager.dismissAlarm();
    snoozeAlarm(); // sets isAlarmRinging=false in store, records snoozeUntil

    // Schedule snooze wakeup
    const snoozeTime = Date.now() + 15 * 60 * 1000;
    await alarmNativeManager.setAlarm(snoozeTime, "Snooze over — drink water now! 💧");
  };

  return (
    <div className="fixed inset-0 z-50 bg-background text-foreground flex flex-col items-center justify-between py-12 px-6 overflow-hidden">
      {/* Animated water background */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <svg className="w-full h-full opacity-15" viewBox="0 0 400 800" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            animate={{ d: [
              "M0 400 Q100 350 200 400 T400 400 L400 800 L0 800 Z",
              "M0 400 Q100 450 200 400 T400 400 L400 800 L0 800 Z",
              "M0 400 Q100 350 200 400 T400 400 L400 800 L0 800 Z"
            ]}}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            fill="url(#grad)"
          />
        </svg>
      </div>

      {/* Clock */}
      <div className="flex flex-col items-center space-y-2 relative z-10 pt-16">
        <motion.h1
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-6xl font-extralight tracking-tighter"
        >
          {format(time, 'h:mm')}
          <span className="text-2xl ml-1 font-light opacity-60">{format(time, 'a')}</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-xs text-primary font-black tracking-[0.25em] uppercase text-center px-8"
        >
          💧 Time to Drink Water!
        </motion.p>
      </div>

      {/* Big LOG WATER button */}
      <div className="flex-1 w-full flex flex-col items-center justify-center relative z-10">
        <div className="flex flex-col items-center gap-12">
          <div className="relative w-72 h-72 flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.2, 0.1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="absolute inset-0 border-[0.5px] border-primary rounded-full"
            />
            <motion.div
              animate={{ scale: [1, 1.25, 1], opacity: [0.05, 0.1, 0.05] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
              className="absolute inset-0 border-[0.5px] border-primary rounded-full"
            />
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={handleLogWater}
              className="relative z-10 w-64 h-64 flex flex-col items-center justify-center cursor-pointer"
            >
              <div className="relative mb-4">
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Droplets className="w-28 h-28 text-primary opacity-90" strokeWidth={1} />
                </motion.div>
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-125 -z-10" />
              </div>
              <span className="text-primary font-bold text-base uppercase tracking-[0.4em] mt-1">
                Log {alarmAmount}ml
              </span>
              <span className="text-primary/60 text-xs mt-1 tracking-widest">
                TAP TO STOP ALARM
              </span>
            </motion.button>
          </div>

          {/* Snooze */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            onClick={handleSnooze}
            className="px-12 py-4 rounded-full bg-muted/20 backdrop-blur-md border border-white/10 hover:bg-muted/30 transition-all active:scale-95"
          >
            <span className="text-xs text-foreground/80 font-bold uppercase tracking-[0.3em]">
              Snooze 15 min
            </span>
          </motion.button>
        </div>
      </div>

      <div className="text-center relative z-10">
        <p className="text-primary/60 text-[8px] font-black uppercase tracking-[0.5em] animate-pulse">
          Log water intake to dismiss
        </p>
      </div>
    </div>
  );
}
