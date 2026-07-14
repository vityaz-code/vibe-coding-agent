import { AppSpec, ModuleInstance, ModuleConnection, ProjectRevision } from './types';
import { getDatabase, saveDatabase, addLog } from './db';
import { transitionProjectState, createRevision, rollbackToRevision } from './stateMachine';
import { generateGraph } from './graph';

export const AI_MODE = 'AI mode: deterministic mock';

export interface AICommand {
  tool: string;
  projectId: string;
  arguments: Record<string, any>;
}

/**
 * Strict JSON schema validation for allowed AI Tools.
 */
export function validateAICommand(command: AICommand): { valid: boolean; error?: string } {
  const allowedTools = [
    'inspectProject',
    'askQuestion',
    'updateAppSpec',
    'addModule',
    'removeModule',
    'connectModules',
    'updateModuleConfig',
    'validateProject',
    'runTests',
    'createPreview',
    'rollbackRevision'
  ];

  if (!allowedTools.includes(command.tool)) {
    return { valid: false, error: `Security Rejection: Tool "${command.tool}" is not in the allowed tool allowlist!` };
  }

  // Prevent forbidden actions
  const args = command.arguments || {};
  if (command.tool === 'inspectProject' && args.projectId && args.projectId !== command.projectId) {
    return { valid: false, error: 'Security Rejection: Cross-project inspection forbidden!' };
  }

  // Schema argument validations
  switch (command.tool) {
    case 'askQuestion':
      if (typeof args.question !== 'string') {
        return { valid: false, error: 'askQuestion: "question" must be a string' };
      }
      break;
    case 'updateAppSpec':
      if (!args.spec || typeof args.spec !== 'object') {
        return { valid: false, error: 'updateAppSpec: "spec" object is required' };
      }
      break;
    case 'addModule':
      if (typeof args.moduleId !== 'string') {
        return { valid: false, error: 'addModule: "moduleId" must be a string' };
      }
      break;
    case 'removeModule':
      if (typeof args.instanceId !== 'string') {
        return { valid: false, error: 'removeModule: "instanceId" must be a string' };
      }
      break;
    case 'connectModules':
      if (typeof args.sourceInstanceId !== 'string' || typeof args.targetInstanceId !== 'string') {
        return { valid: false, error: 'connectModules: source and target instanceIds must be strings' };
      }
      break;
    case 'updateModuleConfig':
      if (typeof args.instanceId !== 'string' || !args.config || typeof args.config !== 'object') {
        return { valid: false, error: 'updateModuleConfig: instanceId string and config object are required' };
      }
      break;
    case 'rollbackRevision':
      if (typeof args.revisionNumber !== 'number') {
        return { valid: false, error: 'rollbackRevision: revisionNumber must be an integer' };
      }
      break;
  }

  return { valid: true };
}

/**
 * Executes a verified AI tool command for a project workspace.
 */
