import { useEffect, useRef, useState } from 'react';

import { useAppStore } from '../store/appStore';

export function EnvSelector() {
  const environments = useAppStore(state => state.environments);
  const activeEnvironment = useAppStore(state => state.activeEnvironment);
  const setActiveEnvironment = useAppStore(state => state.setActiveEnvironment);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = (env: string) => {
    if (activeEnvironment.includes(env)) {
      setActiveEnvironment(activeEnvironment.filter(e => e !== env));
    } else {
      setActiveEnvironment([...activeEnvironment, env]);
    }
  };

  const label =
    activeEnvironment.length === 0
      ? 'No environment'
      : activeEnvironment.join(', ');

  return (
    <div className="env-selector" ref={containerRef}>
      <span className="env-label">ENV</span>
      <button
        className={`env-select-btn${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={label}
        type="button"
      >
        <span className="env-select-btn-label">{label}</span>
        <span className="env-select-btn-chevron">{open ? '▴' : '▾'}</span>
      </button>

      {open && environments.length > 0 && (
        <div className="env-dropdown">
          {environments.map(env => {
            const checked = activeEnvironment.includes(env);
            return (
              <label key={env} className={`env-option${checked ? ' checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(env)}
                />
                <span>{env}</span>
              </label>
            );
          })}
        </div>
      )}

      {open && environments.length === 0 && (
        <div className="env-dropdown env-dropdown-empty">
          No environments found
        </div>
      )}
    </div>
  );
}
