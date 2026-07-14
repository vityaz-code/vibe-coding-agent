import React from 'react';

interface LivePreviewProps {
  projectId: string;
}

export const LivePreview: React.FC<LivePreviewProps> = ({ projectId }) => {
  const iframeSrc = `/preview-frame.html?proj=${projectId}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
      <div style={{ flex: 1, border: '1px solid #243547', borderRadius: '6px', background: '#0e1621', overflow: 'hidden', position: 'relative', minHeight: '300px' }}>
        <iframe
          key={projectId}
          src={iframeSrc}
          sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
          style={{ width: '100%', height: '100%', border: 'none', background: '#0e1621' }}
        />
      </div>
      <div style={{ fontSize: '11px', color: '#708499', display: 'flex', gap: '5px', alignItems: 'center' }}>
        <span>🔒 Sandboxed certified visual components sandbox.</span>
      </div>
    </div>
  );
};