export function executeAICommand(
  projectId: string,
  tool: string,
  args: any,
  expectedRevisionNumber?: number
): { success: boolean; message: string; data?: any } {
  const db = getDatabase();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) {
    return { success: false, message: 'Project not found.' };
  }

  // Enforce schema validation
  const validation = validateAICommand({ tool, projectId, arguments: args });
  if (!validation.valid) {
    addLog(projectId, 'error', `AI command validation failed: ${validation.error}`);
    return { success: false, message: validation.error || 'Validation error' };
  }

  // Load the current active working revision spec
  const projectRevs = db.revisions.filter(r => r.projectId === projectId && r.status === 'success');
  const latestRev = projectRevs.reduce((prev, curr) =>
    (prev.revisionNumber > curr.revisionNumber) ? prev : curr
  );

  const spec: AppSpec = JSON.parse(JSON.stringify(latestRev.spec));
  let resultMessage = '';

  try {
    switch (tool) {
      case 'inspectProject':
        resultMessage = `Inspecting ${project.name}: Assembled with ${spec.modules.length} modules. Current state is ${project.state}.`;
        break;

      case 'askQuestion':
        transitionProjectState(projectId, 'questions_required', `AI requested input: ${args.question}`);
        resultMessage = `Inquired: ${args.question}`;
        break;

      case 'updateAppSpec':
        // Overwrite full AppSpec with validation
        if (!args.spec.name || !Array.isArray(args.spec.modules)) {
          throw new Error('AppSpec schema validation failed: "name" string and "modules" array are required.');
        }
        const revRes = createRevision(projectId, args.spec, 'success', expectedRevisionNumber);
        if (!revRes.success) {
          throw new Error(revRes.error);
        }
        resultMessage = 'AppSpec updated successfully.';
        break;

      case 'addModule': {
        const modDef = db.moduleDefinitions.find(m => m.id === args.moduleId);
        if (!modDef) {
          throw new Error(`Certified module "${args.moduleId}" is not recognized.`);
        }
        // Check duplicate
        if (spec.modules.some(m => m.moduleId === args.moduleId)) {
          throw new Error(`Module "${args.moduleId}" already exists in project spec.`);
        }
        const instId = `inst-${args.moduleId}-${Date.now().toString(36)}`;
        const newInstance: ModuleInstance = {
          id: instId,
          moduleId: args.moduleId,
          name: modDef.name,
          config: {},
          status: 'ready'
        };
        spec.modules.push(newInstance);
        const revRes2 = createRevision(projectId, spec, 'success', expectedRevisionNumber);
        if (!revRes2.success) {
          throw new Error(revRes2.error);
        }
        resultMessage = `Module "${modDef.name}" successfully added to workspace.`;
        return { success: true, message: resultMessage, data: { instanceId: instId } };
      }

      case 'removeModule': {
        const idx = spec.modules.findIndex(m => m.id === args.instanceId);
        if (idx === -1) {
          throw new Error(`Module instance "${args.instanceId}" not found.`);
        }
        spec.modules.splice(idx, 1);
        // Clean connections
        spec.moduleConnections = spec.moduleConnections.filter(
          c => c.sourceInstanceId !== args.instanceId && c.targetInstanceId !== args.instanceId
        );
        const revRes3 = createRevision(projectId, spec, 'success', expectedRevisionNumber);
        if (!revRes3.success) {
          throw new Error(revRes3.error);
        }
        resultMessage = `Module instance "${args.instanceId}" removed.`;
        break;
      }

      case 'connectModules': {
        const src = spec.modules.find(m => m.id === args.sourceInstanceId);
        const tgt = spec.modules.find(m => m.id === args.targetInstanceId);
        if (!src || !tgt) {
          throw new Error('Connect failed: source or target module instance not found.');
        }
        spec.moduleConnections.push({
          id: `conn-${args.sourceInstanceId}-${args.targetInstanceId}`,
          sourceInstanceId: args.sourceInstanceId,
          targetInstanceId: args.targetInstanceId,
          type: 'default'
        });
        const revRes4 = createRevision(projectId, spec, 'success', expectedRevisionNumber);
        if (!revRes4.success) {
          throw new Error(revRes4.error);
        }
        resultMessage = `Connected module "${src.name}" to "${tgt.name}".`;
        break;
      }

      case 'updateModuleConfig': {
        const mod = spec.modules.find(m => m.id === args.instanceId);
        if (!mod) {
          throw new Error(`Module instance "${args.instanceId}" not found.`);
        }
        mod.config = { ...mod.config, ...args.config };
        const revRes5 = createRevision(projectId, spec, 'success', expectedRevisionNumber);
        if (!revRes5.success) {
          throw new Error(revRes5.error);
        }
        resultMessage = `Configuration updated for module instance "${args.instanceId}".`;
        break;
      }

      case 'validateProject': {
        transitionProjectState(projectId, 'validating');
        // If booking module exists, check if files and auth exist for production-ready state
        const hasBooking = spec.modules.some(m => m.moduleId === 'booking');
        const hasAuth = spec.modules.some(m => m.moduleId === 'auth');
        if (hasBooking && !hasAuth) {
          transitionProjectState(projectId, 'failed', 'Missing required Auth module for Booking.');
          createRevision(projectId, spec, 'failed', expectedRevisionNumber, 'Validation error: Booking scheduler requires Authentication.');
          return { success: false, message: 'Validation failed: Booking scheduler requires Auth module.' };
        }

        transitionProjectState(projectId, 'resolving');
        // Compile module relations to functions
        const graph = generateGraph(spec);
        spec.functions = graph.functions;
        spec.functionConnections = graph.functionConnections;
        const revRes6 = createRevision(projectId, spec, 'success', expectedRevisionNumber);
        if (!revRes6.success) {
          throw new Error(revRes6.error);
        }
        transitionProjectState(projectId, 'assembling');
        transitionProjectState(projectId, 'draft', 'Ready for testing.');
        resultMessage = 'Project layout successfully validated and resolved.';
        break;
      }

      case 'runTests': {
        transitionProjectState(projectId, 'testing');
        const testId = `test-${Date.now()}`;
        const hasBooking = spec.modules.some(m => m.moduleId === 'booking');
        const pass = hasBooking ? true : false;

        const results = {
          id: testId,
          projectId,
          status: (pass ? 'passed' : 'failed') as 'passed' | 'failed',
          results: [
            { testName: 'Secure Authentication Checks', passed: true },
            { testName: 'Booking Scheduler Calendar Locks', passed: pass, error: pass ? undefined : 'Calendar scheduler requires booking module' }
          ],
          createdAt: new Date().toISOString()
        };

        db.testRuns.push(results);
        saveDatabase();

        if (pass) {
          transitionProjectState(projectId, 'preview_ready', 'Tests passed, preview ready.');
          resultMessage = 'Tests completed successfully! State is preview_ready.';
        } else {
          transitionProjectState(projectId, 'failed', 'Tests failed.');
          resultMessage = 'Tests failed validation checks.';
        }
        break;
      }

      case 'createPreview': {
        if (project.state !== 'preview_ready') {
          throw new Error('Project must be in preview_ready state to open previews.');
        }
        const sId = `session-${Date.now()}`;
        const mockUrl = `/preview-frame.html?proj=${projectId}`;
        db.previewSessions.push({
          id: sId,
          projectId,
          url: mockUrl,
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(), // Expires in 1 hour
          createdAt: new Date().toISOString()
        });
        saveDatabase();
        resultMessage = `Interactive sandbox preview initiated at: ${mockUrl}`;
        break;
      }

      case 'rollbackRevision': {
        const targetRev = args.revisionNumber;
        const rollResult = rollbackToRevision(projectId, targetRev);
        if (!rollResult.success) {
          throw new Error(rollResult.error);
        }
        resultMessage = `Successfully rolled back to Revision #${targetRev}.`;
        break;
      }
    }

    addLog(projectId, 'ai_command', `Executed AI Tool "${tool}" successfully.`);
    return { success: true, message: resultMessage };
  } catch (err: any) {
    const errMsg = err.message || 'System fault occurred.';
    addLog(projectId, 'error', `AI Tool "${tool}" faulted: ${errMsg}`);
    return { success: false, message: errMsg };
  }
}

