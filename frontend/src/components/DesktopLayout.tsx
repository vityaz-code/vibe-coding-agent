import React from 'react';

interface DesktopLayoutProps {
  currentProject: any;
  projectList: any[];
  onProjectChange: (projId: string) => void;
  modulesCatalog: any[];
  spec: any;
  graph: any;
  logs?: any[];
  tests?: any[];
  revisions?: any[];
  activeBottomTab: string;
  setActiveBottomTab: (tab: string) => void;
  renderAIWorkspace: () => React.ReactNode;
  renderSpecEditor: () => React.ReactNode;
  renderGraph: () => React.ReactNode;
  renderLivePreview: () => React.ReactNode;
  renderFunctionsTab: () => React.ReactNode;
  renderTestsTab: () => React.ReactNode;
  renderLogsTab: () => React.ReactNode;
  renderRevisionsTab: () => React.ReactNode;
  onAddModule: (modId: string) => void;
  onApprovalToggle: () => void;
  onResetDB: () => void;
}

export const DesktopLayout: React.FC<DesktopLayoutProps> = ({
  currentProject,
  projectList,
  onProjectChange,
  modulesCatalog,
  spec,
  activeBottomTab,
  setActiveBottomTab,
  renderAIWorkspace,
  renderSpecEditor,
  renderGraph,
  renderLivePreview,
  renderFunctionsTab,
  renderTestsTab,
  renderLogsTab,
  renderRevisionsTab,
  onAddModule,
  onApprovalToggle,
  onResetDB
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0e1621' }}>
      {/* Top Project Switcher Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', background: '#17212b', borderBottom: '1px solid #243547' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <strong style={{ fontSize: '18px', color: '#2481cc' }}>Universal Backend Builder</strong>
          <select
            value={currentProject?.id || ''}
            onChange={(e) => onProjectChange(e.target.value)}
            style={{ background: '#24303f', color: '#fff', border: '1px solid #3d4d63', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
          >
            {projectList.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span style={{ fontSize: '12px', background: '#223246', color: '#708499', padding: '4px 8px', borderRadius: '12px' }}>
            State: <strong style={{ color: '#10b981' }}>{currentProject?.state}</strong>
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onApprovalToggle}
            style={{ background: spec?.approvalMode === 'auto' ? '#10b981' : '#f59e0b', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
          >
            Mode: {spec?.approvalMode === 'auto' ? 'Auto-Approve' : 'Manual Approval'}
          </button>
          <button
            onClick={onResetDB}
            style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
          >
            Reset Database
          </button>
        </div>
      </div>

      {/* Main Panel Content Split */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Module Catalog Column */}
        <div style={{ width: '250px', background: '#17212b', borderRight: '1px solid #243547', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '15px', borderBottom: '1px solid #243547' }}>
            <h4 style={{ margin: 0, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#708499' }}>Certified Modules</h4>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {modulesCatalog.map(m => {
              const installed = spec?.modules?.some((sm: any) => sm.moduleId === m.id);
              return (
                <div
                  key={m.id}
                  style={{ background: '#202b36', border: '1px solid #2c3c4e', borderRadius: '6px', padding: '12px', marginBottom: '10px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '13px' }}>{m.name}</strong>
                    <span style={{ fontSize: '10px', background: '#2481cc', color: '#fff', padding: '1px 5px', borderRadius: '3px' }}>Cert</span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#708499', margin: '6px 0' }}>{m.description}</p>
                  <button
                    disabled={installed}
                    onClick={() => onAddModule(m.id)}
                    style={{
                      width: '100%',
                      background: installed ? '#2c3c4e' : '#2481cc',
                      color: installed ? '#708499' : '#fff',
                      border: 'none',
                      padding: '5px',
                      borderRadius: '4px',
                      cursor: installed ? 'default' : 'pointer',
                      fontSize: '11px'
                    }}
                  >
                    {installed ? 'Added' : 'Add to Workspace'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center Graph Workspace & Spec Editor Container */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #243547' }}>
          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
            {/* Visual Node Graph view */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0e1621' }}>
              <div style={{ padding: '10px 15px', background: '#101921', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #243547' }}>
                <span style={{ fontSize: '13px', color: '#708499', fontWeight: 'bold' }}>WORKSPACE NODE RELATION GRAPHS</span>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '15px' }}>
                {renderGraph()}
              </div>
            </div>
          </div>

          {/* Bottom Tabs Section (AI Workspace, Functions, Revisions, Tests, Logs) */}
          <div style={{ height: '320px', background: '#17212b', borderTop: '1px solid #243547', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', background: '#101921', borderBottom: '1px solid #243547' }}>
              {['AI Workspace', 'AppSpec JSON', 'Functions', 'Tests', 'Logs', 'Revisions'].map(t => (
                <button
                  key={t}
                  onClick={() => setActiveBottomTab(t)}
                  style={{
                    padding: '10px 20px',
                    background: 'none',
                    border: 'none',
                    color: activeBottomTab === t ? '#2481cc' : '#708499',
                    borderBottom: activeBottomTab === t ? '2px solid #2481cc' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
              {activeBottomTab === 'AI Workspace' && renderAIWorkspace()}
              {activeBottomTab === 'AppSpec JSON' && renderSpecEditor()}
              {activeBottomTab === 'Functions' && renderFunctionsTab()}
              {activeBottomTab === 'Tests' && renderTestsTab()}
              {activeBottomTab === 'Logs' && renderLogsTab()}
              {activeBottomTab === 'Revisions' && renderRevisionsTab()}
            </div>
          </div>
        </div>

        {/* Right Iframe Interactive Live Preview Column */}
        <div style={{ width: '320px', background: '#17212b', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '15px', borderBottom: '1px solid #243547', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#708499' }}>Live Sandbox Preview</h4>
          </div>
          <div style={{ flex: 1, padding: '10px' }}>
            {renderLivePreview()}
          </div>
        </div>
      </div>
    </div>
  );
};
