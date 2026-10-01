export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  message: string;
  nodeId?: string;
  edgeId?: string;
  portId?: string;
}

export function errorDiag(message: string, at: Omit<Diagnostic, 'severity' | 'message'> = {}): Diagnostic {
  return { severity: 'error', message, ...at };
}

export function warnDiag(message: string, at: Omit<Diagnostic, 'severity' | 'message'> = {}): Diagnostic {
  return { severity: 'warning', message, ...at };
}
