import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Droplets, ArrowDown } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { alarmNativeManager } from '../lib/alarmNative';

/**
 * AlarmScreen — shown when alarm fires.
 * 
 * CORE LOGIC:
 * - Ringtone + vibration keep going (handled by WaterAlarmService on native)
 * - This screen shows: "Go to dashboard and log your water to stop the alarm"
 * - Snooze: stops ringtone for 15 min, then fires again
 * - The ONLY way to permanently stop: go to Dashboard → tap a Quick Log button
 *   → addIntake() calls dismissAlarm() which kills WaterAlarmService
 */
export default function AlarmScreen() {
  const { snoozeAlarm, setActiveTab, alarmAmount } = useStore();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Go to dashboard so user can log water — ringtone keeps ringing
  const handleGoToDashboard = () => {
    setActiveTab('dashboard');
    // Hide the overlay — but ringtone/vibration KEEPS GOING until water is logged
    useStore.getState().setAlarmUIVisible(false);
    // NOTE: isAlarmRinging stays TRUE so dismissAlarm() is still called
    // when addIntake() fires in the store
  };

  // Snooze — stop ringtone for 15 min, then fires again
  const handleSnooze = async () => {
    await alarmNativeManager.dismissAlarm(); // stop sound now
    snoozeAlarm(); // sets isAlarmRinging=false, records snoozeUntil
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
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            animate={{ d: [
              "M0 400 Q100 350 200 400 T400 400 L400 800 L0 800 Z",
              "M0 400 Q100 450 200 400 T400 400 L400 800 L0 800 Z",
              "M0 400 Q100 350 200 400 T400 400 L400 800 L0 800 Z"
            ]}}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            fill="url(#grad)"
          />
        </svg>
      </div>

      {/* Clock */}
      <div className="flex flex-col items-center space-y-3 relative z-10 pt-16">
        <motion.h1
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-7xl font-extralight tracking-tighter"
        >
          {format(time, 'h:mm')}
          <span className="text-3xl ml-2 font-light opacity-60">{format(time, 'a')}</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-sm text-primary font-black tracking-[0.2em] uppercase text-center"
        >
          💧 Time to Drink Water!
        </motion.p>
      </div>

      {/* Center — pulsing droplet + instruction */}
      <div className="flex-1 w-full flex flex-col items-center justify-center relative z-10 gap-8">

        {/* Pulsing icon */}
        <div className="relative flex items-center justify-center">
          <motion.div animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            className="absolute w-48 h-48 border border-primary rounded-full"
          />
          <motion.div animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: 0.3 }}
            className="absolute w-48 h-48 border border-primary rounded-full"
          />
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Droplets className="w-24 h-24 text-primary" strokeWidth={1} />
          </motion.div>
        </div>

        {/* Instruction card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-primary/10 border border-primary/30 rounded-3xl px-8 py-6 text-center max-w-xs"
        >
          <p className="text-primary font-bold text-base mb-2">How to stop the alarm:</p>
          <p className="text-foreground/80 text-sm leading-relaxed">
            Tap <span className="text-primary font-bold">"Go to Dashboard"</span> below,
            then tap any <span className="text-primary font-bold">Quick Log</span> button
            to record your water intake.
          </p>
          <div className="flex items-center justify-center gap-2 mt-3 text-primary/60">
            <ArrowDown className="w-4 h-4 animate-bounce" />
            <span className="text-xs font-semibold uppercase tracking-widest">Ringtone stops after logging</span>
          </div>
        </motion.div>

        {/* GO TO DASHBOARD — primary action */}
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleGoToDashboard}
          className="w-72 py-5 rounded-full bg-primary text-primary-foreground font-black text-sm uppercase tracking-[0.3em] shadow-lg shadow-primary/30 active:scale-95 transition-all"
        >
          Go to Dashboard →
        </motion.button>

      </div>

      {/* Snooze */}
      <div className="relative z-10 flex flex-col items-center gap-3">
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          onClick={handleSnooze}
          className="px-10 py-3 rounded-full bg-muted/30 border border-white/10 active:scale-95 transition-all"
        >
          <span className="text-xs text-foreground/60 font-bold uppercase tracking-[0.3em]">
            Snooze 15 min
          </span>
        </motion.button>
        <p className="text-[9px] text-primary/40 font-bold uppercase tracking-[0.4em] animate-pulse">
          Alarm keeps ringing until water is logged
        </p>
      </div>
    </div>
  );
}
