import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { startOfDay, format } from 'date-fns';

export type Gender = 'male' | 'female' | 'other';
export type Weather = 'cold' | 'normal' | 'hot' | 'very_hot';
export type Theme = 'light' | 'dark' | 'blue';

export interface UserProfile {
  gender: Gender;
  weight: number;
  height: number;
  age: number;
  wakeTime: string;
  sleepTime: string;
}

export interface IntakeRecord {
  id: string;
  amount: number;
  timestamp: number;
}

export interface DailyRecord {
  date: string;
  totalIntake: number;
  goal: number;
}

interface AppState {
  profile: UserProfile | null;
  weather: Weather;
  theme: Theme;
  alarmTune: string;
  intakeRecords: IntakeRecord[];
  dailyHistory: Record<string, DailyRecord>;
  isAlarmRinging: boolean;    // TRUE = alarm is active (ringtone playing on native)
  isAlarmUIVisible: boolean;  // TRUE = full-screen alarm overlay is shown
  isAlarmEnabled: boolean;
  snoozedUntil: number | null;
  alarmAmount: number;
  activeTab: 'dashboard' | 'history' | 'settings';

  setActiveTab: (tab: 'dashboard' | 'history' | 'settings') => void;
  setProfile: (profile: UserProfile) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  setWeather: (weather: Weather) => void;
  setTheme: (theme: Theme) => void;
  setAlarmTune: (tune: string) => void;
  setAlarmEnabled: (enabled: boolean) => void;
  addIntake: (amount: number) => void;
  setAlarmRinging: (isRinging: boolean) => void;
  setAlarmUIVisible: (isVisible: boolean) => void;
  snoozeAlarm: () => void;
  setAlarmAmount: (amount: number) => void;
  getDailyGoal: () => number;
  getTodayIntake: () => number;
  getNextAlarmTime: () => number | null;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      profile: null,
      weather: 'normal',
      theme: 'dark',
      alarmTune: 'tune1',
      intakeRecords: [],
      dailyHistory: {},
      isAlarmRinging: false,
      isAlarmUIVisible: false,
      isAlarmEnabled: true,
      snoozedUntil: null,
      alarmAmount: 250,
      activeTab: 'dashboard',

      setProfile:    (profile)    => set({ profile }),
      setActiveTab:  (activeTab)  => set({ activeTab }),
      updateProfile: (updates)    => set((state) => ({
        profile: state.profile ? { ...state.profile, ...updates } : null
      })),
      setWeather:    (weather)    => set({ weather }),
      setTheme:      (theme)      => set({ theme }),
      setAlarmTune:  (alarmTune)  => set({ alarmTune }),
      setAlarmEnabled: (isAlarmEnabled) => set({ isAlarmEnabled }),

      /**
       * addIntake — THE only place that fully stops the alarm.
       * Called from Dashboard Quick Log buttons.
       * 1. Saves the intake record
       * 2. Stops native ringtone/vibration via dismissAlarm()
       * 3. Clears all alarm state
       * 4. Schedules next alarm
       */
      addIntake: (amount) => {
        const now = Date.now();
        const todayStr = format(now, 'yyyy-MM-dd');
        const newRecord: IntakeRecord = {
          id: Math.random().toString(36).substring(7),
          amount,
          timestamp: now,
        };

        set((state) => {
          const goal = get().getDailyGoal();
          const currentDaily = state.dailyHistory[todayStr] || { date: todayStr, totalIntake: 0, goal };
          return {
            intakeRecords: [...state.intakeRecords, newRecord],
            dailyHistory: {
              ...state.dailyHistory,
              [todayStr]: {
                ...currentDaily,
                totalIntake: currentDaily.totalIntake + amount,
                goal,
              },
            },
            isAlarmRinging: false,
            isAlarmUIVisible: false,
            snoozedUntil: null,
          };
        });

        // Stop native ringtone + vibration immediately
        // Import inline to avoid circular dep
        import('../lib/alarmNative').then(({ alarmNativeManager }) => {
          alarmNativeManager.dismissAlarm();

          // Schedule next alarm after a short delay
          setTimeout(async () => {
            const state = get();
            if (!state.isAlarmEnabled || !state.profile) return;
            const next = state.getNextAlarmTime();
            if (next) {
              await alarmNativeManager.setAlarm(next, "Time to drink water! 💧");
            }
          }, 500);
        });
      },

