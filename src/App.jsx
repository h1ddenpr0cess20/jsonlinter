import { useState, useEffect, useRef } from 'react';
import CodeMirror from 'codemirror';
import 'codemirror/addon/lint/json-lint.js';
import 'codemirror/addon/edit/matchbrackets.js';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/theme/material-darker.css';

function App() {
  const [status, setStatus] = useState('Ready. Paste JSON, load a file/URL, or click Sample.');
  const [statusType, setStatusType] = useState(null);
  const [size, setSize] = useState(0);
  const [lines, setLines] = useState(0);
  const [keys, setKeys] = useState('—');
  const [indent, setIndent] = useState(2);
  const [autoValidate, setAutoValidate] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage first, then system preference
    const saved = localStorage.getItem('jsonlint.theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const editorRef = useRef(null);
  const cm = useRef(null);

  useEffect(() => {
    // Initialize CodeMirror
    cm.current = CodeMirror(editorRef.current, {
      value: '{\n  "message": "Hello, World!"\n}',
      mode: { name: 'application/json', json: true },
      theme: isDarkMode ? 'material-darker' : 'eclipse',
      lineNumbers: true,
      lineWrapping: true,
      matchBrackets: true,
      gutters: ['CodeMirror-lint-markers'],
      lint: true,
      extraKeys: {
        'Ctrl-Enter': () => validate(),
        'Cmd-Enter': () => validate(),
        'Ctrl-B': () => formatJson(),
        'Cmd-B': () => formatJson(),
        'Ctrl-M': () => minifyJson(),
        'Cmd-M': () => minifyJson(),
        'Alt-S': () => sortKeys()
      }
    });
    cm.current.setSize('100%', 520);

    // Load saved preferences
    try {
      const savedIndent = localStorage.getItem('jsonlint.indent');
      if (savedIndent) {
        setIndent(parseInt(savedIndent, 10));
        cm.current.setOption('indentUnit', parseInt(savedIndent, 10));
      }
      const savedAuto = localStorage.getItem('jsonlint.autoValidate');
      if (savedAuto !== null) {
        setAutoValidate(savedAuto === 'true');
      }
    } catch {}

    // Initial KPIs update
    updateKpis();

    // Auto-validate (debounced) and KPIs update
    let t;
    cm.current.on('change', () => {
      updateKpis();
      clearTimeout(t);
      t = setTimeout(() => {
        if (autoValidate) {
          const ok = validate();
          if (ok) setStatus('Looks good ✓');
        }
      }, 400);
    });

    // Cleanup
    return () => {
      if (cm.current) {
        // Clean up CodeMirror instance
        cm.current = null;
      }
    };
  }, []);

  const updateKpis = () => {
    const text = cm.current.getValue();
    setSize(new Blob([text]).size);
    setLines(cm.current.lineCount());
    try {
      const obj = JSON.parse(text);
      const keysCount = Array.isArray(obj) 
        ? obj.length 
        : (typeof obj === 'object' && obj ? Object.keys(obj).length : 0);
      setKeys(keysCount);
    } catch {
      setKeys('—');
    }
  };

  const extractLineCol = (errMsg) => {
    let line = null, col = null;
    const lineMatch = errMsg.match(/line\s+(\d+)/i);
    if (lineMatch) line = Number(lineMatch[1]) - 1;
    const colMatch = errMsg.match(/column\s+(\d+)/i);
    if (colMatch) col = Number(colMatch[1]) - 1;
    return { line, col };
  };

  const scrollToError = (line, ch) => {
    cm.current.scrollIntoView({ line, ch }, 100);
    cm.current.setCursor({ line, ch });
    cm.current.focus();
  };

  const validate = () => {
    const text = cm.current.getValue().trim();
    if (!text) {
      setStatus('Please enter JSON.');
      setStatusType('danger');
      return false;
    }
    try {
      // Use jsonlint from global scope (loaded via CDN)
      window.jsonlint.parse(text);
      setStatus('Valid JSON ✓');
      setStatusType('success');
      return true;
    } catch (e) {
      const { line, col } = extractLineCol(e.message);
      setStatus('Invalid JSON: ' + e.message);
      setStatusType('danger');
      if (line !== null) scrollToError(line, col || 0);
      return false;
    }
  };

  const formatJson = () => {
    const text = cm.current.getValue();
    try {
      const obj = window.jsonlint.parse(text);
      const pretty = JSON.stringify(obj, null, indent);
      cm.current.setValue(pretty);
      setStatus(`Formatted with ${indent} spaces.`);
      setStatusType('success');
      updateKpis();
    } catch (e) {
      validate();
    }
  };

  const minifyJson = () => {
    const text = cm.current.getValue();
    try {
      const obj = window.jsonlint.parse(text);
      const minified = JSON.stringify(obj);
      cm.current.setValue(minified);
      setStatus('Minified JSON.');
      setStatusType('success');
      updateKpis();
    } catch (e) {
      validate();
    }
  };

  const sortKeysDeep = (value) => {
    if (Array.isArray(value)) {
      return value.map(sortKeysDeep);
    } else if (value && typeof value === 'object') {
      const sorted = {};
      Object.keys(value)
        .sort((a, b) => a.localeCompare(b))
        .forEach(k => {
          sorted[k] = sortKeysDeep(value[k]);
        });
      return sorted;
    }
    return value;
  };

  const sortKeys = () => {
    const text = cm.current.getValue();
    try {
      const obj = window.jsonlint.parse(text);
      const sorted = sortKeysDeep(obj);
      cm.current.setValue(JSON.stringify(sorted, null, 2));
      setStatus('Sorted keys recursively.');
      setStatusType('success');
      updateKpis();
    } catch (e) {
      validate();
    }
  };

  const copyToClipboard = () => {
    const text = cm.current.getValue();
    navigator.clipboard.writeText(text)
      .then(() => {
        setStatus('Copied to clipboard.');
        setStatusType('success');
      })
      .catch(() => {
        setStatus('Unable to copy to clipboard.');
        setStatusType('danger');
      });
  };

  const clearEditor = () => {
    cm.current.setValue('');
    setStatus('Cleared.');
    setStatusType(null);
    updateKpis();
  };

  const sample = () => {
    const example = {
      name: "JSON Linter",
      url: "https://example.com/",
      features: ["validate", "format", "minify", "lint"],
      nested: { a: 1, b: true, c: null }
    };
    cm.current.setValue(JSON.stringify(example, null, 2));
    setStatus('Loaded sample JSON.');
    setStatusType('success');
    updateKpis();
    cm.current.focus();
  };

  const download = () => {
    const text = cm.current.getValue();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded data.json');
    setStatusType('success');
  };

  const loadUrl = async () => {
    const url = prompt('Enter a JSON URL (https://...)');
    if (!url) return;
    setStatus(`Fetching ${url} ...`);
    setStatusType(null);
    try {
      const resp = await fetch(url, { 
        headers: { 'Accept': 'application/json,*/*;q=0.9' } 
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const obj = await resp.json();
        cm.current.setValue(JSON.stringify(obj, null, 2));
        setStatus('Loaded and formatted JSON from URL.');
        setStatusType('success');
      } else {
        const text = await resp.text();
        try {
          const obj = JSON.parse(text);
          cm.current.setValue(JSON.stringify(obj, null, 2));
          setStatus('Loaded and formatted JSON from URL.');
          setStatusType('success');
        } catch {
          cm.current.setValue(text);
          setStatus('Loaded response (not strictly valid JSON).');
          setStatusType('danger');
        }
      }
      updateKpis();
    } catch (e) {
      setStatus(`Failed to fetch: ${e.message || e}`);
      setStatusType('danger');
    }
  };

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      cm.current.setValue(String(reader.result));
      setStatus(`Loaded file: ${file.name}`);
      setStatusType('success');
      updateKpis();
    };
    reader.onerror = () => {
      setStatus('Failed to read file.');
      setStatusType('danger');
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('dropZone').style.background = 'rgba(2,132,199,0.08)';
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('dropZone').style.background = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('dropZone').style.background = '';
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  useEffect(() => {
    localStorage.setItem('jsonlint.indent', indent);
    if (cm.current) {
      cm.current.setOption('indentUnit', indent);
    }
  }, [indent]);

  useEffect(() => {
    localStorage.setItem('jsonlint.autoValidate', autoValidate);
  }, [autoValidate]);

  // Effect to handle theme changes
  useEffect(() => {
    // Save theme preference
    localStorage.setItem('jsonlint.theme', isDarkMode ? 'dark' : 'light');
    
    // Update document data attribute for CSS
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    
    // Update CodeMirror theme if editor is initialized
    if (cm.current) {
      cm.current.setOption('theme', isDarkMode ? 'material-darker' : 'eclipse');
    }
  }, [isDarkMode]);

  return (
    <>
      <header>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div className="brand">
            <span aria-hidden="true" style={{ fontWeight: '800', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas', fontSize: '20px' }}>{'{' + ' }'}</span>
            <span>JSON Linter</span>
            <span className="subtitle">Validator • Formatter • Minifier</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="hint">Client-side only • No data leaves your browser</div>
            <button 
              onClick={toggleTheme}
              style={{ 
                background: 'none', 
                border: 'none', 
                cursor: 'pointer', 
                fontSize: '18px',
                padding: '4px 8px',
                borderRadius: '4px',
                color: 'var(--text)'
              }}
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>

      <main>
        <div className="container">
          <div className="toolbar">
            <button className="primary" onClick={validate}>Validate</button>
            <button onClick={formatJson}>Format</button>
            <button onClick={minifyJson}>Minify</button>
            <button onClick={sortKeys}>Sort Keys</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '8px' }}>
              <label htmlFor="indentSelect" className="hint" style={{ fontSize: '12px' }}>Indent</label>
              <select 
                id="indentSelect" 
                value={indent}
                onChange={(e) => setIndent(parseInt(e.target.value, 10))}
              >
                <option value="2">2</option>
                <option value="4">4</option>
                <option value="8">8</option>
              </select>
              <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <input 
                  type="checkbox" 
                  checked={autoValidate} 
                  onChange={(e) => setAutoValidate(e.target.checked)} 
                />
                Auto Validate
              </label>
            </div>
            <div className="spacer"></div>
            <label className="file-label">
              Load File
              <input 
                id="fileInput" 
                type="file" 
                accept=".json,application/json" 
                style={{ display: 'none' }} 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }} 
              />
            </label>
            <button onClick={loadUrl}>Load URL</button>
            <button onClick={sample}>Sample</button>
            <button onClick={copyToClipboard}>Copy</button>
            <button onClick={clearEditor}>Clear</button>
            <button onClick={download}>Download</button>
          </div>

          <div className="grid">
            <div className="panel">
              <div className="panel-header">JSON Editor</div>
              <div ref={editorRef} id="editor" aria-label="JSON editor"></div>
              <div className="panel-body">
                <div 
                  className="drop-zone" 
                  id="dropZone"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  Drag & drop a .json file here
                </div>
                <div className="kpis">
                  <div className="kpi" id="kpiSize">Size: {size} B</div>
                  <div className="kpi" id="kpiLines">Lines: {lines}</div>
                  <div className="kpi" id="kpiKeys">Keys: {keys}</div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">Status</div>
              <div className="panel-body">
                <div id="status" className={statusType}>{status}</div>
                <div className="footer-note">Errors show with line/column and are highlighted in the editor.</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export default App;
