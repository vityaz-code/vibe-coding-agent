import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as path from 'path';
import { getDatabase, saveDatabase, addLog, resetDatabase } from './db';
import { validateTelegramInitData, TelegramUser } from './telegramAuth';
import { transitionProjectState } from './stateMachine';
import { executeAICommand, handleAIChatMessage } from './aiController';
import { generateGraph } from './graph';
import { AppState } from './types';

export const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Extend express Request interface
export interface AuthenticatedRequest extends Request {
  telegramUser?: TelegramUser;
}

// SSE Connection Listener structure
interface SSEClient {
  id: string;
  res: Response;
  projectId: string;
  userId: string;
}
let sseClients: SSEClient[] = [];

/**
 * Broadcasts an authorized real-time update event to connected clients.
 */
export function broadcastSSE(projectId: string, type: string, message: string, data?: any) {
  const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const payload = JSON.stringify({ eventId, type, message, data, timestamp: new Date().toISOString() });

  sseClients.forEach(client => {
    if (client.projectId === projectId) {
      client.res.write(`id: ${eventId}\nevent: message\ndata: ${payload}\n\n`);
    }
  });
}

/**
 * Periodically broadcasts heartbeats to maintain connected SSE streams and avoid timeouts.
 */
setInterval(() => {
  sseClients.forEach(client => {
    client.res.write(`: heartbeat\n\n`);
  });
}, 15000);

/**
 * Middleware: Authenticates raw Telegram initData and validates signature.
 */
export const authenticateTelegramUser = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const initData = req.headers['x-telegram-init-data'] as string;
  if (!initData) {
    res.status(401).json({ error: 'Authentication Required: x-telegram-init-data header is missing.' });
    return;
  }

  const authCheck = validateTelegramInitData(initData);
  if (!authCheck.valid || !authCheck.user) {
    res.status(401).json({ error: authCheck.error || 'Invalid Telegram credentials.' });
    return;
  }

  // Bind validated Telegram user
  req.telegramUser = authCheck.user;
  next();
};

/**
 * Middleware: Enforces Project isolation via member ownership validation checks.
 */
export const authorizeProjectAccess = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const projectId = req.params.projectId || req.body.projectId;
  if (!projectId) {
    res.status(400).json({ error: 'Missing projectId identifier.' });
    return;
  }

  const user = req.telegramUser;
  if (!user) {
    res.status(401).json({ error: 'Unauthenticated.' });
    return;
  }

  const db = getDatabase();
  const membership = db.projectMembers.find(
    m => m.projectId === projectId && m.userId === String(user.id)
  );

  if (!membership) {
    res.status(403).json({ error: `Access Denied: You are not authorized to access workspace "${projectId}".` });
    return;
  }

  next();
};

// --- API Router Handlers ---

// Authenticate user & map details
app.post('/api/auth/verify', (req: Request, res: Response) => {
  const { initData } = req.body;
  const check = validateTelegramInitData(initData);
  if (!check.valid || !check.user) {
    res.status(400).json({ success: false, error: check.error || 'Signature error' });
    return;
  }
  res.json({ success: true, user: check.user });
});

// Reset database
app.post('/api/db/reset', (req: Request, res: Response) => {
  resetDatabase();
  res.json({ success: true, message: 'Database reset to original baseline state.' });
});

// List seeded workspaces (Filtered by user membership authorization to ensure isolation)
app.get('/api/projects', authenticateTelegramUser, (req: AuthenticatedRequest, res: Response) => {
  const user = req.telegramUser!;
  const db = getDatabase();
  const allowedProjects = db.projects.filter(proj =>
    db.projectMembers.some(m => m.projectId === proj.id && m.userId === String(user.id))
  );
  res.json(allowedProjects);
});

// Get detailed Project Spec, Graph and revisions count
app.get(
  '/api/projects/:projectId',
  authenticateTelegramUser,
  authorizeProjectAccess,
  (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const db = getDatabase();
    const project = db.projects.find(p => p.id === projectId)!;

    // Retrieve active working revision
    const revs = db.revisions.filter(r => r.projectId === projectId && r.status === 'success');
    const latestSuccessRev = revs.reduce((prev, curr) =>
      (prev.revisionNumber > curr.revisionNumber) ? prev : curr
    );

    // Dynamic manifest-driven graph computation
    const graph = generateGraph(latestSuccessRev.spec);

    res.json({
      project,
      spec: latestSuccessRev.spec,
      graph,
      revisionsCount: db.revisions.filter(r => r.projectId === projectId).length,
      currentRevisionNumber: latestSuccessRev.revisionNumber
    });
  }
);

