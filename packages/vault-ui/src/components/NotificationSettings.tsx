import { useState } from 'react';
import {
  describeEvent,
  loadPreferences,
  NOTIFICATION_EVENT_TYPES,
  savePreferences,
  type NotificationPreferences,
} from '../notifications';
import { createPushClient } from '../notifications/push-client';

interface NotificationSettingsProps {
  push?: ReturnType<typeof createPushClient>;
}

export default function NotificationSettings({ push = createPushClient() }: NotificationSettingsProps) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(() => loadPreferences());
  const [savedPrefs, setSavedPrefs] = useState<NotificationPreferences>(() => loadPreferences());
  const [permission, setPermission] = useState(() => push.permission());
  const [status, setStatus] = useState<string | null>(null);
  const dirty = JSON.stringify(prefs) !== JSON.stringify(savedPrefs);

  const enablePush = async () => {
    try {
      const result = await push.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        setPrefs(current => ({ ...current, enabled: true }));
        setStatus('Browser permission granted. Save your preferences to keep this change.');
      } else if (result === 'denied') {
        setStatus('Browser notifications are blocked. Allow them in this site’s browser settings, or use the email preference below if email delivery is configured.');
      } else {
        setStatus('This browser does not support push notifications. You can still save other preferences.');
      }
    } catch {
      setStatus('The browser could not request notification permission. Check site permissions and try again.');
    }
  };

  const save = () => {
    if (prefs.emailFallback && !prefs.email.trim()) {
      setStatus('Enter an email address before enabling email fallback.');
      return;
    }
    if (!savePreferences(prefs)) {
      setStatus('Could not save preferences in this browser. Storage may be unavailable or blocked; your changes are still unsaved.');
      return;
    }
    setSavedPrefs({ ...prefs, types: { ...prefs.types } });
    setStatus('Preferences saved on this browser.');
  };

  return (
    <section className="max-w-xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-6" aria-labelledby="notification-settings-heading">
      <h2 id="notification-settings-heading" className="text-2xl font-semibold text-gray-900 mb-2">
        Notifications
      </h2>
      <p className="text-base text-gray-700 mb-6">
        Choose how NeuroWealth tells you about deposits, withdrawals, rebalances, yield, and security events.
      </p>

      <div className="flex flex-col gap-3 mb-6">
        <button
          type="button"
          onClick={enablePush}
          disabled={permission === 'unsupported' || permission === 'denied'}
          className="w-full py-3 rounded-lg bg-primary-700 text-white font-semibold hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
        >
          {permission === 'granted' ? 'Browser notifications enabled' : permission === 'unsupported' ? 'Browser notifications unsupported' : permission === 'denied' ? 'Notifications blocked in browser settings' : 'Enable browser notifications'}
        </button>
        <p className="text-sm text-gray-700" aria-live="polite">
          {permission === 'denied'
            ? 'To enable push, change this site’s notification permission in your browser settings.'
            : permission === 'unsupported'
              ? 'Use a supported browser to enable push. Other preferences can still be saved.'
              : `Browser permission: ${permission}`}
        </p>
      </div>

      <fieldset className="mb-6">
        <legend className="text-sm font-medium text-gray-900 mb-2">Event types</legend>
        <ul className="space-y-3">
          {NOTIFICATION_EVENT_TYPES.map(type => {
            const copy = describeEvent(type);
            const id = `notify-${type}`;
            return (
              <li key={type}>
                <label htmlFor={id} className="flex items-start gap-3 text-gray-900">
                  <input
                    id={id}
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={prefs.types[type]}
                    onChange={e =>
                      setPrefs(current => ({
                        ...current,
                        types: { ...current.types, [type]: e.target.checked },
                      }))
                    }
                  />
                  <span>
                    <span className="block font-medium">{copy.label}</span>
                    <span className="block text-sm text-gray-700">{copy.description}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset className="mb-6">
        <legend className="text-sm font-medium text-gray-900 mb-2">Email fallback preference</legend>
        <label htmlFor="email-fallback" className="flex items-center gap-3 text-gray-900 mb-3">
          <input
            id="email-fallback"
            type="checkbox"
            className="h-4 w-4"
            checked={prefs.emailFallback}
            onChange={e => setPrefs(current => ({ ...current, emailFallback: e.target.checked }))}
          />
          Request email fallback when push is unavailable
        </label>
        <label htmlFor="notify-email" className="block text-sm font-medium text-gray-900 mb-1">
          Email address
        </label>
        <input
          id="notify-email"
          type="email"
          autoComplete="email"
          value={prefs.email}
          onChange={e => setPrefs(current => ({ ...current, email: e.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
          placeholder="you@example.com"
          required={prefs.emailFallback}
        />
        <p className="mt-2 text-sm text-gray-600">
          This saves a preference only; the application must configure an email delivery service before any message can be sent.
        </p>
      </fieldset>

      <label htmlFor="batch-window" className="block text-sm font-medium text-gray-900 mb-1">
        Batch window (seconds)
      </label>
      <input
        id="batch-window"
        type="number"
        min={0}
        step={15}
        value={Math.round(prefs.batchWindowMs / 1000)}
        onChange={e =>
          setPrefs(current => ({
            ...current,
            batchWindowMs: Math.max(0, Number(e.target.value) || 0) * 1000,
          }))
        }
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 mb-4"
      />
      <p className="text-sm text-gray-700 mb-4">
        Events of the same type that arrive inside this window are grouped into one notification. Security alerts are never delayed.
      </p>

      <p className="text-sm text-gray-600 mb-4">
        Preferences are stored on this browser. Unsaved changes are not applied to your account or other devices.
      </p>

      <button
        type="button"
        onClick={save}
        disabled={!dirty}
        className="w-full py-3 rounded-lg bg-primary-700 text-white font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
      >
        {dirty ? 'Save preferences' : 'Preferences saved'}
      </button>

      {status && (
        <p className="text-sm text-gray-900" role="status" aria-live="polite">
          {status}
        </p>
      )}
    </section>
  );
}
