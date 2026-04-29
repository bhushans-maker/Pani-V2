package com.aquaalarm.app;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.WindowManager;
import androidx.core.app.NotificationCompat;

/**
 * WaterAlarmService — the ONLY reliable way to fire an alarm on Android 13+
 * when the app is killed. This service:
 *   1. Starts as a ForegroundService (cannot be killed)
 *   2. Acquires a FULL_WAKE_LOCK to wake the screen
 *   3. Plays the alarm ringtone via MediaPlayer (not WebAudio)
 *   4. Vibrates continuously
 *   5. Shows a full-screen notification / heads-up notification
 *   6. Keeps ringing until the user logs water (DISMISS_ALARM intent)
 */
public class WaterAlarmService extends Service {

    public static final String ACTION_DISMISS = "com.aquaalarm.app.DISMISS_ALARM";
    private static final String CHANNEL_ID  = "aquaalarm_fg_v2";
    private static final int    NOTIF_ID    = 3001;

    private MediaPlayer   mediaPlayer;
    private Vibrator      vibrator;
    private PowerManager.WakeLock wakeLock;

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {

        // Dismiss action — stop everything
        if (intent != null && ACTION_DISMISS.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String message = (intent != null) ? intent.getStringExtra("message") : null;
        if (message == null) message = "Time to drink water! 💧";

        acquireWakeLock();
        createNotificationChannel();
        startForeground(NOTIF_ID, buildNotification(message));
        startRingtone();
        startVibration();

        return START_STICKY; // Restart if killed — alarm must not be silenced
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopRingtone();
        stopVibration();
        releaseWakeLock();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // -------------------------------------------------------------------------
    // Wake lock — forces screen ON even from lock screen
    // -------------------------------------------------------------------------

    private void acquireWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(
            PowerManager.FULL_WAKE_LOCK |
            PowerManager.ACQUIRE_CAUSES_WAKEUP |
            PowerManager.ON_AFTER_RELEASE,
            "AquaAlarm::AlarmWakeLock"
        );
        wakeLock.acquire(10 * 60 * 1000L); // max 10 minutes
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            wakeLock = null;
        }
    }

    // -------------------------------------------------------------------------
    // Ringtone via MediaPlayer (works when app is killed, WebAudio does NOT)
    // -------------------------------------------------------------------------

    private void startRingtone() {
        try {
            Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) {
                alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            }
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(this, alarmUri);
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            mediaPlayer.setLooping(true); // KEEP RINGING until dismissed
            mediaPlayer.setVolume(1.0f, 1.0f);
            mediaPlayer.prepare();
            mediaPlayer.start();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void stopRingtone() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
    }

    // -------------------------------------------------------------------------
    // Vibration — repeating pattern until dismissed
    // -------------------------------------------------------------------------

    private void startVibration() {
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long[] pattern = {0, 700, 300, 700, 300, 700, 600};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
        } else {
            vibrator.vibrate(pattern, 0);
        }
    }

    private void stopVibration() {
        if (vibrator != null) {
            vibrator.cancel();
            vibrator = null;
        }
    }

    // -------------------------------------------------------------------------
    // Notification — full-screen intent wakes the screen
    // -------------------------------------------------------------------------

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID, "AquaAlarm Water Alerts", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Water drinking reminders");
        ch.enableVibration(false); // We handle vibration ourselves
        ch.setSound(null, null);   // We handle sound ourselves
        ch.setBypassDnd(true);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    private Notification buildNotification(String message) {
        // Full-screen intent → launches MainActivity
        Intent launch = new Intent(this, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TOP
            | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launch.putExtra("isAlarmTriggered", true);

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

        PendingIntent fullScreenPi = PendingIntent.getActivity(this, 0, launch, piFlags);

        // Dismiss action — stops the service (and ringtone/vibration) without logging
        Intent dismissI = new Intent(this, WaterAlarmService.class);
        dismissI.setAction(ACTION_DISMISS);
        PendingIntent dismissPi = PendingIntent.getService(this, 1, dismissI, piFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("💧 Time to Drink Water!")
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(fullScreenPi, true)
            .setContentIntent(fullScreenPi)
            .setOngoing(true)       // Cannot be swiped away
            .setAutoCancel(false)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Logged Water ✓", dismissPi)
            .build();
    }
}
