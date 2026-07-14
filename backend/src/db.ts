import {
  Project,
  ProjectMember,
  ModuleDefinition,
  ProjectRevision,
  AIWorkspace,
  TestRun,
  PreviewSession,
  ProjectEventLog,
  AppSpec
} from './types';
import * as fs from 'fs';
import * as path from 'path';

const DB_FILE = path.join('/tmp', 'lite_composer_db.json');

export interface DatabaseSchema {
  projects: Project[];
  projectMembers: ProjectMember[];
  moduleDefinitions: ModuleDefinition[];
  revisions: ProjectRevision[];
  aiWorkspaces: Record<string, AIWorkspace>; // projectId -> workspace
  testRuns: TestRun[];
  previewSessions: PreviewSession[];
  eventLogs: ProjectEventLog[];
  userSessions: Record<string, { userId: string; username: string }>;
  optimisticLocks: Record<string, number>; // projectId -> current revision number
}

let db: DatabaseSchema = {
  projects: [],
  projectMembers: [],
  moduleDefinitions: [],
  revisions: [],
  aiWorkspaces: {},
  testRuns: [],
  previewSessions: [],
  eventLogs: [],
  userSessions: {},
  optimisticLocks: {}
};

export const INITIAL_MODULES: ModuleDefinition[] = [
  {
    id: 'auth',
    name: 'Authentication',
    description: 'Handles user signup, login, and JWT session validation.',
    certified: true,
    capabilities: ['identity', 'jwt'],
    requirements: []
  },
  {
    id: 'users',
    name: 'User Directory',
    description: 'Maintains user profile databases and state details.',
    certified: true,
    capabilities: ['profiles'],
    requirements: ['identity']
  },
  {
    id: 'roles',
    name: 'Roles Management',
    description: 'Enables user role hierarchies and assignments.',
    certified: true,
    capabilities: ['rbac-roles'],
    requirements: ['profiles']
  },
  {
    id: 'permissions',
    name: 'Permissions Guard',
    description: 'Enforces permissions per route and resource.',
    certified: true,
    capabilities: ['rbac-perms'],
    requirements: ['rbac-roles']
  },
  {
    id: 'CRUD resource',
    name: 'CRUD Generator',
    description: 'Generates standard relational DB entities dynamically.',
    certified: true,
    capabilities: ['crud'],
    requirements: ['identity']
  },
  {
    id: 'files',
    name: 'File Storage',
    description: 'Allows secure, authenticated binary asset uploading.',
    certified: true,
    capabilities: ['storage'],
    requirements: ['identity']
  },
  {
    id: 'notifications',
    name: 'Notification Hub',
    description: 'Sends push, SMS, and email alerts automatically.',
    certified: true,
    capabilities: ['sms', 'email'],
    requirements: []
  },
  {
    id: 'audit',
    name: 'Audit Logger',
    description: 'Tracks every state-changing event chronologically.',
    certified: true,
    capabilities: ['compliance'],
    requirements: []
  },
  {
    id: 'dashboard',
    name: 'Analytics Dashboard',
    description: 'Displays system health, charts, and table exports.',
    certified: true,
    capabilities: ['metrics'],
    requirements: []
  },
  {
    id: 'booking',
    name: 'Booking Scheduler',
    description: 'Powers calendar locks, time-slots, and reservations.',
    certified: true,
    capabilities: ['scheduler'],
    requirements: ['identity', 'sms']
  }
];

export function loadDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      db = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse db.json, starting fresh', e);
      resetDatabase();
    }
  } else {
    resetDatabase();
  }
}

export function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write db.json', e);
  }
}

export function resetDatabase() {
  db = {
    projects: [],
    projectMembers: [],
    moduleDefinitions: INITIAL_MODULES,
    revisions: [],
    aiWorkspaces: {},
    testRuns: [],
    previewSessions: [],
    eventLogs: [],
    userSessions: {},
    optimisticLocks: {}
  };

  // Seed 5 isolated project workspaces
  for (let i = 1; i <= 5; i++) {
    const pId = `proj-${i}`;
    db.projects.push({
      id: pId,
      name: `Project Workspace ${i}`,
      description: `Isolated software composition workspace for Project ${i}.`,
      state: 'draft',
      activeRevisionId: `rev-${pId}-1`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Setup Membership:
    // user_1 (id: 1111) has access to projects 1, 2, 3
    // user_2 (id: 2222) has access to projects 4, 5
    if (i <= 3) {
      db.projectMembers.push({
        id: `pm-${pId}-1111`,
        projectId: pId,
        userId: '1111',
        role: 'owner'
      });
    } else {
      db.projectMembers.push({
        id: `pm-${pId}-2222`,
        projectId: pId,
        userId: '2222',
        role: 'owner'
      });
    }

    const initialSpec: AppSpec = {
      name: `Project Workspace ${i}`,
      version: '1.0.0',
      description: `Initial application specification for Project ${i}.`,
      modules: [],
      moduleConnections: [],
      functions: [],
      functionConnections: [],
      approvalMode: 'manual',
      questionnaireAnswers: {}
    };

    db.revisions.push({
      id: `rev-${pId}-1`,
      projectId: pId,
      revisionNumber: 1,
      spec: initialSpec,
      status: 'success',
      createdAt: new Date().toISOString()
    });

    db.optimisticLocks[pId] = 1;

    db.aiWorkspaces[pId] = {
      projectId: pId,
      conversationHistory: [
        {
          role: 'system',
          content: `You are the Project Assistant for workspace ${pId}. Enforcing strict isolation context.`
        }
      ],
      allowedTools: [
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
      ]
    };

    db.eventLogs.push({
      id: `ev-init-${pId}`,
      projectId: pId,
      type: 'state_change',
      message: 'Workspace initiated in draft state.',
      createdAt: new Date().toISOString()
    });
  }

  saveDatabase();
}

export function getDatabase(): DatabaseSchema {
  return db;
}

export function addLog(projectId: string, type: string, message: string, data?: any): ProjectEventLog {
  const log: ProjectEventLog = {
    id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    projectId,
    type,
    message,
    data,
    createdAt: new Date().toISOString()
  };
  db.eventLogs.push(log);
  saveDatabase();
  return log;
}

// Initial seeding
loadDatabase();