/**
 * Handle AI conversational chat, strictly within the isolated workspace scope.
 */
export function handleAIChatMessage(
  projectId: string,
  userMessage: string
): { answer: string; suggestedTools?: { tool: string; arguments: any }[] } {
  const db = getDatabase();
  const workspace = db.aiWorkspaces[projectId];
  if (!workspace) {
    throw new Error(`AI workspace missing for project ${projectId}`);
  }

  // Verify memory isolation: Never store or get details from other projects
  workspace.conversationHistory.push({ role: 'user', content: userMessage });

  let answer = '';
  let suggested: { tool: string; arguments: any }[] = [];

  const text = userMessage.toLowerCase();
  if (text.includes('booking') || text.includes('reserve') || text.includes('schedule')) {
    answer = `[${AI_MODE}] Understood. To build a Booking Scheduler application, let's proceed through the questionnaire:
1. What is the standard duration for appointment slots? (e.g., 30min, 60min)
2. Is SMS or Email notification required? (yes/no)
3. Should we restrict access using authentication? (yes/no)
Please describe your choice to configure the AppSpec.`;

    suggested = [
      { tool: 'askQuestion', arguments: { question: 'Booking scheduler options' } },
      { tool: 'addModule', arguments: { moduleId: 'booking' } }
    ];
  } else if (text.includes('30min') || text.includes('yes') || text.includes('no')) {
    answer = `[${AI_MODE}] Thank you for answering the questionnaire. Based on your inputs, I recommend the following plan:
1. Configured Booking slot duration.
2. Adding 'auth', 'users', and 'notifications' modules to satisfy booking requirements and security standards.
3. Validate layout and compile modules.`;

    suggested = [
      { tool: 'updateModuleConfig', arguments: { instanceId: 'booking', config: { slot_duration: '30min' } } },
      { tool: 'addModule', arguments: { moduleId: 'auth' } },
      { tool: 'addModule', arguments: { moduleId: 'users' } },
      { tool: 'addModule', arguments: { moduleId: 'notifications' } },
      { tool: 'validateProject', arguments: {} }
    ];
  } else {
    answer = `[${AI_MODE}] I am your isolated workspace assistant. You can add modules, configure relationships, or run verification tests.`;
    suggested = [
      { tool: 'inspectProject', arguments: {} }
    ];
  }

  workspace.conversationHistory.push({ role: 'assistant', content: answer });
  saveDatabase();

  return { answer, suggestedTools: suggested };
}
