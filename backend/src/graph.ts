import { AppSpec, ModuleInstance, ModuleConnection, FunctionNode, FunctionConnection } from './types';

// Strict, generic manifest contract interface for certified modules
interface ModuleContract {
  id: string;
  apis: string[];
  eventsEmitted: string[];
  eventsConsumed: string[];
  workflows: string[];
  adapters: string[];
}

export const MODULE_CONTRACTS: Record<string, ModuleContract> = {
  auth: {
    id: 'auth',
    apis: ['POST /api/auth/login', 'POST /api/auth/logout'],
    eventsEmitted: ['auth.user.logged_in'],
    eventsConsumed: [],
    workflows: ['UserSessionRefreshWorkflow'],
    adapters: []
  },
  users: {
    id: 'users',
    apis: ['GET /api/users/profile', 'PUT /api/users/profile'],
    eventsEmitted: ['users.profile.updated'],
    eventsConsumed: ['auth.user.logged_in'],
    workflows: [],
    adapters: ['DbUserStoreAdapter']
  },
  roles: {
    id: 'roles',
    apis: ['POST /api/roles/assign'],
    eventsEmitted: ['roles.assigned'],
    eventsConsumed: [],
    workflows: [],
    adapters: []
  },
  permissions: {
    id: 'permissions',
    apis: ['GET /api/permissions/list'],
    eventsEmitted: [],
    eventsConsumed: ['roles.assigned'],
    workflows: [],
    adapters: ['RouteGuardAdapter']
  },
  'CRUD resource': {
    id: 'CRUD resource',
    apis: ['GET /api/resources', 'POST /api/resources', 'DELETE /api/resources'],
    eventsEmitted: ['resource.created', 'resource.deleted'],
    eventsConsumed: [],
    workflows: [],
    adapters: ['DynamicEntityAdapter']
  },
  files: {
    id: 'files',
    apis: ['POST /api/files/upload'],
    eventsEmitted: ['file.uploaded'],
    eventsConsumed: [],
    workflows: [],
    adapters: ['S3StorageAdapter']
  },
  notifications: {
    id: 'notifications',
    apis: [],
    eventsEmitted: [],
    eventsConsumed: ['*'],
    workflows: ['SendEmailWorkflow', 'SendSmsWorkflow'],
    adapters: ['SmtpAdapter', 'TwilioAdapter']
  },
  audit: {
    id: 'audit',
    apis: ['GET /api/audit/logs'],
    eventsEmitted: [],
    eventsConsumed: ['*'],
    workflows: [],
    adapters: ['AuditStoreAdapter']
  },
  dashboard: {
    id: 'dashboard',
    apis: ['GET /api/dashboard/stats'],
    eventsEmitted: [],
    eventsConsumed: [],
    workflows: [],
    adapters: ['AnalyticsAdapter']
  },
  booking: {
    id: 'booking',
    apis: ['GET /api/booking/slots', 'POST /api/booking/reserve'],
    eventsEmitted: ['booking.reserved', 'booking.cancelled'],
    eventsConsumed: [],
    workflows: ['BookingConfirmationWorkflow'],
    adapters: ['CalendarLockAdapter']
  }
};

export interface GeneratedGraph {
  modules: ModuleInstance[];
  moduleConnections: ModuleConnection[];
  functions: FunctionNode[];
  functionConnections: FunctionConnection[];
}

/**
 * Mechanically computes the full module relations and service function node graphs based
 * purely on the declared Module Instances configurations, capacities, events, workflows, and contracts.
 * Guaranteed to be purely deterministic.
 */
export function generateGraph(spec: AppSpec): GeneratedGraph {
  const modules = spec.modules || [];
  const moduleConnections = spec.moduleConnections || [];

  const functions: FunctionNode[] = [];
  const functionConnections: FunctionConnection[] = [];

  // 1. Generate Function Nodes from each installed Module Instance using the Contract Manifesto
  modules.forEach(instance => {
    const contract = MODULE_CONTRACTS[instance.moduleId];
    if (!contract) return;

    const instanceStatus = instance.status || 'ready';

    // Map APIs to FunctionNodes
    contract.apis.forEach(api => {
      functions.push({
        id: `fn-api-${instance.id}-${api.replace(/\s+/g, '-').replace(/\//g, '_')}`,
        name: `${instance.name}: ${api}`,
        type: 'api',
        status: instanceStatus,
        moduleId: instance.id
      });
    });

    // Map Emitted events to FunctionNodes
    contract.eventsEmitted.forEach(evt => {
      functions.push({
        id: `fn-event-emit-${instance.id}-${evt}`,
        name: `${instance.name} Emits: ${evt}`,
        type: 'event',
        status: instanceStatus,
        moduleId: instance.id
      });
    });

    // Map Workflows to FunctionNodes
    contract.workflows.forEach(wf => {
      functions.push({
        id: `fn-wf-${instance.id}-${wf}`,
        name: `${instance.name} Workflow: ${wf}`,
        type: 'workflow',
        status: instanceStatus,
        moduleId: instance.id
      });
    });

    // Map Adapters to FunctionNodes
    contract.adapters.forEach(ad => {
      functions.push({
        id: `fn-ad-${instance.id}-${ad}`,
        name: `${instance.name} Adapter: ${ad}`,
        type: 'adapter',
        status: instanceStatus,
        moduleId: instance.id
      });
    });
  });

  // 2. Generate connections automatically based on Event Emitter -> Consumer matches,
  // or explicitly defined Module Connections.
  modules.forEach(sourceInstance => {
    const srcContract = MODULE_CONTRACTS[sourceInstance.moduleId];
    if (!srcContract) return;

    modules.forEach(targetInstance => {
      if (sourceInstance.id === targetInstance.id) return;

      const tgtContract = MODULE_CONTRACTS[targetInstance.moduleId];
      if (!tgtContract) return;

      // Match event emissions to event consumption
      const overlaps = srcContract.eventsEmitted.some(evt =>
        tgtContract.eventsConsumed.includes(evt) || tgtContract.eventsConsumed.includes('*')
      );

      if (overlaps) {
        // Find first api or event in source and target to link
        const srcNode = functions.find(f => f.moduleId === sourceInstance.id);
        const tgtNode = functions.find(f => f.moduleId === targetInstance.id);

        if (srcNode && tgtNode) {
          functionConnections.push({
            id: `fconn-event-${srcNode.id}-${tgtNode.id}`,
            sourceFunctionId: srcNode.id,
            targetFunctionId: tgtNode.id,
            type: 'event_trigger'
          });
        }
      }
    });
  });

  // Also bridge connections based on custom explicit user module connections
  moduleConnections.forEach(mc => {
    const srcNode = functions.find(f => f.moduleId === mc.sourceInstanceId);
    const tgtNode = functions.find(f => f.moduleId === mc.targetInstanceId);

    if (srcNode && tgtNode) {
      functionConnections.push({
        id: `fconn-explicit-${mc.id}`,
        sourceFunctionId: srcNode.id,
        targetFunctionId: tgtNode.id,
        type: 'explicit_link'
      });
    }
  });

  return {
    modules,
    moduleConnections,
    functions,
    functionConnections
  };
}
