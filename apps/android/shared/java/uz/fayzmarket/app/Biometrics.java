package uz.fayzmarket.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Fingerprint unlock for the app session. The session token is encrypted with an AES key that lives in the
 * Android Keystore and can only be used after a successful BiometricPrompt (Android 9+). No biometric data is
 * ever seen by the app; enrolling a new fingerprint invalidates the key, which falls back to password login.
 */
final class Biometrics {
  interface Result { void done(boolean ok, String value); }
  private static final String ALIAS = "fayz_session_key", PREFS = "fayz_biometric";
  private final Activity activity;
  Biometrics(Activity activity) { this.activity = activity; }

  String status() {
    if (Build.VERSION.SDK_INT < 28) return "unsupported";
    try {
      if (Build.VERSION.SDK_INT >= 30) {
        int r = activity.getSystemService(BiometricManager.class).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        return r == BiometricManager.BIOMETRIC_SUCCESS ? "available" : r == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ? "none" : "unsupported";
      }
      if (Build.VERSION.SDK_INT >= 29) {
        @SuppressWarnings("deprecation") int r = activity.getSystemService(BiometricManager.class).canAuthenticate();
        return r == BiometricManager.BIOMETRIC_SUCCESS ? "available" : r == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ? "none" : "unsupported";
      }
      @SuppressWarnings("deprecation") android.hardware.fingerprint.FingerprintManager fp = activity.getSystemService(android.hardware.fingerprint.FingerprintManager.class);
      if (fp == null || !fp.isHardwareDetected()) return "unsupported";
      return fp.hasEnrolledFingerprints() ? "available" : "none";
    } catch (Exception e) { return "unsupported"; }
  }

  private SharedPreferences prefs() { return activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
  boolean stored() { return prefs().contains("ct"); }

  void disable() {
    prefs().edit().clear().apply();
    try { KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null); ks.deleteEntry(ALIAS); } catch (Exception ignored) { }
  }

  private SecretKey newKey() throws Exception {
    KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null); ks.deleteEntry(ALIAS);
    KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setUserAuthenticationRequired(true).setInvalidatedByBiometricEnrollment(true);
    if (Build.VERSION.SDK_INT >= 30) spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
    KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    generator.init(spec.build());
    return generator.generateKey();
  }
  private SecretKey existingKey() throws Exception { KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null); return (SecretKey) ks.getKey(ALIAS, null); }

  void enable(String secret, Result result) {
    if (!"available".equals(status())) { result.done(false, "unavailable"); return; }
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, newKey());
      prompt("Barmoq izi bilan kirishni yoqish", cipher, c -> {
        byte[] ct = c.doFinal(secret.getBytes(StandardCharsets.UTF_8));
        prefs().edit().putString("iv", Base64.encodeToString(c.getIV(), Base64.NO_WRAP)).putString("ct", Base64.encodeToString(ct, Base64.NO_WRAP)).apply();
        return "enabled";
      }, result);
    } catch (Exception e) { result.done(false, "error"); }
  }

  void unlock(Result result) {
    if (!stored()) { result.done(false, "empty"); return; }
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, existingKey(), new GCMParameterSpec(128, Base64.decode(prefs().getString("iv", ""), Base64.NO_WRAP)));
      prompt("Fayz Market’ni ochish", cipher, c -> new String(c.doFinal(Base64.decode(prefs().getString("ct", ""), Base64.NO_WRAP)), StandardCharsets.UTF_8), result);
    } catch (KeyPermanentlyInvalidatedException e) { disable(); result.done(false, "invalidated"); }
    catch (Exception e) { result.done(false, "error"); }
  }

  private interface Step { String run(Cipher cipher) throws Exception; }
  private void prompt(String title, Cipher cipher, Step step, Result result) {
    BiometricPrompt prompt = new BiometricPrompt.Builder(activity).setTitle(title).setSubtitle("Barmoq izingizni tasdiqlang")
      .setNegativeButton("Bekor qilish", activity.getMainExecutor(), (d, w) -> result.done(false, "cancelled")).build();
    prompt.authenticate(new BiometricPrompt.CryptoObject(cipher), new CancellationSignal(), activity.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
      @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult auth) {
        try { result.done(true, step.run(auth.getCryptoObject().getCipher())); } catch (Exception e) { result.done(false, "error"); }
      }
      @Override public void onAuthenticationError(int code, CharSequence message) { result.done(false, code == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED || code == BiometricPrompt.BIOMETRIC_ERROR_CANCELED ? "cancelled" : "error"); }
    });
  }
}
