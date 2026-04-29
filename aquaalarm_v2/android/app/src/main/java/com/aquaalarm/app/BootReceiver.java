package com.aquaalarm.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) return;

        SharedPreferences prefs = context.getSharedPreferences("AquaAlarmPrefs", Context.MODE_PRIVATE);
        long nextAlarm = prefs.getLong("nextAlarmTimestamp", 0);
        String message  = prefs.getString("nextAlarmMessage", "Time to drink water! 💧");

        if (nextAlarm <= System.currentTimeMillis()) return; // Already passed

        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent alarmIntent = new Intent(context, AlarmReceiver.class);
        alarmIntent.putExtra("message", message);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getBroadcast(context, 1001, alarmIntent, flags);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextAlarm, pi);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, nextAlarm, pi);
        }
    }
}
