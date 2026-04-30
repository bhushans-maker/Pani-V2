package com.aquaalarm.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AlarmPlugin")
public class AlarmPlugin extends Plugin {

    private static final String PREFS = "AquaAlarmPrefs";

    // Direct playback — used when app is already open (no service needed)
    private MediaPlayer directPlayer;
    private Vibrator    directVibrator;

    private PendingIntent buildPendingIntent(Context ctx, String message, int code) {
        Intent i = new Intent(ctx, AlarmReceiver.class);
        if (message != null) i.putExtra("message", message);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, code, i, flags);
    }

    // ── setAlarm: schedules native AlarmManager alarm ─────────────────────────
    @PluginMethod
    public void setAlarm(PluginCall call) {
        Long timestamp = call.getLong("timestamp");
        String message = call.getString("message", "Time to drink water! 💧");
        if (timestamp == null) { call.reject("timestamp required"); return; }

        Context ctx = getContext();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) { call.reject("AlarmManager unavailable"); return; }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
            Intent si = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                Uri.parse("package:" + ctx.getPackageName()));
            si.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(si);
            call.reject("Grant exact alarm permission and try again");
            return;
        }

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

    // ── playAlarmNow: called from JS when app is open — plays sound directly ──
    // This bypasses the ForegroundService entirely and plays sound immediately.
    @PluginMethod
    public void playAlarmNow(PluginCall call) {
        Context ctx = getContext();
        stopDirectPlayback(); // stop any previous

        // Max alarm volume
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am != null) {
            am.setStreamVolume(AudioManager.STREAM_ALARM,
                am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
        }

        // Play ringtone
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            directPlayer = new MediaPlayer();
            directPlayer.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setLegacyStreamType(AudioManager.STREAM_ALARM)
                .build());
            directPlayer.setDataSource(ctx, uri);
            directPlayer.setLooping(true);
            directPlayer.setVolume(1.0f, 1.0f);
            directPlayer.prepare();
            directPlayer.start();
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Vibrate
        try {
            long[] pattern = {0, 800, 400, 800, 400, 800, 800};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) directVibrator = vm.getDefaultVibrator();
            } else {
                directVibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (directVibrator != null && directVibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    directVibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    directVibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Also start the service so it persists if app goes to background
        startAlarmService(ctx, call.getString("message", "Time to drink water! 💧"));

        call.resolve();
    }

    // ── cancelAlarm ───────────────────────────────────────────────────────────
    @PluginMethod
    public void cancelAlarm(PluginCall call) {
        Context ctx = getContext();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(buildPendingIntent(ctx, null, 1001));

        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove("nextAlarmTimestamp").remove("nextAlarmMessage").apply();

        stopDirectPlayback();
        stopAlarmService(ctx);
        call.resolve();
    }

    // ── dismissAlarm: stop all sound/vibration ────────────────────────────────
    @PluginMethod
    public void dismissAlarm(PluginCall call) {
        stopDirectPlayback();
        stopAlarmService(getContext());
        MainActivity.alarmTriggered = false;
        call.resolve();
    }

    // ── getAlarmStatus ────────────────────────────────────────────────────────
    @PluginMethod
    public void getAlarmStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isAlarmTriggered", MainActivity.alarmTriggered);
        call.resolve(ret);
    }

    // ── checkOverlayPermission ────────────────────────────────────────────────
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

    // ── checkBatteryPermission ────────────────────────────────────────────────
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

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void stopDirectPlayback() {
        if (directPlayer != null) {
            try {
                if (directPlayer.isPlaying()) directPlayer.stop();
                directPlayer.release();
            } catch (Exception ignored) {}
            directPlayer = null;
        }
        if (directVibrator != null) {
            try { directVibrator.cancel(); } catch (Exception ignored) {}
            directVibrator = null;
        }
    }

    private void startAlarmService(Context ctx, String message) {
        Intent si = new Intent(ctx, WaterAlarmService.class);
        si.putExtra("message", message);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(si);
        } else {
            ctx.startService(si);
        }
    }

    private void stopAlarmService(Context ctx) {
        Intent si = new Intent(ctx, WaterAlarmService.class);
        si.setAction(WaterAlarmService.ACTION_DISMISS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(si);
        } else {
            ctx.startService(si);
        }
    }
}
