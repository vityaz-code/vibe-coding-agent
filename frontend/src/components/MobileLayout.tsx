import React, { useState } from 'react';

interface MobileLayoutProps {
  currentProject: any;
  projectList: any[];
  onProjectChange: (projId: string) => void;
  renderAIWorkspace: () => React.ReactNode;
  renderSpecEditor: () => React.ReactNode;
  renderGraph: () => React.ReactNode;
  renderLivePreview: () => React.ReactNode;
  renderTestsTab: () => React.ReactNode;
  renderLogsTab: () => React.ReactNode;
  onResetDB: () => void;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({
  currentProject,
  projectList,
  onProjectChange,
  renderAIWorkspace,
  renderSpecEditor,
  renderGraph,
  renderLivePreview,
  renderTestsTab,
  renderLogsTab,
  onResetDB
}) => {
  const [mobileTab, setMobileTab] = useState<'Builder' | 'Preview' | 'AI' | 'Tests' | 'Logs'>('Builder');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0e1621', color: '#fff' }}>
      {/* Top compact project switcher bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', background: '#17212b', borderBottom: '1px solid #243547' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={currentProject?.id || ''}
            onChange={(e) => onProjectChange(e.target.value)}
            style={{ background: '#24303f', color: '#fff', border: '1px solid #3d4d63', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}
          >
            {projectList.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span style={{ fontSize: '11px', background: '#223246', color: '#708499', padding: '2px 6px', borderRadius: '8px' }}>
            {currentProject?.state}
          </span>
        </div>
        <button
          onClick={onResetDB}
          style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
        >
          Reset
        </button>
      </div>

      {/* Primary Mobile View Content Pane */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', paddingBottom: 'calc(12px + var(--safe-area-bottom))' }}>
        {mobileTab === 'Builder' && (
          <div>
            <h4 style={{ margin: '0 0 10px 0' }}>Visual Module & Function Graph</h4>
            <div style={{ border: '1px solid #243547', borderRadius: '6px', overflow: 'hidden', background: '#101921', marginBottom: '15px' }}>
              {renderGraph()}
            </div>
            <h4 style={{ margin: '0 0 10px 0' }}>AppSpec JSON</h4>
            <div style={{ border: '1px solid #243547', borderRadius: '6px', padding: '10px', background: '#17212b' }}>
              {renderSpecEditor()}
            </div>
          </div>
        )}

        {mobileTab === 'Preview' && (
          <div>
            <h4 style={{ margin: '0 0 10px 0' }}>Live Interactive Preview</h4>
            {renderLivePreview()}
          </div>
        )}

        {mobileTab === 'AI' && (
          <div>
            <h4 style={{ margin: '0 0 10px 0' }}>Project-specific AI Workspace</h4>
            {renderAIWorkspace()}
          </div>
        )}

        {mobileTab === 'Tests' && (
          <div>
            <h4 style={{ margin: '0 0 10px 0' }}>Verification Tests</h4>
            {renderTestsTab()}
          </div>
        )}

        {mobileTab === 'Logs' && (
          <div>
            <h4 style={{ margin: '0 0 10px 0' }}>Event Log History</h4>
            {renderLogsTab()}
          </div>
        )}
      </div>

      {/* Bottom Sticky Mobile Navigation Tabs */}
      <div style={{ display: 'flex', background: '#17212b', borderTop: '1px solid #243547', paddingBottom: 'var(--safe-area-bottom)' }}>
        {(['Builder', 'Preview', 'AI', 'Tests', 'Logs'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            style={{
              flex: 1,
              padding: '12px 0',
              background: 'none',
              border: 'none',
              color: mobileTab === tab ? '#2481cc' : '#708499',
              borderTop: mobileTab === tab ? '2px solid #2481cc' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
              textAlign: 'center'
            }}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
};