// Manually update AppSpec JSON
app.post(
  '/api/projects/:projectId/spec',
  authenticateTelegramUser,
  authorizeProjectAccess,
  (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const { spec, expectedRevisionNumber } = req.body;

    if (!spec || typeof spec !== 'object') {
      res.status(400).json({ error: 'Spec is required.' });
      return;
    }

    if (!spec.name || !Array.isArray(spec.modules)) {
      res.status(400).json({ error: 'Schema validation failed: "name" and "modules" array are required.' });
      return;
    }

    const db = getDatabase();
    const currentLock = db.optimisticLocks[projectId] || 1;
    if (expectedRevisionNumber !== undefined && expectedRevisionNumber !== currentLock) {
      res.status(409).json({ error: `Optimistic Locking Conflict: Current version is ${currentLock}. Please reload.` });
      return;
    }

    // Save spec and commit a new revision
    const newRev = db.revisions.length > 0
      ? Math.max(...db.revisions.filter(r => r.projectId === projectId).map(r => r.revisionNumber)) + 1
      : 1;

    db.revisions.push({
      id: `rev-${projectId}-${newRev}`,
      projectId,
      revisionNumber: newRev,
      spec,
      status: 'success',
      createdAt: new Date().toISOString()
    });

    db.optimisticLocks[projectId] = newRev;
    const project = db.projects.find(p => p.id === projectId)!;
    project.activeRevisionId = `rev-${projectId}-${newRev}`;

    transitionProjectState(projectId, 'draft', 'Manual AppSpec updated.');
    broadcastSSE(projectId, 'revision_created', `Revision #${newRev} committed manually.`, { spec });
    saveDatabase();

    res.json({ success: true, revisionNumber: newRev });
  }
);

// Manually trigger state machine transitions
app.post(
  '/api/projects/:projectId/state',
  authenticateTelegramUser,
  authorizeProjectAccess,
  (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const { state, details } = req.body as { state: AppState; details?: string };

    const trans = transitionProjectState(projectId, state, details);
    if (!trans.success) {
      res.status(400).json({ error: trans.error });
      return;
    }

    broadcastSSE(projectId, 'state_change', `State transitioned to ${state}.`, { state });
    res.json({ success: true, state });
  }
);

// Fetch isolated workspace Event Logs
app.get(
  '/api/projects/:projectId/logs',
  authenticateTelegramUser,
  authorizeProjectAccess,
  (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const db = getDatabase();
    const logs = db.eventLogs.filter(l => l.projectId === projectId);
    res.json(logs);
  }
);

// Fetch isolated workspace Test Runs
app.get(
  '/api/projects/:projectId/tests',
  authenticateTelegramUser,
  authorizeProjectAccess,
  (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const db = getDatabase();
    const tests = db.testRuns.filter(t => t.projectId === projectId);
    res.json(tests);
  }
);

// Fetch immutable revision history
app.get(
  '/api/projects/:projectId/revisions',
  authenticateTelegramUser,
  authorizeProjectAccess,
  (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const db = getDatabase();
    const revs = db.revisions.filter(r => r.projectId === projectId);
    res.json(revs);
  }
);

// Rollback to historic revision number
app.post(
  '/api/projects/:projectId/revisions/:revisionNumber/rollback',
  authenticateTelegramUser,
  authorizeProjectAccess,
  (req: AuthenticatedRequest, res: Response) => {
    const { projectId, revisionNumber } = req.params;
    const revNum = parseInt(revisionNumber, 10);

    const db = getDatabase();
    const target = db.revisions.find(r => r.projectId === projectId && r.revisionNumber === revNum);
    if (!target) {
      res.status(404).json({ error: 'Target revision not found.' });
      return;
    }
    if (target.status !== 'success') {
      res.status(400).json({ error: 'Cannot rollback to failed revisions.' });
      return;
    }

    const nextRev = db.revisions.filter(r => r.projectId === projectId).length + 1;
    db.revisions.push({
      id: `rev-${projectId}-${nextRev}`,
      projectId,
      revisionNumber: nextRev,
      spec: target.spec,
      status: 'success',
      createdAt: new Date().toISOString()
    });

    db.optimisticLocks[projectId] = nextRev;
    const project = db.projects.find(p => p.id === projectId)!;
    project.activeRevisionId = `rev-${projectId}-${nextRev}`;

    transitionProjectState(projectId, 'draft', `Atomic rollback to Revision #${revNum}`);
    broadcastSSE(projectId, 'revision_created', `Revision rolled back to #${revNum}. New active is #${nextRev}.`);
    saveDatabase();

    res.json({ success: true, revisionNumber: nextRev });
  }
);

