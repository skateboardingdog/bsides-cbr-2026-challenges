import { useEffect, useState } from 'react';
import * as B from '../core/bitvec';
import { pArr, pBool, pInt, pStr, type Params } from '../core/graph';
import { getKind, type ParamSpec } from '../core/nodeKinds';
import { useStore, valuesVisible } from '../state/store';
import type { PaneId } from '../state/rf';
import s from './Inspector.module.css';

export function NodeInspector({
  paneId,
  nodeId,
  editable,
}: {
  paneId: PaneId;
  nodeId: string;
  editable: boolean;
}): React.ReactElement | null {
  const node = useStore((st) => st.panes[paneId].graph.nodes.find((n) => n.id === nodeId));
  const derived = useStore((st) => st.derived[paneId]);
  const updateParams = useStore((st) => st.updateParams);
  const showOutput = useStore((st) => valuesVisible(st, paneId));

  if (!node) return null;
  const kind = getKind(node.type);
  if (!kind) {
    return (
      <div className={s.panel}>
        <div className={s.problem}>No node type “{node.type}” in the registry.</div>
      </div>
    );
  }

  const set = (key: string, value: Params[string]): void => {
    updateParams(paneId, nodeId, { ...node.params, [key]: value });
  };

  const outputs = derived.evaluation.nodeOutputs.get(nodeId);
  const problems = derived.evaluation.diagnostics.filter((d) => d.nodeId === nodeId);
  const hasTable = kind.params.some((p) => p.kind === 'table');

  return (
    <div className={`${s.panel} ${hasTable ? s.wide : ''}`}>
      <div className={s.kindHeader}>
        <span className={s.kindName}>{node.label ?? kind.label}</span>
        <span className={s.kindType}>{node.id}</span>
      </div>

      {problems.map((p, i) => (
        <div key={i} className={`${s.problem} ${p.severity === 'warning' ? s.warn : ''}`}>
          {p.message}
        </div>
      ))}

      <div className={s.section}>
        {kind.params.length === 0 && <div className={s.placeholder}>This node has no settings.</div>}
        {kind.params.map((spec) => (
          <ParamField key={spec.key} spec={spec} params={node.params} editable={editable} onChange={set} />
        ))}
      </div>

      {showOutput && outputs && Object.keys(outputs).length > 0 && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Current output</div>
          <div className={s.values}>
            {Object.entries(outputs).map(([port, value]) => (
              <div key={port} className={s.valueRow} title={B.toBinGrouped(value)}>
                <span className={s.valuePort}>{port}</span>
                <span className={s.valueHex}>{B.toHex(value)}</span>
                <span className={s.valuePort}>{value.width}b</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ParamField({
  spec,
  params,
  editable,
  onChange,
}: {
  spec: ParamSpec;
  params: Params;
  editable: boolean;
  onChange: (key: string, value: Params[string]) => void;
}): React.ReactElement {
  const id = `param-${spec.key}`;

  if (spec.kind === 'bool') {
    return (
      <div className={s.field}>
        <div className={s.checkRow}>
          <input
            id={id}
            type="checkbox"
            checked={pBool(params, spec.key, spec.default)}
            disabled={!editable}
            onChange={(e) => onChange(spec.key, e.target.checked)}
          />
          <label className={s.label} htmlFor={id}>
            {spec.label}
          </label>
        </div>
        {spec.help && <span className={s.help}>{spec.help}</span>}
      </div>
    );
  }

  if (spec.kind === 'table') {
    return <TableField spec={spec} params={params} editable={editable} onChange={onChange} />;
  }

  if (spec.kind === 'permutation') {
    const perm = pArr(params, spec.key, spec.default);
    return (
      <div className={s.field}>
        <label className={s.label} htmlFor={id}>
          {spec.label} — {perm.length} output bits
        </label>
        <input
          id={id}
          className={s.mono}
          value={perm.join(' ')}
          disabled={!editable}
          onChange={(e) => {
            const next = e.target.value
              .split(/[\s,]+/)
              .filter((t) => t.length > 0)
              .map((t) => Number.parseInt(t, 10))
              .filter((n) => Number.isFinite(n));
            onChange(spec.key, next);
          }}
        />
      </div>
    );
  }

  const common = {
    id,
    disabled: !editable,
  };

  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={id}>
        {spec.label}
      </label>
      {spec.kind === 'int' && (
        <input
          {...common}
          type="number"
          value={pInt(params, spec.key, spec.default)}
          min={spec.min}
          max={spec.max}
          onChange={(e) => onChange(spec.key, Number.parseInt(e.target.value, 10) || 0)}
        />
      )}
      {spec.kind === 'enum' && (
        <select
          {...common}
          value={pStr(params, spec.key, spec.default)}
          onChange={(e) => onChange(spec.key, e.target.value)}
        >
          {spec.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {(spec.kind === 'hex' || spec.kind === 'text') && (
        <input
          {...common}
          className={spec.kind === 'hex' ? s.mono : undefined}
          value={pStr(params, spec.key, spec.default)}
          onChange={(e) => onChange(spec.key, e.target.value)}
        />
      )}
      {spec.help && <span className={s.help}>{spec.help}</span>}
    </div>
  );
}

function TableField({
  spec,
  params,
  editable,
  onChange,
}: {
  spec: Extract<ParamSpec, { kind: 'table' }>;
  params: Params;
  editable: boolean;
  onChange: (key: string, value: Params[string]) => void;
}): React.ReactElement {
  const table = pArr(params, spec.key, spec.default);
  const cellWidth = pInt(params, 'cellWidth', 4);
  const digits = Math.ceil(cellWidth / 4);
  const max = (1 << cellWidth) - 1;

  const [drafts, setDrafts] = useState<Record<number, string>>({});
  useEffect(() => setDrafts({}), [table.length, digits]);

  const commit = (index: number, raw: string): void => {
    if (raw.length !== digits) return;
    const parsed = Number.parseInt(raw, 16);
    if (!Number.isFinite(parsed)) return;
    const next = [...table];
    next[index] = Math.max(0, Math.min(max, parsed));
    onChange(spec.key, next);
  };

  const editCell = (index: number, raw: string): void => {
    const cleaned = raw.toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, digits);
    setDrafts((d) => ({ ...d, [index]: cleaned }));
    commit(index, cleaned);
  };

  const blurCell = (index: number): void => {
    setDrafts((d) => {
      const { [index]: _dropped, ...rest } = d;
      return rest;
    });
  };

  return (
    <div className={s.field}>
      <div className={s.tableGrid}>
        {table.map((v, i) => (
          <div key={i} className={s.tableCell}>
            <span className={s.tableIndex}>{i.toString(16)}</span>
            <input
              value={drafts[i] ?? v.toString(16).padStart(digits, '0')}
              disabled={!editable}
              maxLength={digits}
              onChange={(e) => editCell(i, e.target.value)}
              onBlur={() => blurCell(i)}
            />
          </div>
        ))}
      </div>
      <div className={s.rowActions}>
        <button
          type="button"
          disabled={!editable}
          onClick={() => onChange(spec.key, table.map((_, i) => i))}
        >
          Reset to identity
        </button>
      </div>
    </div>
  );
}

