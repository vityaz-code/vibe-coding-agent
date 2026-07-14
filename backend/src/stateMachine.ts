import { AppState, Project, AppSpec, ProjectRevision } from './types';
import { getDatabase, saveDatabase, addLog } from './db';

const ALLOWED_TRANSITIONS: Record<AppState, AppState[]> = {
  draft: ['questions_required', 'validating', 'failed'],
  questions_required: ['draft', 'validating', 'failed'],
  validating: ['resolving', 'failed'],
  resolving: ['assembling', 'failed'],
  assembling: ['testing', 'failed'],
  testing: ['preview_ready', 'failed'],
  failed: ['draft', 'questions_required', 'validating'],
  preview_ready: ['approved', 'failed'],
  approved: ['deployed', 'draft', 'failed'],
  deployed: ['draft', 'failed']
};

/**
 * Executes a state transition for a project, enforcing the finite state machine.
 */
export function transitionProjectState(
  projectId: string,
  targetState: AppState,
  details?: string
): { success: boolean; error?: string } {
  const db = getDatabase();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) {
    return { success: false, error: `Project ${projectId} not found.` };
  }

  const current = project.state;
  if (current === targetState) {
    return { success: true }; // Already in this state
  }

  const allowed = ALLOWED_TRANSITIONS[current] || [];
  if (!allowed.includes(targetState)) {
    const errorMsg = `Invalid state transition: ${current} -> ${targetState} is not allowed.`;
    addLog(projectId, 'error', errorMsg);
    return { success: false, error: errorMsg };
  }

  project.state = targetState;
  project.updatedAt = new Date().toISOString();
  addLog(projectId, 'state_change', `State changed: ${current} -> ${targetState}. ${details || ''}`, {
    from: current,
    to: targetState
  });
  saveDatabase();
  return { success: true };
}

/**
 * Commits a new project revision.
 * Enforces Optimistic Locking to serialize concurrent updates.
 */
export function createRevision(
  projectId: string,
  spec: AppSpec,
  status: 'success' | 'failed',
  expectedRevisionNumber?: number,
  error?: string
): { success: boolean; error?: string; revision?: ProjectRevision } {
  const db = getDatabase();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) {
    return { success: false, error: `Project ${projectId} not found.` };
  }

  // Optimistic locking check
  const currentRevisionNumber = db.optimisticLocks[projectId] || 1;
  if (expectedRevisionNumber !== undefined && expectedRevisionNumber !== currentRevisionNumber) {
    const errorMsg = `Optimistic Locking Conflict: Revision number mismatch (Expected: ${expectedRevisionNumber}, Current: ${currentRevisionNumber}). Please reload project state.`;
    addLog(projectId, 'error', errorMsg);
    return { success: false, error: errorMsg };
  }

  // Calculate next revision number
  const nextRevNumber = currentRevisionNumber + 1;

  const newRevision: ProjectRevision = {
    id: `rev-${projectId}-${nextRevNumber}`,
    projectId,
    revisionNumber: nextRevNumber,
    spec: JSON.parse(JSON.stringify(spec)), // Deep clone spec
    status,
    error,
    createdAt: new Date().toISOString()
  };

  db.revisions.push(newRevision);

  if (status === 'success') {
    // Increment lock number and update project active revision
    db.optimisticLocks[projectId] = nextRevNumber;
    project.activeRevisionId = newRevision.id;
    addLog(projectId, 'revision_created', `Revision #${nextRevNumber} committed successfully.`, {
      revisionId: newRevision.id,
      revisionNumber: nextRevNumber
    });
  } else {
    // Failed revision does NOT replace the active working revision
    addLog(projectId, 'revision_created', `Candidate Revision #${nextRevNumber} FAILED validation: ${error || 'Unknown Error'}. Active working revision is untouched.`, {
      revisionId: newRevision.id,
      revisionNumber: nextRevNumber,
      status: 'failed'
    });
  }

  saveDatabase();
  return { success: true, revision: newRevision };
}

/**
 * Performs atomic rollback to an immutable working revision.
 */
export function rollbackToRevision(
  projectId: string,
  targetRevisionNumber: number
): { success: boolean; error?: string; revision?: ProjectRevision } {
  const db = getDatabase();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) {
    return { success: false, error: `Project ${projectId} not found.` };
  }

  const target = db.revisions.find(
    r => r.projectId === projectId && r.revisionNumber === targetRevisionNumber
  );

  if (!target) {
    return { success: false, error: `Revision #${targetRevisionNumber} does not exist.` };
  }

  if (target.status !== 'success') {
    return { success: false, error: `Cannot rollback to failed Revision #${targetRevisionNumber}.` };
  }

  // Atomic operation: commit a new successful revision with target spec
  const currentLock = db.optimisticLocks[projectId] || 1;
  const rollResult = createRevision(projectId, target.spec, 'success', currentLock);

  if (!rollResult.success || !rollResult.revision) {
    return { success: false, error: rollResult.error || 'Failed to rollback revision.' };
  }

  // Reset project state back to draft on rollback
  transitionProjectState(projectId, 'draft', `Atomic rollback applied to Revision #${targetRevisionNumber}`);

  return {
    success: true,
    revision: rollResult.revision
  };
}
