package ug.drais.mobile;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import java.util.regex.Pattern;

/**
 * Makes the phone's status bar and navigation bar follow the web app's colours.
 *
 * The web app calls window.DraisNative.setBars(topHex, bottomHex) with the colour it is
 * actually painting at the top and bottom edges of the page (see MobileStatusBarSync.tsx).
 * Icon contrast (light/dark) is derived here from the colour's luminance.
 *
 * Android 15+ (target SDK 35+) forces edge-to-edge: the bars are transparent and the
 * setStatusBarColor APIs do nothing, so there we inset the content by the bar sizes and
 * paint the window background behind the bars instead. Older versions use the colour APIs.
 */
public class MainActivity extends BridgeActivity {

    /** Same as the loading page background, so launch -> loading page -> app has no colour jump. */
    private static final int DEFAULT_COLOR = 0xFF0F172A;
    private static final Pattern HEX = Pattern.compile("^#[0-9a-fA-F]{6}$");

    private final BarsBackground barsBackground = new BarsBackground();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.getDecorView().setBackground(barsBackground);
        applyBars(DEFAULT_COLOR, DEFAULT_COLOR);

        final View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            barsBackground.setInsets(bars.top, bars.bottom);
            if (Build.VERSION.SDK_INT >= 35) {
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            }
            return insets;
        });

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new BarsBridge(), "DraisNative");
        }
    }

    private void applyBars(int top, int bottom) {
        Window window = getWindow();
        barsBackground.setColors(top, bottom);
        if (Build.VERSION.SDK_INT < 35) {
            window.setStatusBarColor(top);
            window.setNavigationBarColor(bottom);
        }
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(isLight(top));
        controller.setAppearanceLightNavigationBars(isLight(bottom));
    }

    /** True when the colour is light enough that dark icons are needed on top of it. */
    private static boolean isLight(int color) {
        double lum = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255.0;
        return lum > 0.6;
    }

    /** Exposed to the page as window.DraisNative. Only accepts strict #RRGGBB values. */
    public class BarsBridge {
        @JavascriptInterface
        public void setBars(String topHex, String bottomHex) {
            if (topHex == null || bottomHex == null || !HEX.matcher(topHex).matches() || !HEX.matcher(bottomHex).matches()) return;
            final int top = Color.parseColor(topHex);
            final int bottom = Color.parseColor(bottomHex);
            runOnUiThread(() -> applyBars(top, bottom));
        }
    }

    /** Window background: top colour behind the status bar, bottom colour behind the nav bar. */
    private static class BarsBackground extends Drawable {
        private final Paint paint = new Paint();
        private int top = DEFAULT_COLOR;
        private int bottom = DEFAULT_COLOR;
        private int topInset = 0;
        private int bottomInset = 0;

        void setColors(int t, int b) { top = t; bottom = b; invalidateSelf(); }
        void setInsets(int t, int b) { topInset = t; bottomInset = b; invalidateSelf(); }

        @Override
        public void draw(@NonNull Canvas canvas) {
            int w = getBounds().width();
            int h = getBounds().height();
            paint.setColor(bottom);
            canvas.drawRect(0, 0, w, h, paint);
            paint.setColor(top);
            canvas.drawRect(0, 0, w, topInset, paint);
        }

        @Override public void setAlpha(int alpha) { }
        @Override public void setColorFilter(@Nullable ColorFilter colorFilter) { }
        @Override public int getOpacity() { return PixelFormat.OPAQUE; }
    }
}