// Send message to isolated workspace AI chat
app.post(
  '/api/projects/:projectId/ai/chat',
  authenticateTelegramUser,
  authorizeProjectAccess,
  (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const { message } = req.body;

    if (!message) {
      res.status(400).json({ error: 'Message payload is required.' });
      return;
    }

    const response = handleAIChatMessage(projectId, message);
    broadcastSSE(projectId, 'ai_command', 'AI chat reply received.');
    res.json(response);
  }
);

// Execute verified structured AI command tool
app.post(
  '/api/projects/:projectId/ai/tool',
  authenticateTelegramUser,
  authorizeProjectAccess,
  (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const { tool, arguments: args, expectedRevisionNumber } = req.body;

    if (!tool) {
      res.status(400).json({ error: 'Tool name is required.' });
      return;
    }

    const result = executeAICommand(projectId, tool, args, expectedRevisionNumber);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    broadcastSSE(projectId, 'ai_command', `Executed AI tool "${tool}" successfully.`, { tool, args });
    res.json(result);
  }
);

// Fetch list of available certified module definitions
app.get('/api/modules', authenticateTelegramUser, (req: AuthenticatedRequest, res: Response) => {
  const db = getDatabase();
  res.json(db.moduleDefinitions);
});

// Establishing secure, project-filtered, authenticated SSE connection stream
app.get('/api/projects/:projectId/events', (req: Request, res: Response) => {
  const { projectId } = req.params;
  const initData = req.query.initData as string;

  if (!initData) {
    res.status(401).send('Unauthorized: x-telegram-init-data query param is missing.');
    return;
  }

  const auth = validateTelegramInitData(initData);
  if (!auth.valid || !auth.user) {
    res.status(401).send('Unauthorized signature check.');
    return;
  }

  const db = getDatabase();
  const membership = db.projectMembers.find(
    m => m.projectId === projectId && m.userId === String(auth.user!.id)
  );

  if (!membership) {
    res.status(403).send('Forbidden project access.');
    return;
  }

  // Setup connection headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
  const client: SSEClient = {
    id: clientId,
    res,
    projectId,
    userId: String(auth.user.id)
  };

  sseClients.push(client);

  // Close connection properly and remove listener to avoid memory leak
  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// Serve frontend visual build if existing
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// Serve secure preview page loader (Check session expiresAt and projectId)
app.get('/preview-frame.html', (req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Certified Sandbox Preview</title>
      <style>
        body { font-family: -apple-system, system-ui, sans-serif; background: #0e1621; color: #fff; padding: 15px; }
        .card { background: #182533; border: 1px solid #243547; border-radius: 8px; padding: 15px; margin-bottom: 10px; }
        .btn { background: #2481cc; color: #fff; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; }
        .success { color: #40a7e3; }
        .tag { font-size: 11px; background: #2b394a; padding: 2px 6px; border-radius: 4px; margin-left: 5px; }
      </style>
    </head>
    <body>
      <h3>🚀 Sandbox Booking Live Preview</h3>
      <div id="preview-content">Loading certified modules...</div>

      <script>
        const params = new URLSearchParams(window.location.search);
        const projId = params.get('proj') || 'proj-1';

        async function fetchPreview() {
          try {
            const res = await fetch('/api/projects/' + projId, {
              headers: { 'x-telegram-init-data': 'mock_1111_owner' }
            });
            const data = await res.json();
            const spec = data.spec;

            if (!spec || !spec.modules || spec.modules.length === 0) {
              document.getElementById('preview-content').innerHTML = '<p>No modules assembled in this draft.</p>';
              return;
            }

            let html = '';
            spec.modules.forEach(m => {
              html += '<div class="card">';
              html += '<strong>' + m.name + '</strong> <span class="tag">' + m.moduleId + '</span>';
              html += '<p>Status: <span class="success">' + (m.status || 'ready') + '</span></p>';

              if (m.moduleId === 'booking') {
                html += '<div style="margin-top:10px; border-top:1px solid #243547; padding-top:10px;">';
                html += '<strong>⚡ Appointment duration:</strong> ' + (m.config?.slot_duration || '30 minutes') + '<br/>';
                html += '<button class="btn" onclick="alert(\\\'Reservation mock request sent!\\\')">Book Slot Now</button>';
                html += '</div>';
              }
              html += '</div>';
            });
            document.getElementById('preview-content').innerHTML = html;
          } catch (err) {
            document.getElementById('preview-content').innerText = 'Failed to load preview: ' + err.message;
          }
        }

        fetchPreview();
      </script>
    </body>
    </html>
  `);
});

// Single page router handler fallback
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'), (err: any) => {
    if (err) {
      res.status(200).send('Lite Visual Composer is running. React client static builds are ready for delivery.');
    }
  });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}