      setAlarmRinging: (isAlarmRinging) => set({
        isAlarmRinging,
        // Show overlay when ringing starts; keep current visibility when stopping
        isAlarmUIVisible: isAlarmRinging ? true : get().isAlarmUIVisible,
      }),

      setAlarmUIVisible: (isAlarmUIVisible) => set({ isAlarmUIVisible }),

      snoozeAlarm: () => set({
        isAlarmRinging: false,
        isAlarmUIVisible: false,
        snoozedUntil: Date.now() + 15 * 60 * 1000,
      }),

      setAlarmAmount: (alarmAmount) => set({ alarmAmount }),

      getNextAlarmTime: () => {
        const { profile, getDailyGoal, getTodayIntake, intakeRecords, snoozedUntil, isAlarmEnabled } = get();
        if (!profile || !isAlarmEnabled) return null;

        const goal   = getDailyGoal();
        const intake = getTodayIntake();
        if (intake >= goal) return null;

        const now = new Date();
        const [wakeHour, wakeMin]  = profile.wakeTime.split(':').map(Number);
        const [sleepHour, sleepMin] = profile.sleepTime.split(':').map(Number);

        const wakeTime = new Date(now);
        wakeTime.setHours(wakeHour, wakeMin, 0, 0);

        const sleepTime = new Date(now);
        sleepTime.setHours(sleepHour, sleepMin, 0, 0);
        if (sleepTime <= wakeTime) sleepTime.setDate(sleepTime.getDate() + 1);

        if (now < wakeTime) return wakeTime.getTime();
        if (now > sleepTime) {
          const tomorrowWake = new Date(wakeTime);
          tomorrowWake.setDate(tomorrowWake.getDate() + 1);
          return tomorrowWake.getTime();
        }

        const awakeDuration = sleepTime.getTime() - wakeTime.getTime();
        const drinksNeeded  = Math.ceil(goal / 250);
        const interval      = awakeDuration / drinksNeeded;

        const startOfToday   = startOfDay(now).getTime();
        const todaysRecords  = intakeRecords.filter(r => r.timestamp >= startOfToday);
        const lastIntakeTime = todaysRecords.length > 0
          ? Math.max(...todaysRecords.map(r => r.timestamp))
          : wakeTime.getTime();

        let nextAlarm = lastIntakeTime + interval;

        if (snoozedUntil && snoozedUntil > now.getTime()) {
          nextAlarm = Math.max(nextAlarm, snoozedUntil);
        }
        if (nextAlarm > sleepTime.getTime()) return sleepTime.getTime();

        return nextAlarm;
      },

      getDailyGoal: () => {
        const { profile, weather } = get();
        if (!profile) return 2000;
        let goal = profile.weight * 35;
        if (profile.age < 30) goal += 200;
        if (profile.age > 55) goal -= 200;
        if (profile.gender === 'male') goal += 300;
        if (weather === 'cold')    goal -= 200;
        if (weather === 'hot')     goal += 500;
        if (weather === 'very_hot') goal += 1000;
        if (profile.height > 180) goal += 200;
        return Math.round(goal);
      },

      getTodayIntake: () => {
        const startOfToday = startOfDay(Date.now()).getTime();
        return get().intakeRecords
          .filter(r => r.timestamp >= startOfToday)
          .reduce((sum, r) => sum + r.amount, 0);
      },
    }),
    {
      name: 'water-reminder-storage',
      partialize: (state) => ({
        profile:       state.profile,
        weather:       state.weather,
        theme:         state.theme,
        alarmTune:     state.alarmTune,
        isAlarmEnabled: state.isAlarmEnabled,
        intakeRecords: state.intakeRecords,
        dailyHistory:  state.dailyHistory,
        activeTab:     state.activeTab,
      }),
    }
  )
);
