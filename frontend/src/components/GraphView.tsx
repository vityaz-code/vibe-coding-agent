import React from 'react';

interface GraphViewProps {
  graph: {
    modules: any[];
    moduleConnections: any[];
    functions: any[];
    functionConnections: any[];
  } | null;
}

export const GraphView: React.FC<GraphViewProps> = ({ graph }) => {
  if (!graph) {
    return <div style={{ color: '#708499', textAlign: 'center', padding: '20px' }}>No graph data computed yet.</div>;
  }

  const { modules = [], functions = [] } = graph;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return '#10b981';
      case 'validating': return '#3b82f6';
      case 'testing': return '#8b5cf6';
      case 'incomplete': return '#f59e0b';
      case 'failed': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Modules Block */}
      <div>
        <h5 style={{ margin: '0 0 10px 0', color: '#2481cc', fontSize: '13px' }}>Module Graph (High-level Architecture)</h5>
        {modules.length === 0 ? (
          <div style={{ border: '1px dashed #243547', borderRadius: '6px', padding: '15px', color: '#708499', textAlign: 'center' }}>
            No modules added. Add modules from catalog or instruct AI composer.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
            {modules.map((m: any) => (
              <div
                key={m.id}
                style={{
                  background: '#182533',
                  border: `1px solid ${getStatusColor(m.status)}`,
                  borderRadius: '6px',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <strong style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</strong>
                <span style={{ fontSize: '10px', color: '#708499' }}>ID: {m.id}</span>
                <span style={{
                  fontSize: '9px',
                  background: getStatusColor(m.status) + '22',
                  color: getStatusColor(m.status),
                  padding: '2px 6px',
                  borderRadius: '4px',
                  alignSelf: 'start',
                  fontWeight: 'bold'
                }}>
                  {m.status || 'ready'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Function Pipeline Block */}
      <div>
        <h5 style={{ margin: '0 0 10px 0', color: '#2481cc', fontSize: '13px' }}>Function Graph (Low-level Services & API Endpoints)</h5>
        {functions.length === 0 ? (
          <div style={{ border: '1px dashed #243547', borderRadius: '6px', padding: '15px', color: '#708499', textAlign: 'center' }}>
            No service functions compiled yet. Validate/Assemble project to compile.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
            {functions.map((f: any) => (
              <div
                key={f.id}
                style={{
                  background: '#222d3b',
                  border: `1px solid ${getStatusColor(f.status)}`,
                  borderRadius: '6px',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</strong>
                  <span style={{ fontSize: '9px', background: '#2481cc33', color: '#2481cc', padding: '1px 4px', borderRadius: '3px' }}>
                    {f.type}
                  </span>
                </div>
                <span style={{ fontSize: '9px', color: '#708499' }}>Target: {f.id}</span>
                <span style={{
                  fontSize: '8px',
                  color: getStatusColor(f.status),
                  fontWeight: 'bold'
                }}>
                  ● {f.status || 'ready'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
