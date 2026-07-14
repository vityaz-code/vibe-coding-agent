import React, { useState, useEffect } from 'react';

interface SpecEditorProps {
  spec: any;
  onSaveSpec: (newSpec: any) => Promise<any>;
}

export const SpecEditor: React.FC<SpecEditorProps> = ({ spec, onSaveSpec }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (spec) {
      setCode(JSON.stringify(spec, null, 2));
    }
  }, [spec]);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const parsed = JSON.parse(code);
      if (!parsed.name || !Array.isArray(parsed.modules)) {
        throw new Error('AppSpec validation failed: "name" string and "modules" array are strictly required.');
      }
      await onSaveSpec(parsed);
    } catch (err: any) {
      setError(err.message || 'JSON Syntax Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        style={{
          width: '100%',
          flex: 1,
          fontFamily: 'monospace',
          fontSize: '11px',
          background: '#0d1117',
          color: '#c9d1d9',
          border: '1px solid #30363d',
          borderRadius: '4px',
          padding: '8px',
          resize: 'none',
          minHeight: '140px'
        }}
      />
      {error && <div style={{ fontSize: '11px', color: '#ef4444' }}>⚠️ {error}</div>}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          background: '#2481cc',
          color: '#fff',
          border: 'none',
          padding: '8px',
          borderRadius: '4px',
          fontWeight: 'bold',
          cursor: saving ? 'default' : 'pointer',
          fontSize: '11px'
        }}
      >
        {saving ? 'Validating & Saving...' : 'Save & Validate Spec'}
      </button>
    </div>
  );
};
