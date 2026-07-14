import React from 'react';

// --- Functions Tab ---
export const FunctionsTab: React.FC<{ graph: any }> = ({ graph }) => {
  const fns = graph?.functions || [];
  return (
    <div>
      <h5 style={{ margin: '0 0 10px 0', color: '#2481cc' }}>Service Pipelines & Action Handlers</h5>
      {fns.length === 0 ? (
        <p style={{ color: '#708499', fontSize: '12px' }}>Validate your layout configuration to map backend service routines.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #243547', color: '#708499' }}>
              <th style={{ padding: '8px' }}>Function Name</th>
              <th style={{ padding: '8px' }}>Pipeline Type</th>
              <th style={{ padding: '8px' }}>Target Status</th>
            </tr>
          </thead>
          <tbody>
            {fns.map((f: any, idx: number) => (
              <tr key={idx} style={{ borderBottom: '1px solid #1c2a39' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>{f.name}</td>
                <td style={{ padding: '8px' }}><span style={{ color: '#2481cc' }}>{f.type}</span></td>
                <td style={{ padding: '8px', color: '#10b981' }}>● {f.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// --- Tests Tab ---
export const TestsTab: React.FC<{ tests: any[]; onRunTests: () => void }> = ({ tests, onRunTests }) => {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h5 style={{ margin: 0, color: '#2481cc' }}>High-Fidelity Mechanical Tests</h5>
        <button
          onClick={onRunTests}
          style={{ background: '#2481cc', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
        >
          Execute Tests
        </button>
      </div>

      {tests.length === 0 ? (
        <p style={{ color: '#708499', fontSize: '12px' }}>No tests triggered yet. Hit "Execute Tests" or tell AI workspace to verify your application.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tests.map((run: any, idx: number) => (
            <div key={idx} style={{ background: '#1c2733', border: '1px solid #253547', borderRadius: '6px', padding: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#708499', marginBottom: '5px' }}>
                <span>Run ID: {run.id}</span>
                <span style={{ color: run.status === 'passed' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                  {run.status.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {run.results?.map((res: any, rIdx: number) => (
                  <div key={rIdx} style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{res.testName}</span>
                    <span style={{ color: res.passed ? '#10b981' : '#ef4444', marginLeft: '10px' }}>{res.passed ? 'PASS ✓' : 'FAIL ✗'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Logs Tab ---
export const LogsTab: React.FC<{ logs: any[] }> = ({ logs }) => {
  return (
    <div>
      <h5 style={{ margin: '0 0 10px 0', color: '#2481cc' }}>Project isolated real-time event logs</h5>
      <div style={{ background: '#101921', padding: '10px', borderRadius: '6px', border: '1px solid #243547', maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {logs.length === 0 ? (
          <span style={{ color: '#708499', fontSize: '11px' }}>Waiting for logs...</span>
        ) : (
          logs.slice().reverse().map((l: any, idx: number) => (
            <div key={idx} style={{ fontSize: '11px', display: 'flex', gap: '10px' }}>
              <span style={{ color: '#708499' }}>[{new Date(l.createdAt).toLocaleTimeString()}]</span>
              <strong style={{ color: l.type === 'error' ? '#ef4444' : '#40a7e3' }}>{l.type.toUpperCase()}:</strong>
              <span>{l.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// --- Revisions Tab ---
export const RevisionsTab: React.FC<{ revisions: any[]; onRollback: (revNum: number) => void }> = ({ revisions, onRollback }) => {
  return (
    <div>
      <h5 style={{ margin: '0 0 10px 0', color: '#2481cc' }}>Immutable Workspace Revision History</h5>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {revisions.map((r: any) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1c2733', border: '1px solid #253547', borderRadius: '6px', padding: '8px 12px' }}>
            <div>
              <strong style={{ fontSize: '12px' }}>Revision #{r.revisionNumber}</strong>
              <span style={{ fontSize: '10px', color: r.status === 'success' ? '#10b981' : '#ef4444', marginLeft: '10px', fontWeight: 'bold' }}>
                {r.status.toUpperCase()}
              </span>
              <div style={{ fontSize: '10px', color: '#708499', marginTop: '3px' }}>
                Assembled: {new Date(r.createdAt).toLocaleString()}
              </div>
            </div>
            {r.status === 'success' && (
              <button
                onClick={() => onRollback(r.revisionNumber)}
                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
              >
                Rollback here
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
