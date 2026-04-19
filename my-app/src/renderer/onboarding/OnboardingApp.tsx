import React, { useState, useEffect, useCallback } from 'react';

interface ChromeProfile {
  directory: string;
  name: string;
  email: string;
  avatarIcon: string;
}

interface CookieImportResult {
  total: number;
  imported: number;
  failed: number;
  skipped: number;
}

declare global {
  interface Window {
    onboardingAPI: {
      detectChromeProfiles: () => Promise<ChromeProfile[]>;
      importChromeProfileCookies: (profileDir: string) => Promise<CookieImportResult>;
      saveApiKey: (key: string) => Promise<void>;
      testApiKey: (key: string) => Promise<{ success: boolean; error?: string }>;
      complete: () => Promise<void>;
    };
  }
}

type Step = 'profile' | 'apikey';

export function OnboardingApp() {
  const [step, setStep] = useState<Step>('profile');
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<CookieImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.onboardingAPI.detectChromeProfiles().then((p) => {
      setProfiles(p);
      setLoadingProfiles(false);
    }).catch((err) => {
      console.error('[onboarding] detectProfiles failed', err);
      setLoadingProfiles(false);
    });
  }, []);

  const handleImportProfile = useCallback(async (profileDir: string) => {
    setImporting(profileDir);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await window.onboardingAPI.importChromeProfileCookies(profileDir);
      setImportResult(result);
      setTimeout(() => setStep('apikey'), 1200);
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(null);
    }
  }, []);

  const handleSkipProfile = useCallback(() => {
    setStep('apikey');
  }, []);

  const handleTestKey = useCallback(async () => {
    if (!apiKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.onboardingAPI.testApiKey(apiKey.trim());
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: (err as Error).message });
    } finally {
      setTesting(false);
    }
  }, [apiKey]);

  const handleComplete = useCallback(async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await window.onboardingAPI.saveApiKey(apiKey.trim());
      await window.onboardingAPI.complete();
    } catch (err) {
      console.error('[onboarding] complete failed', err);
      setSaving(false);
    }
  }, [apiKey]);

  return (
    <div className="onboarding-container">
      <div className="onboarding-drag-region" />

      <div className="onboarding-content">
        <div className="step-indicator">
          <div className={`step-dot ${step === 'profile' ? 'active' : 'done'}`} />
          <div className="step-line" />
          <div className={`step-dot ${step === 'apikey' ? 'active' : ''}`} />
        </div>

        {step === 'profile' && (
          <div className="step-panel">
            <h1 className="step-title">Import Chrome Profile</h1>
            <p className="step-subtitle">
              Import your cookies so agents can browse as you, or start fresh.
            </p>

            {loadingProfiles && (
              <div className="profile-loading">Detecting Chrome profiles...</div>
            )}

            {!loadingProfiles && profiles.length === 0 && (
              <div className="profile-empty">
                <p>No Chrome profiles found.</p>
                <button className="btn btn-primary" onClick={handleSkipProfile}>
                  Continue without import
                </button>
              </div>
            )}

            {!loadingProfiles && profiles.length > 0 && (
              <div className="profile-list">
                {profiles.map((p) => (
                  <button
                    key={p.directory}
                    className="profile-card"
                    onClick={() => handleImportProfile(p.directory)}
                    disabled={importing !== null}
                  >
                    <div className="profile-avatar">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="profile-info">
                      <div className="profile-name">{p.name}</div>
                      {p.email && <div className="profile-email">{p.email}</div>}
                      <div className="profile-dir">{p.directory}</div>
                    </div>
                    {importing === p.directory && (
                      <div className="profile-spinner" />
                    )}
                  </button>
                ))}

                <button
                  className="profile-card profile-card-skip"
                  onClick={handleSkipProfile}
                  disabled={importing !== null}
                >
                  <div className="profile-avatar profile-avatar-skip">+</div>
                  <div className="profile-info">
                    <div className="profile-name">Start fresh</div>
                    <div className="profile-email">No cookie import</div>
                  </div>
                </button>
              </div>
            )}

            {importResult && (
              <div className="import-result import-result-success">
                Imported {importResult.imported.toLocaleString()} cookies
                {importResult.failed > 0 && ` (${importResult.failed} failed)`}
              </div>
            )}

            {importError && (
              <div className="import-result import-result-error">
                {importError}
              </div>
            )}
          </div>
        )}

        {step === 'apikey' && (
          <div className="step-panel">
            <h1 className="step-title">Anthropic API Key</h1>
            <p className="step-subtitle">
              Your key is stored locally in the system keychain.
            </p>

            <div className="apikey-input-wrap">
              <input
                type={showKey ? 'text' : 'password'}
                className="apikey-input"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                spellCheck={false}
                autoFocus
              />
              <button
                className="apikey-toggle"
                onClick={() => setShowKey(!showKey)}
                tabIndex={-1}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="apikey-actions">
              <button
                className="btn btn-secondary"
                onClick={handleTestKey}
                disabled={!apiKey.trim() || testing}
              >
                {testing ? 'Testing...' : 'Test Key'}
              </button>

              <button
                className="btn btn-primary"
                onClick={handleComplete}
                disabled={!apiKey.trim() || saving}
              >
                {saving ? 'Saving...' : 'Get Started'}
              </button>
            </div>

            {testResult && (
              <div className={`test-result ${testResult.success ? 'test-result-success' : 'test-result-error'}`}>
                {testResult.success ? 'Key is valid' : testResult.error || 'Invalid key'}
              </div>
            )}

            <button className="back-btn" onClick={() => setStep('profile')}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
