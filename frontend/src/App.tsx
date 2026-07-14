import { useState, useEffect, useCallback } from 'react';
import { DesktopLayout } from './components/DesktopLayout';
import { MobileLayout } from './components/MobileLayout';
import { GraphView } from './components/GraphView';
import { LivePreview } from './components/LivePreview';
import { AITab } from './components/AITab';
import { SpecEditor } from './components/SpecEditor';
import { FunctionsTab, TestsTab, LogsTab, RevisionsTab } from './components/Tabs';

function App() {
  const [initData, setInitData] = useState('mock_1111_owner');
  const [projectList, setProjectList] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState('proj-1');
  const [projectDetails, setProjectDetails] = useState<any>(null);
  const [modulesCatalog, setModulesCatalog] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [activeBottomTab, setActiveBottomTab] = useState('AI Workspace');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.initData) {
        setInitData(tg.initData);
      }
    }
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadProjectData = useCallback((id: string) => {
    const headers = { 'x-telegram-init-data': initData, 'Content-Type': 'application/json' };

    fetch(`/api/projects/${id}`, { headers })
      .then(r => {
        if (!r.ok) throw new Error('Unauthorized');
        return r.json();
      })
      .then(data => {
        setProjectDetails(data);
      })
      .catch(() => {
        // Handle rejection or switch project cleanly
      });

    fetch(`/api/projects/${id}/logs`, { headers })
      .then(r => r.ok && r.json())
      .then(data => {
        if (Array.isArray(data)) setLogs(data);
      });

    fetch(`/api/projects/${id}/tests`, { headers })
      .then(r => r.ok && r.json())
      .then(data => {
        if (Array.isArray(data)) setTests(data);
      });

    fetch(`/api/projects/${id}/revisions`, { headers })
      .then(r => r.ok && r.json())
      .then(data => {
        if (Array.isArray(data)) setRevisions(data);
      });
  }, [initData]);

  useEffect(() => {
    const headers = { 'x-telegram-init-data': initData, 'Content-Type': 'application/json' };

    fetch('/api/projects', { headers })
      .then(r => r.ok && r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setProjectList(data);
          if (data.length > 0) {
            setActiveProjectId(data[0].id);
          }
        }
      });

    fetch('/api/modules', { headers })
      .then(r => r.ok && r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setModulesCatalog(data);
        }
      });
  }, [initData]);

  useEffect(() => {
    if (activeProjectId) {
      loadProjectData(activeProjectId);

      // SSE filtered subscription
      const eventSource = new EventSource(`/api/projects/${activeProjectId}/events?initData=${encodeURIComponent(initData)}`);
      eventSource.onmessage = () => {
        loadProjectData(activeProjectId);
      };

      return () => {
        eventSource.close();
      };
    }
  }, [activeProjectId, loadProjectData, initData]);

  const handleSendChatMessage = async (message: string) => {
    const headers = { 'x-telegram-init-data': initData, 'Content-Type': 'application/json' };
    const res = await fetch(`/api/projects/${activeProjectId}/ai/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message })
    });
    return res.json();
  };

  const handleExecuteTool = async (tool: string, args: any) => {
    const headers = { 'x-telegram-init-data': initData, 'Content-Type': 'application/json' };
    const res = await fetch(`/api/projects/${activeProjectId}/ai/tool`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tool,
        arguments: args,
        expectedRevisionNumber: projectDetails?.currentRevisionNumber
      })
    });
    const data = await res.json();
    loadProjectData(activeProjectId);
    return data;
  };

  const handleSaveSpec = async (newSpec: any) => {
    const headers = { 'x-telegram-init-data': initData, 'Content-Type': 'application/json' };
    const res = await fetch(`/api/projects/${activeProjectId}/spec`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        spec: newSpec,
        expectedRevisionNumber: projectDetails?.currentRevisionNumber
      })
    });
    const data = await res.json();
    loadProjectData(activeProjectId);
    return data;
  };

  const handleAddModule = async (moduleId: string) => {
    await handleExecuteTool('addModule', { moduleId });
  };

  const handleRunTests = async () => {
    await handleExecuteTool('runTests', {});
  };

  const handleRollback = async (revNum: number) => {
    const headers = { 'x-telegram-init-data': initData, 'Content-Type': 'application/json' };
    await fetch(`/api/projects/${activeProjectId}/revisions/${revNum}/rollback`, {
      method: 'POST',
      headers
    });
    loadProjectData(activeProjectId);
  };

  const handleApprovalToggle = async () => {
    const currentMode = projectDetails?.spec?.approvalMode || 'manual';
    const nextMode = currentMode === 'manual' ? 'auto' : 'manual';
    const updatedSpec = {
      ...projectDetails.spec,
      approvalMode: nextMode
    };
    await handleSaveSpec(updatedSpec);
  };

  const handleResetDB = async () => {
    if (window.confirm('Reset database to clean seeded workspaces?')) {
      await fetch('/api/db/reset', { method: 'POST' });
      loadProjectData(activeProjectId);
    }
  };

  const renderAIWorkspace = () => (
    <AITab
      projectId={activeProjectId}
      onSendChatMessage={handleSendChatMessage}
      onExecuteTool={handleExecuteTool}
    />
  );

  const renderSpecEditor = () => (
    <SpecEditor
      spec={projectDetails?.spec}
      onSaveSpec={handleSaveSpec}
    />
  );

  const renderGraph = () => (
    <GraphView graph={projectDetails?.graph} />
  );

  const renderLivePreview = () => (
    <LivePreview projectId={activeProjectId} />
  );

  const renderFunctionsTab = () => (
    <FunctionsTab graph={projectDetails?.graph} />
  );

  const renderTestsTab = () => (
    <TestsTab tests={tests} onRunTests={handleRunTests} />
  );

  const renderLogsTab = () => (
    <LogsTab logs={logs} />
  );

  const renderRevisionsTab = () => (
    <RevisionsTab revisions={revisions} onRollback={handleRollback} />
  );

  if (!projectDetails) {
    return (
      <div style={{ padding: '20px', background: '#0e1621', color: '#fff', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <strong>Authenticating and establishing workspace session...</strong>
      </div>
    );
  }

  if (isMobile) {
    return (
      <MobileLayout
        currentProject={projectDetails?.project}
        projectList={projectList}
        onProjectChange={setActiveProjectId}
        renderAIWorkspace={renderAIWorkspace}
        renderSpecEditor={renderSpecEditor}
        renderGraph={renderGraph}
        renderLivePreview={renderLivePreview}
        renderTestsTab={renderTestsTab}
        renderLogsTab={renderLogsTab}
        onResetDB={handleResetDB}
      />
    );
  }

  return (
    <DesktopLayout
      currentProject={projectDetails?.project}
      projectList={projectList}
      onProjectChange={setActiveProjectId}
      modulesCatalog={modulesCatalog}
      spec={projectDetails?.spec}
      graph={projectDetails?.graph}
      logs={logs}
      tests={tests}
      revisions={revisions}
      activeBottomTab={activeBottomTab}
      setActiveBottomTab={setActiveBottomTab}
      renderAIWorkspace={renderAIWorkspace}
      renderSpecEditor={renderSpecEditor}
      renderGraph={renderGraph}
      renderLivePreview={renderLivePreview}
      renderFunctionsTab={renderFunctionsTab}
      renderTestsTab={renderTestsTab}
      renderLogsTab={renderLogsTab}
      renderRevisionsTab={renderRevisionsTab}
      onAddModule={handleAddModule}
      onApprovalToggle={handleApprovalToggle}
      onResetDB={handleResetDB}
    />
  );
}

export default App;
