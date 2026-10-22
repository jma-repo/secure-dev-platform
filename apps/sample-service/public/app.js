'use strict';

(() => {
  const byId = (id) => document.getElementById(id);
  const routes = {
    overview: {
      label: 'Overview',
      title: 'Security, made visible.',
      description: 'From commit to delivery, the security signal stays visible. Risks are not hidden, and nothing is declared successful early.'
    },
    'live-demo': {
      label: 'Live demo',
      title: 'A secret. A hard stop.',
      description: 'Synthetic input triggers a real Gitleaks scan. Blocked or passed is decided by the backend result, not by the page.'
    },
    security: {
      label: 'Security report',
      title: 'One gate, stated thresholds.',
      description: 'Every scanner, the threshold that blocks a merge, and whether it actually ran on this machine.'
    },
    'local-ai': {
      label: 'Local AI',
      title: 'Your documents. Your machine.',
      description: 'Local vector retrieval plus a local model. Questions and documents never leave this machine, and every answer must cite sources.'
    },
    evidence: {
      label: 'Evidence',
      title: 'Proof over promises.',
      description: 'Check each real record one by one. Passed, failed, blocked and not run are kept clearly apart.'
    },
    handoff: {
      label: 'Handoff',
      title: 'Built to be reproduced.',
      description: 'Hand over the entry points, the environment state and the verification boundary together, not just an interface that looks secure.'
    }
  };
  const statusStyles = {
    passed: { label: 'Passed', tone: 'green', icon: 'check' },
    failed: { label: 'Failed', tone: 'red', icon: 'alert' },
    blocked: { label: 'Blocked', tone: 'amber', icon: 'shield' },
    not_run: { label: 'Not run', tone: 'neutral', icon: 'clock' },
    unavailable: { label: 'Unavailable', tone: 'amber', icon: 'alert' },
    error: { label: 'Error', tone: 'red', icon: 'alert' },
    scanning: { label: 'Scanning', tone: 'neutral', icon: 'refresh' }
  };
  let refreshing = false;
  let scanning = false;
  let toastTimer;
  let hasEvidence = false;
  let hasWorkspace = false;
  let ragLoaded = false;
  let ragReady = false;
  let asking = false;
  let securityLoaded = false;
  let securityLoading = false;

  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

  // Only structured metadata is shown, and common credential shapes that could
  // slip into metadata are redacted before rendering.
  function safeText(value, fallback = '—', limit = 300) {
    if (typeof value !== 'string' && typeof value !== 'number') return fallback;
    const text = String(value).trim();
    if (!text) return fallback;
    return text
      .replace(/-----BEGIN [\s\S]*?PRIVATE KEY-----[\s\S]*?(?:-----END [\s\S]*?PRIVATE KEY-----|$)/g, '[private key hidden]')
      .replace(/\b(?:Bearer|Basic)\s+\S+/gi, '[credentials hidden]')
      .replace(/((?:api[_-]?key|[\w.-]*secret[\w.-]*|[\w.-]*token[\w.-]*|password|credential)\s*[=:]\s*)[^\s,;]+/gi, '$1[hidden]')
      .replace(/\b(?:gh[pousr]_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+|AKIA[A-Z0-9]{16})\b/g, '[secret hidden]')
      .replace(/\b(?=[A-Za-z0-9_+/=-]{24,}\b)(?=[A-Za-z0-9_+/=-]*[A-Za-z])(?=[A-Za-z0-9_+/=-]*[0-9])[A-Za-z0-9_+/=-]{24,}/g, '[long identifier hidden]')
      .slice(0, limit);
  }

  // Identifiers from our own API (model names, paths) are not secrets; only
  // strip control characters so the redaction heuristic does not mangle them.
  function plainText(value, fallback = '—', limit = 200) {
    if (typeof value !== 'string' && typeof value !== 'number') return fallback;
    const text = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    return text ? text.slice(0, limit) : fallback;
  }

  function setText(id, value) {
    byId(id).textContent = value;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  }

  function badge(label, tone = 'neutral') {
    return element('span', `badge badge-${tone}`, label);
  }

  function updateBadge(id, label, tone = 'neutral') {
    const node = byId(id);
    node.className = `badge badge-${tone}`;
    node.textContent = label;
  }

  function readableDate(value) {
    if (typeof value !== 'string' || !value.trim()) return 'no generation time provided';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'invalid generation time';
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(date);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    setText('toast', message);
    byId('toast').hidden = false;
    toastTimer = setTimeout(() => { byId('toast').hidden = true; }, 3500);
  }

  function showRoute(moveFocus = false) {
    const requested = location.hash.slice(1);
    const route = Object.hasOwn(routes, requested) ? requested : 'overview';
    const page = routes[route];
    document.querySelectorAll('[data-view]').forEach((view) => {
      view.hidden = view.dataset.view !== route;
    });
    document.querySelectorAll('[data-nav]').forEach((link) => {
      const selected = link.dataset.nav === route;
      link.classList.toggle('active', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    setText('page-title', page.title);
    setText('page-description', page.description);
    setText('breadcrumb-current', page.label);
    byId('heading-demo-link').hidden = route === 'live-demo';
    document.title = `${page.label} — SENTINEL`;
    if (route === 'local-ai' && !ragLoaded) refreshRag();
    if (route === 'security' && !securityLoaded) refreshSecurity();
    if (moveFocus) byId('main-content').focus({ preventScroll: false });
  }

  function updateControls() {
    const busy = refreshing || scanning;
    document.querySelectorAll('[data-refresh-status], #refresh-evidence').forEach((button) => {
      button.disabled = busy;
      const isStatus = button.hasAttribute('data-refresh-status');
      button.querySelector('span').textContent = refreshing ? 'Refreshing…' : (isStatus ? 'Refresh status' : 'Refresh evidence');
      button.querySelector('.icon').classList.toggle('is-spinning', refreshing);
    });
    document.querySelectorAll('[data-scenario]').forEach((button) => {
      button.disabled = busy;
      button.querySelector('span').textContent = scanning
        ? 'Scanning, please wait…'
        : (button.dataset.scenario === 'leak' ? 'Demo leak → blocked' : 'Demo repair → passed');
    });
    const submit = byId('rag-submit');
    if (submit) {
      submit.disabled = asking || !ragReady;
      submit.querySelector('span').textContent = asking ? 'Generating locally…' : 'Ask locally';
      document.querySelectorAll('.rag-chip').forEach((chip) => { chip.disabled = asking || !ragReady; });
      byId('rag-question').disabled = asking || !ragReady;
    }
    byId('demo-result').setAttribute('aria-busy', String(scanning));
  }

  function setConnection(state, message = '') {
    const connected = state === 'connected';
    const label = connected ? 'Connected' : (state === 'loading' ? 'Connecting…' : 'Not connected');
    document.querySelectorAll('[data-connection-label]').forEach((node) => {
      node.textContent = label;
      node.title = connected ? 'The last API request succeeded. This does not mean every check passed, and no polling is used.' : message;
    });
    document.querySelectorAll('[data-connection-dot]').forEach((node) => {
      node.className = `status-dot${connected ? ' dot-green' : state === 'offline' ? ' dot-red' : ''}`;
    });
    byId('connection-notice').hidden = connected && !message;
    byId('connection-notice').className = `notice ${state === 'offline' ? 'notice-error' : 'notice-neutral'}`;
    setText('connection-notice-text', message || (connected ? '' : 'Connecting to the local service. No check conclusion can be confirmed yet.'));
  }

  function requestError(kind, status) {
    const error = new Error(kind);
    error.kind = kind;
    error.httpStatus = status;
    return error;
  }

  async function requestJSON(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? (options.method === 'POST' ? 90000 : 20000));
    try {
      const response = await fetch(path, {
        ...options,
        headers: { Accept: 'application/json', ...options.headers },
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'error',
        signal: controller.signal
      });
      if (!response.ok) {
        if (path === '/api/demo/secret') {
          let data;
          try { data = await response.json(); } catch { throw requestError('http', response.status); }
          if (isRecord(data) && ['unavailable', 'error'].includes(data.status)) return data;
        }
        throw requestError('http', response.status);
      }
      try {
        return await response.json();
      } catch {
        throw requestError('format');
      }
    } catch (error) {
      if (controller.signal.aborted) throw requestError('timeout');
      if (error.kind) throw error;
      throw requestError('network');
    } finally {
      clearTimeout(timer);
    }
  }

  function explainError(error) {
    if (error.kind === 'timeout') return 'The request timed out and no result could be confirmed.';
    if (error.kind === 'http') return `The API returned HTTP ${error.httpStatus}, so there is no valid result.`;
    if (error.kind === 'format') return 'The API response did not match the agreed shape, so the result cannot be confirmed.';
    return 'Cannot reach the local service. Confirm the server is running and open the console at the default 127.0.0.1:4173.';
  }

  function validateEvidence(data) {
    const validStatuses = new Set(['passed', 'failed', 'not_run', 'blocked']);
    if (!isRecord(data) || !Array.isArray(data.checks)) throw requestError('format');
    if (!data.checks.every((check) => isRecord(check)
      && typeof check.id === 'string' && typeof check.label === 'string'
      && validStatuses.has(check.status))) throw requestError('format');
    return data;
  }

  function renderEvidence(data, source) {
    const checks = data.checks;
    const passed = checks.filter((check) => check.status === 'passed').length;
    const failed = checks.filter((check) => check.status === 'failed').length;
    const blocked = checks.filter((check) => check.status === 'blocked').length;
    const notRun = checks.filter((check) => check.status === 'not_run').length;
    hasEvidence = true;
    setText('verified-count', String(passed));
    setText('verified-total', `/ ${checks.length}`);
    setText('evidence-heading-count', String(passed));
    setText('evidence-heading-total', String(checks.length));
    setText('evidence-metric-detail', checks.length ? `${passed} passed · ${checks.length - passed} not passed or not run` : 'The API has no check records');
    byId('evidence-metric-dot').className = `status-dot${checks.length && passed === checks.length ? ' dot-green' : checks.length ? ' dot-amber' : ''}`;
    setText('evidence-summary-detail', checks.length
      ? `${passed} passed · ${failed} failed · ${blocked} blocked · ${notRun} not run. This counts API records only; it is not full delivery verification.`
      : 'The API returned an empty check list, so there is no verification record to claim.');
    setText('evidence-source', source);
    const time = readableDate(data.generatedAt);
    setText('evidence-generated-at', time);
    setText('preview-updated', `Snapshot · ${time}`);
    updateBadge('evidence-snapshot-badge', checks.length ? 'Snapshot received' : 'No records');
    byId('evidence-load-notice').hidden = true;

    const body = byId('evidence-table-body');
    const preview = byId('evidence-preview-list');
    body.replaceChildren();
    preview.replaceChildren();
    if (!checks.length) {
      const row = element('tr');
      const cell = element('td', 'table-empty', 'No check records yet. Run the project checks, then refresh the evidence.');
      cell.colSpan = 3;
      row.append(cell);
      body.append(row);
      preview.append(element('div', 'empty-inline', 'No check records yet. An empty list is not a pass.'));
      return;
    }

    const tableFragment = document.createDocumentFragment();
    checks.forEach((check) => {
      const style = statusStyles[check.status];
      const row = element('tr');
      const name = element('td');
      name.append(element('span', 'check-label', safeText(check.label)), element('span', 'check-id', safeText(check.id)));
      const status = element('td');
      status.append(badge(style.label, style.tone));
      row.append(name, status, element('td', '', safeText(check.detail, 'The API provided no detail.', 1200)));
      tableFragment.append(row);
    });
    body.append(tableFragment);

    checks.slice(0, 4).forEach((check) => {
      const style = statusStyles[check.status];
      const row = element('div', 'preview-row');
      const mark = element('span', `preview-check-icon badge-${style.tone}`);
      mark.append(icon(style.icon));
      const text = element('div', 'preview-check-text');
      text.append(element('strong', '', safeText(check.label)), element('small', '', safeText(check.detail, 'The API provided no detail.')));
      row.append(mark, text, badge(style.label, style.tone));
      preview.append(row);
    });
  }

  function clearEvidence(message) {
    hasEvidence = false;
    setText('verified-count', '—');
    setText('verified-total', '/ —');
    setText('evidence-heading-count', '—');
    setText('evidence-heading-total', '—');
    setText('evidence-metric-detail', 'Evidence unavailable; the passed count cannot be confirmed');
    byId('evidence-metric-dot').className = 'status-dot dot-amber';
    setText('evidence-summary-detail', message);
    setText('evidence-source', 'unavailable');
    setText('evidence-generated-at', 'no valid snapshot');
    setText('preview-updated', 'no valid evidence snapshot');
    updateBadge('evidence-snapshot-badge', 'Unavailable', 'amber');
    byId('evidence-preview-list').replaceChildren(element('div', 'empty-inline', message));
    const row = element('tr');
    const cell = element('td', 'table-empty', message);
    cell.colSpan = 3;
    row.append(cell);
    byId('evidence-table-body').replaceChildren(row);
    byId('evidence-load-notice').hidden = true;
  }

  function renderTools(tools, disconnected = false) {
    const list = byId('tools-list');
    list.replaceChildren();
    const labels = { gitleaks: 'Gitleaks', trivy: 'Trivy', terraform: 'Terraform' };
    Object.entries(labels).forEach(([key, label]) => {
      const tool = isRecord(tools?.[key]) ? tools[key] : null;
      const known = tool && typeof tool.available === 'boolean';
      const available = known && tool.available;
      const status = disconnected ? 'Not connected' : known ? (available ? 'Available' : 'Unavailable') : 'Unknown';
      const tone = available ? 'green' : known ? 'amber' : 'neutral';
      const row = element('li');
      const description = element('span', 'tool-description');
      description.append(element('strong', '', label));
      description.append(element('small', '', tool ? safeText(tool.version, 'version not provided') : 'version not confirmed'));
      row.append(description, badge(status, tone));
      list.append(row);
      if (key === 'gitleaks') {
        updateBadge('gitleaks-badge', status, tone);
        setText('gitleaks-version', available
          ? `${safeText(tool.version, 'version not provided')} · available is not the same as passed`
          : disconnected ? 'Service not connected; tool status cannot be confirmed' : known ? 'Tool unavailable; the demo will not fake a pass' : 'The API provided no valid tool status');
        const node = byId('gate-node-state');
        const dot = element('span', `status-dot${available ? ' dot-green' : known ? ' dot-amber' : ''}`);
        node.replaceChildren(dot, document.createTextNode(available ? ' Tool available · run required' : disconnected ? ' Not connected' : known ? ' Gitleaks unavailable' : ' Status not confirmed'));
      }
    });
  }

  function renderWorkspace(data) {
    if (!isRecord(data) || typeof data.name !== 'string' || !isRecord(data.environment) || !isRecord(data.tools)) {
      throw requestError('format');
    }
    hasWorkspace = true;
    setText('runtime-name', safeText(data.name));
    setText('runtime-version', safeText(data.version));
    setText('runtime-node', safeText(data.nodeVersion));
    setText('runtime-expected-node', safeText(data.expectedNode));
    setText('runtime-platform', `${safeText(data.environment.platform)} / ${safeText(data.environment.arch)}`);
    setText('runtime-mode', safeText(data.environment.mode));
    renderTools(data.tools);
    setConnection('connected');
    try {
      renderEvidence(validateEvidence(data.evidence), 'GET /api/status → evidence');
    } catch {
      clearEvidence('The service is connected but the status endpoint returned no valid evidence. Use Refresh evidence to retry separately.');
    }
  }

  function clearWorkspace(message) {
    hasWorkspace = false;
    setConnection('offline', `Not connected · ${message}`);
    setText('runtime-name', 'Not connected');
    ['runtime-version', 'runtime-node', 'runtime-expected-node', 'runtime-platform', 'runtime-mode'].forEach((id) => setText(id, '—'));
    renderTools(null, true);
    clearEvidence('Current evidence is unavailable. Unknown state is never recorded as a pass.');
  }

  function markEvidenceRefreshing() {
    updateBadge('evidence-snapshot-badge', 'Loading');
    if (hasEvidence) {
      setText('evidence-load-notice', 'Refreshing. The rows below are the previous snapshot and do not prove this request succeeded.');
      byId('evidence-load-notice').hidden = false;
    }
  }

  async function refreshStatus() {
    if (refreshing || scanning) return;
    refreshing = true;
    updateControls();
    markEvidenceRefreshing();
    setConnection('loading', hasWorkspace ? 'Refreshing local status. Until it completes, the values below are the previous read.' : 'Connecting to the local service. Tool status and verification evidence are not confirmed yet.');
    try {
      renderWorkspace(await requestJSON('/api/status'));
    } catch (error) {
      clearWorkspace(explainError(error));
    } finally {
      refreshing = false;
      updateControls();
    }
  }

  async function refreshEvidence() {
    if (refreshing || scanning) return;
    refreshing = true;
    updateControls();
    markEvidenceRefreshing();
    try {
      const data = validateEvidence(await requestJSON('/api/evidence'));
      renderEvidence(data, 'GET /api/evidence');
      setConnection('connected', hasWorkspace ? '' : 'The evidence endpoint is connected. Tools and runtime are not confirmed yet; use Refresh status.');
    } catch (error) {
      if (error.kind === 'network' || error.kind === 'timeout') clearWorkspace(explainError(error));
      else clearEvidence(`Reading evidence failed. ${explainError(error)}`);
    } finally {
      refreshing = false;
      updateControls();
    }
  }

  function setDemoState(status, title, message) {
    const style = statusStyles[status];
    updateBadge('demo-status-badge', style.label, style.tone);
    byId('verdict-panel').className = `verdict-panel verdict-${status}`;
    byId('verdict-symbol').querySelector('use').setAttribute('href', `#i-${style.icon}`);
    setText('demo-verdict', title);
    setText('demo-message', message);
    setText('last-verdict', style.label);
  }

  function validateDemo(data, scenario) {
    if (!isRecord(data) || data.scenario !== scenario
      || !['passed', 'blocked', 'unavailable', 'error'].includes(data.status)
      || !Array.isArray(data.findings)
      || !data.findings.every(isRecord)) throw requestError('format');
    // If the fields contradict each other, show an error instead of treating an
    // expected pass as a real pass.
    if (data.status === 'passed' && (data.exitCode !== 0 || data.findings.length !== 0)) throw requestError('format');
    if (data.status === 'blocked' && (!Number.isInteger(data.exitCode) || data.exitCode === 0)) throw requestError('format');
    if (['passed', 'blocked'].includes(data.status) && (typeof data.engine !== 'string' || !data.engine.trim())) throw requestError('format');
    return data;
  }

  function renderDemo(data) {
    const messages = {
      passed: ['Input cleared.', 'The backend returned Passed, so this input cleared the current rules. This does not mean the project, remote CI or the container runtime is fully secure.'],
      blocked: ['Secret blocked.', 'The backend returned Blocked, so the scan engine stopped this synthetic input. Only the rule and location are shown; the raw secret is never echoed.'],
      unavailable: ['Scanner unavailable.', 'The backend reports the scan engine is unavailable. There is no pass for this run; prepare Gitleaks, refresh status and retry.'],
      error: ['No verified verdict.', 'The backend reports an execution error. There is no confirmed pass; check the local server and tool configuration.']
    };
    const [title, message] = messages[data.status];
    setDemoState(data.status, title, message);
    setText('demo-engine', safeText(data.engine, 'not reported', 100));
    setText('demo-duration', typeof data.elapsedMs === 'number' && Number.isFinite(data.elapsedMs) && data.elapsedMs >= 0 ? `${Math.round(data.elapsedMs)} ms` : 'not reported');
    setText('demo-exit-code', Number.isInteger(data.exitCode) ? String(data.exitCode) : 'not reported');
    setText('demo-scenario', data.scenario === 'leak' ? 'leak / synthetic credential' : 'clean / no credential');
    const finished = readableDate(new Date().toISOString());
    setText('demo-finished-at', `Response received · ${finished}`);
    setText('last-verdict-detail', `${data.scenario} · ${finished}`);
    setText('findings-count', `${data.findings.length} returned records`);
    const list = byId('findings-list');
    list.replaceChildren();
    if (!data.findings.length) {
      list.append(element('div', 'empty-inline', data.status === 'passed'
        ? 'This scan returned no hits. That holds only for the current input and the current rules.'
        : 'The API returned no hit detail. No record is not the same as a pass.'));
      return;
    }
    const fragment = document.createDocumentFragment();
    data.findings.forEach((finding) => {
      const row = element('div', 'finding-row');
      row.append(element('div', 'finding-rule', safeText(finding.ruleId, 'no rule id provided', 150)));
      // Free-text message and description are not echoed, because they can
      // accidentally carry the matched credential.
      row.append(element('p', 'finding-description', 'Rule hit record. The raw match and free-text description are not displayed.'));
      const line = Number.isInteger(finding.line) && finding.line > 0 ? String(finding.line) : 'no line number';
      row.append(element('div', 'finding-location mono', `${safeText(finding.file, 'no file provided', 250)} : ${line}`));
      fragment.append(row);
    });
    list.append(fragment);
  }

  async function runDemo(scenario) {
    if (scanning || refreshing || !['leak', 'clean'].includes(scenario)) return;
    scanning = true;
    updateControls();
    setDemoState('scanning', 'Scanning in progress.', 'Submitting the synthetic scenario and waiting for the backend result. Both demo entries stay locked until it finishes.');
    setText('last-verdict-detail', `${scenario} · waiting for the real scan`);
    ['demo-engine', 'demo-duration', 'demo-exit-code'].forEach((id) => setText(id, '—'));
    setText('demo-scenario', scenario);
    setText('findings-count', 'Scanning');
    setText('demo-finished-at', 'Waiting for the backend');
    const waiting = element('div', 'empty-inline');
    waiting.append(element('span', 'loading-ring'), element('span', '', 'Scanning without assuming blocked or passed…'));
    byId('findings-list').replaceChildren(waiting);
    try {
      const data = await requestJSON('/api/demo/secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      renderDemo(validateDemo(data, scenario));
    } catch (error) {
      const message = explainError(error) + (error.kind === 'timeout' ? ' The server scan may still be running; confirm its state before retrying.' : ' This demo will not be shown as passed.');
      setDemoState('error', error.kind === 'network' ? 'Not connected.' : 'No verified verdict.', message);
      setText('last-verdict-detail', 'Request failed · no valid scan conclusion');
      setText('findings-count', 'No valid result');
      setText('demo-finished-at', 'The request produced no valid scan result');
      byId('findings-list').replaceChildren(element('div', 'empty-inline', 'No valid scan detail was returned, so the input cannot be judged safe.'));
      if (error.kind === 'network' || error.kind === 'timeout') clearWorkspace(explainError(error));
    } finally {
      scanning = false;
      updateControls();
    }
  }

  function renderSecurity(data) {
    const gate = isRecord(data?.gate) ? data.gate : null;
    if (!gate || !Array.isArray(data.scans) || !Array.isArray(data.policy)) throw requestError('format');
    const tone = gate.status === 'pass' ? 'green' : gate.status === 'fail' ? 'red' : 'amber';
    setText('gate-label', gate.label);
    updateBadge('gate-badge', gate.status === 'pass' ? 'Ready to ship' : gate.status === 'fail' ? 'Blocked' : 'Not provable yet', tone);
    byId('gate-card').className = `card gate-card gate-${gate.status}`;
    setText('gate-detail', gate.detail);
    const coverage = isRecord(data.coverage) ? data.coverage : { verified: 0, total: 0 };
    setText('gate-coverage', `${coverage.verified} of ${coverage.total} checks verified`);
    setText('gate-generated', data.generatedAt ? `Evidence generated ${readableDate(data.generatedAt)}` : 'No evidence snapshot yet');
    const counts = isRecord(data.counts) ? data.counts : {};
    setText('sec-tests', Number.isFinite(counts.tests) ? String(counts.tests) : '—');
    setText('sec-files', Number.isFinite(counts.filesScanned) ? String(counts.filesScanned) : '—');
    setText('sec-blocked', Number.isFinite(counts.blocked) ? String(counts.blocked) : '—');
    setText('sec-notrun', Number.isFinite(counts.notRun) ? String(counts.notRun) : '—');
    setText('scan-count', `${coverage.verified} of ${coverage.total} verified`);
    if (typeof data.note === 'string' && data.note.trim()) setText('security-note', data.note);

    const scanBody = byId('scan-table-body');
    scanBody.replaceChildren();
    const scanFragment = document.createDocumentFragment();
    data.scans.forEach((scan) => {
      const style = statusStyles[scan.status] ?? statusStyles.not_run;
      const row = element('tr');
      const nameCell = element('td');
      nameCell.append(element('span', 'check-label', safeText(scan.name)), element('span', 'check-id', `${scan.verified} of ${scan.total} checks verified`));
      row.append(nameCell, element('td', 'mono', safeText(scan.tool)), element('td', '', safeText(scan.policy)));
      const statusCell = element('td');
      statusCell.append(badge(style.label, style.tone));
      row.append(statusCell);
      scanFragment.append(row);
    });
    scanBody.append(scanFragment);

    const policyBody = byId('policy-table-body');
    policyBody.replaceChildren();
    const policyFragment = document.createDocumentFragment();
    data.policy.forEach((item) => {
      const row = element('tr');
      const ruleCell = element('td');
      ruleCell.append(element('span', 'check-label', safeText(item.rule)), element('span', 'check-id', item.blocking ? 'blocks a merge' : 'advisory only'));
      row.append(ruleCell, element('td', '', safeText(item.threshold)), element('td', '', safeText(item.what ?? item.why)));
      policyFragment.append(row);
    });
    policyBody.append(policyFragment);
  }

  async function refreshSecurity() {
    if (securityLoading) return;
    securityLoading = true;
    try {
      renderSecurity(await requestJSON('/api/security'));
      securityLoaded = true;
    } catch (error) {
      updateBadge('gate-badge', 'Unavailable', 'amber');
      setText('gate-label', 'Report unavailable');
      setText('gate-detail', explainError(error));
      const body = byId('scan-table-body');
      const row = element('tr');
      const cell = element('td', 'table-empty', 'The security report could not be read, so no scan status is claimed.');
      cell.colSpan = 4;
      row.append(cell);
      body.replaceChildren(row);
    } finally {
      securityLoading = false;
    }
  }

  async function copyCommand(button) {
    if (button.disabled) return;
    const target = byId(button.dataset.copy);
    if (!target) return;
    const text = target.textContent;
    button.disabled = true;
    button.querySelector('span').textContent = 'Copying';
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      // If the browser denies clipboard access, fall back to a local copy
      // triggered by the user's click.
    }
    if (!copied) {
      const textarea = element('textarea', 'clipboard-fallback');
      textarea.value = text;
      textarea.readOnly = true;
      document.body.append(textarea);
      textarea.select();
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      } finally {
        textarea.remove();
      }
    }
    button.disabled = false;
    button.focus({ preventScroll: true });
    if (copied) {
      button.querySelector('span').textContent = 'Copied';
      showToast('Command copied. Nothing was executed.');
      setTimeout(() => { button.querySelector('span').textContent = 'Copy'; }, 2000);
    } else {
      button.querySelector('span').textContent = 'Copy';
      showToast('The browser blocked copying. Select the command text and copy it manually.');
    }
  }

  function setRagNotice(ready, message) {
    const node = byId('rag-kb');
    node.replaceChildren(element('span', `status-dot${ready ? ' dot-green' : ' dot-amber'}`), element('span', '', message));
  }

  async function refreshRag() {
    updateBadge('rag-badge', 'Checking', 'neutral');
    setRagNotice(false, 'Confirming the local model and knowledge base…');
    try {
      const status = await requestJSON('/api/rag/status');
      ragLoaded = true;
      ragReady = status.ready === true;
      if (ragReady) {
        updateBadge('rag-badge', 'Ready', 'green');
        setRagNotice(true, `${status.documents} documents · ${status.chunks} chunks · ${plainText(status.embedModel, 'local embedding model', 60)}`);
        setText('rag-hint', `Local retrieval ready · ${plainText(status.chatModel, 'local model', 40)}`);
      } else {
        updateBadge('rag-badge', 'Unavailable', 'amber');
        setRagNotice(false, `Local model not ready: ${safeText(status.reason, 'unknown reason', 160)}`);
        setText('rag-hint', 'No request is sent while the model is not ready, and no fake answer is shown.');
      }
    } catch (error) {
      ragLoaded = true;
      ragReady = false;
      updateBadge('rag-badge', 'Not connected', 'amber');
      setRagNotice(false, explainError(error));
      setText('rag-hint', 'Local model status cannot be read, so asking is unavailable.');
    } finally { updateControls(); }
  }

  function renderSources(sources) {
    const list = byId('rag-sources');
    list.replaceChildren();
    setText('rag-source-count', `${sources.length} hits`);
    if (!sources.length) {
      list.append(element('div', 'empty-inline', 'No source passage was returned, so the answer cannot be treated as grounded.'));
      return;
    }
    const fragment = document.createDocumentFragment();
    sources.forEach((source, index) => {
      const row = element('div', 'rag-source');
      const body = element('div', 'rag-source-body');
      body.append(element('strong', '', plainText(source.file, 'no file provided', 160)), element('small', '', plainText(source.heading, 'no section provided', 120)));
      row.append(element('span', 'rag-source-index', String(index + 1)), body, element('span', 'rag-source-score', typeof source.score === 'number' ? source.score.toFixed(3) : '—'));
      fragment.append(row);
    });
    list.append(fragment);
  }

  async function askRag() {
    if (asking || !ragReady) return;
    const input = byId('rag-question');
    const question = input.value.trim();
    if (!question) { showToast('Type a question first.'); input.focus(); return; }
    if (question.length > 400) { showToast('Keep the question under 400 characters.'); return; }
    asking = true;
    updateControls();
    byId('rag-result').setAttribute('aria-busy', 'true');
    updateBadge('rag-answer-badge', 'Retrieving', 'neutral');
    const answerBox = byId('rag-answer');
    answerBox.className = 'rag-answer is-loading';
    answerBox.textContent = 'Retrieving locally and generating. A 27B model usually needs ten to twenty seconds.';
    byId('rag-sources').replaceChildren(element('div', 'empty-inline', 'Retrieving local passages…'));
    setText('rag-source-count', 'Retrieving');
    ['rag-model', 'rag-duration', 'rag-egress', 'rag-retrieval'].forEach(id => setText(id, '—'));
    setText('rag-finished-at', 'Waiting for the local model');
    try {
      const data = await requestJSON('/api/rag/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
        timeoutMs: 150000
      });
      if (!isRecord(data) || typeof data.answer !== 'string' || !data.answer.trim() || !Array.isArray(data.sources)) throw requestError('format');
      answerBox.className = 'rag-answer';
      answerBox.textContent = data.answer.trim();
      updateBadge('rag-answer-badge', 'Answered', 'green');
      setText('rag-model', plainText(data.model, 'local model', 60));
      setText('rag-retrieval', data.retrieval === 'hybrid'
        ? 'hybrid · vectors + keywords'
        : (data.retrieval === 'semantic' ? 'semantic · local vectors' : safeText(data.retrieval, 'not reported', 40)));
      setText('rag-duration', typeof data.elapsedMs === 'number' ? `${Math.round(data.elapsedMs)} ms` : 'not reported');
      setText('rag-egress', data.localOnly === true ? 'Loopback only' : 'not confirmed');
      setText('rag-finished-at', `Answer received · ${readableDate(new Date().toISOString())}`);
      renderSources(data.sources);
    } catch (error) {
      answerBox.className = 'rag-answer';
      answerBox.textContent = explainError(error) + ' There is no confirmed answer for this request, and no guess is shown.';
      updateBadge('rag-answer-badge', error.kind === 'network' || error.kind === 'timeout' ? 'Unavailable' : 'Error', 'amber');
      setText('rag-finished-at', 'The request produced no valid answer');
      byId('rag-sources').replaceChildren(element('div', 'empty-inline', 'No confirmed source passages.'));
      setText('rag-source-count', 'No valid sources');
    } finally {
      asking = false;
      byId('rag-result').setAttribute('aria-busy', 'false');
      updateControls();
    }
  }

  document.querySelector('.skip-link').addEventListener('click', (event) => {
    event.preventDefault();
    byId('main-content').focus();
  });
  document.querySelectorAll('[data-refresh-status]').forEach((button) => button.addEventListener('click', refreshStatus));
  byId('refresh-evidence').addEventListener('click', refreshEvidence);
  document.querySelectorAll('[data-scenario]').forEach((button) => button.addEventListener('click', () => runDemo(button.dataset.scenario)));
  document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', () => copyCommand(button)));
  byId('rag-submit').addEventListener('click', askRag);
  document.querySelectorAll('.rag-chip').forEach((chip) => chip.addEventListener('click', () => {
    byId('rag-question').value = chip.dataset.question;
    byId('rag-question').focus();
  }));
  byId('rag-question').addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); askRag(); }
  });
  document.querySelectorAll('.icon').forEach((svg) => svg.setAttribute('aria-hidden', 'true'));
  window.addEventListener('hashchange', () => showRoute(true));
  showRoute();
  refreshStatus();
})();
