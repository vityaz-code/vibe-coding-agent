export type AppState =
  | 'draft'
  | 'questions_required'
  | 'validating'
  | 'resolving'
  | 'assembling'
  | 'testing'
  | 'failed'
  | 'preview_ready'
  | 'approved'
  | 'deployed';

export interface Project {
  id: string;
  name: string;
  description: string;
  state: AppState;
  activeRevisionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: 'owner' | 'developer' | 'viewer';
}

export interface ModuleDefinition {
  id: string; // e.g. 'auth', 'users', 'roles', 'permissions', 'CRUD resource', 'files', 'notifications', 'audit', 'dashboard', 'booking'
  name: string;
  description: string;
  certified: boolean;
  capabilities: string[];
  requirements: string[];
}

export interface ModuleInstance {
  id: string;
  moduleId: string;
  name: string;
  config: Record<string, any>;
  status: 'inactive' | 'incomplete' | 'validating' | 'testing' | 'ready' | 'failed';
}

export interface ModuleConnection {
  id: string;
  sourceInstanceId: string;
  targetInstanceId: string;
  type: string;
}

export interface FunctionNode {
  id: string;
  name: string;
  type: 'service' | 'api' | 'event' | 'workflow' | 'adapter';
  status: 'inactive' | 'incomplete' | 'validating' | 'testing' | 'ready' | 'failed';
  moduleId?: string; // module instance it originates from
}

export interface FunctionConnection {
  id: string;
  sourceFunctionId: string;
  targetFunctionId: string;
  type: string;
}

export interface AppSpec {
  name: string;
  version: string;
  description?: string;
  modules: ModuleInstance[];
  moduleConnections: ModuleConnection[];
  functions: FunctionNode[];
  functionConnections: FunctionConnection[];
  approvalMode: 'manual' | 'auto';
  questionnaireAnswers?: Record<string, string>;
}

export interface ProjectSpec {
  id: string;
  projectId: string;
  spec: AppSpec;
}

export interface ProjectRevision {
  id: string;
  projectId: string;
  revisionNumber: number;
  spec: AppSpec;
  status: 'success' | 'failed';
  error?: string;
  createdAt: string;
}

export interface AIWorkspace {
  projectId: string;
  conversationHistory: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; name?: string }[];
  allowedTools: string[];
}

export interface TestRun {
  id: string;
  projectId: string;
  status: 'passed' | 'failed';
  results: { testName: string; passed: boolean; error?: string }[];
  createdAt: string;
}

export interface PreviewSession {
  id: string;
  projectId: string;
  url: string;
  expiresAt: string;
  createdAt: string;
}

export interface ProjectEventLog {
  id: string;
  projectId: string;
  type: string; // 'state_change' | 'revision_created' | 'test_run' | 'ai_command' | 'error'
  message: string;
  data?: any;
  createdAt: string;
}
