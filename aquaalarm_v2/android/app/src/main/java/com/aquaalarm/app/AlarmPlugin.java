package com.aquaalarm.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AlarmPlugin")
public class AlarmPlugin extends Plugin {

    private static final String PREFS = "AquaAlarmPrefs";

    private PendingIntent buildPendingIntent(Context ctx, String message, int code) {
        Intent i = new Intent(ctx, AlarmReceiver.class);
        if (message != null) i.putExtra("message", message);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, code, i, flags);
    }

    @PluginMethod
    public void setAlarm(PluginCall call) {
        Long timestamp = call.getLong("timestamp");
        String message  = call.getString("message", "Time to drink water! 💧");

        if (timestamp == null) { call.reject("timestamp required"); return; }

        Context ctx = getContext();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) { call.reject("AlarmManager unavailable"); return; }

        // Android 12+: request SCHEDULE_EXACT_ALARM permission if needed
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
            Intent si = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                Uri.parse("package:" + ctx.getPackageName()));
            si.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(si);
            call.reject("Exact alarm permission not granted. Please grant it and try again.");
            return;
        }

        // Persist so BootReceiver can re-schedule after reboot
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putLong("nextAlarmTimestamp", timestamp)
            .putString("nextAlarmMessage", message)
            .apply();

        PendingIntent pi = buildPendingIntent(ctx, message, 1001);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestamp, pi);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, timestamp, pi);
        }
        call.resolve();
    }

    @PluginMethod
    public void cancelAlarm(PluginCall call) {
        Context ctx = getContext();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(buildPendingIntent(ctx, null, 1001));

        // Clear persisted alarm
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove("nextAlarmTimestamp").remove("nextAlarmMessage").apply();

        // Stop the service (stops ringtone + vibration)
        Intent si = new Intent(ctx, WaterAlarmService.class);
        si.setAction(WaterAlarmService.ACTION_DISMISS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(si);
        } else {
            ctx.startService(si);
        }
        call.resolve();
    }

    @PluginMethod
    public void dismissAlarm(PluginCall call) {
        // Called from JS when user logs water — stop ringtone/vibration immediately
        Context ctx = getContext();
        Intent si = new Intent(ctx, WaterAlarmService.class);
        si.setAction(WaterAlarmService.ACTION_DISMISS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(si);
        } else {
            ctx.startService(si);
        }
        call.resolve();
    }

    @PluginMethod
    public void getAlarmStatus(PluginCall call) {
        Intent intent = getActivity().getIntent();
        boolean triggered = intent.getBooleanExtra("isAlarmTriggered", false);
        intent.removeExtra("isAlarmTriggered");
        JSObject ret = new JSObject();
        ret.put("isAlarmTriggered", triggered);
        call.resolve(ret);
    }

    @PluginMethod
    public void checkOverlayPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", Build.VERSION.SDK_INT < Build.VERSION_CODES.M
            || Settings.canDrawOverlays(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && !Settings.canDrawOverlays(getContext())) {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void checkBatteryPermission(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            ret.put("granted", pm != null
                && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        } else {
            ret.put("granted", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void requestBatteryPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }
}
