package com.aquaalarm.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Static flag — survives across onNewIntent calls so JS can poll it
    public static volatile boolean alarmTriggered = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(AlarmPlugin.class);
        applyLockscreenFlags();
        checkAlarmIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyLockscreenFlags();
        checkAlarmIntent(intent);
    }

    private void checkAlarmIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("isAlarmTriggered", false)) {
            alarmTriggered = true;
        }
    }

    private void applyLockscreenFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON  |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON  |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }
    }
}
