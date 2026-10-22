'use strict';

(() => {
  const byId = (id) => document.getElementById(id);
  const routes = {
    overview: {
      label: 'Overview',
      title: 'Security, made visible.',
      description: '从代码到交付，让安全信号清晰可见。不隐藏风险，也不提前宣布成功。'
    },
    'live-demo': {
      label: 'Live demo',
      title: 'A secret. A hard stop.',
      description: '用合成输入触发真实 Gitleaks 扫描。拦截与放行，都由后端执行结果决定。'
    },
    'local-ai': {
      label: 'Local AI',
      title: 'Your documents. Your machine.',
      description: '本地向量检索 + 本地生成模型。问题与资料不离开这台机器，回答必须带来源。'
    },
    evidence: {
      label: 'Evidence',
      title: 'Proof over promises.',
      description: '逐条核对真实检查记录。清楚区分已通过、失败、阻断与尚未运行。'
    },
    handoff: {
      label: 'Handoff',
      title: 'Built to be reproduced.',
      description: '把执行入口、环境状态与验证边界一起交付，而不只是一个看起来安全的界面。'
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

  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

  // 只显示结构化元数据，并对可能误入元数据的常见凭据形式脱敏。
  function safeText(value, fallback = '—', limit = 300) {
    if (typeof value !== 'string' && typeof value !== 'number') return fallback;
    const text = String(value).trim();
    if (!text) return fallback;
    return text
      .replace(/-----BEGIN [\s\S]*?PRIVATE KEY-----[\s\S]*?(?:-----END [\s\S]*?PRIVATE KEY-----|$)/g, '[已隐藏密钥]')
      .replace(/\b(?:Bearer|Basic)\s+\S+/gi, '[已隐藏认证信息]')
      .replace(/((?:api[_-]?key|[\w.-]*secret[\w.-]*|[\w.-]*token[\w.-]*|password|credential)\s*[=:]\s*)[^\s,;]+/gi, '$1[已隐藏]')
      .replace(/\b(?:gh[pousr]_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+|AKIA[A-Z0-9]{16})\b/g, '[已隐藏密钥]')
      .replace(/\b(?=[A-Za-z0-9_+/=-]{24,}\b)(?=[A-Za-z0-9_+/=-]*[A-Za-z])(?=[A-Za-z0-9_+/=-]*[0-9])[A-Za-z0-9_+/=-]{24,}/g, '[已隐藏长标识]')
      .slice(0, limit);
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
    if (typeof value !== 'string' || !value.trim()) return '未提供生成时间';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '生成时间无效';
    return new Intl.DateTimeFormat('zh-CN', {
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
    if (moveFocus) byId('main-content').focus({ preventScroll: false });
  }

  function updateControls() {
    const busy = refreshing || scanning;
    document.querySelectorAll('[data-refresh-status], #refresh-evidence').forEach((button) => {
      button.disabled = busy;
      const isStatus = button.hasAttribute('data-refresh-status');
      button.querySelector('span').textContent = refreshing ? '刷新中…' : (isStatus ? '刷新状态' : '刷新证据');
      button.querySelector('.icon').classList.toggle('is-spinning', refreshing);
    });
    document.querySelectorAll('[data-scenario]').forEach((button) => {
      button.disabled = busy;
      button.querySelector('span').textContent = scanning
        ? '扫描中，请等待…'
        : (button.dataset.scenario === 'leak' ? '演示泄露 → 拦截' : '演示修复 → 放行');
    });
    const submit = byId('rag-submit');
    if (submit) {
      submit.disabled = asking || !ragReady;
      submit.querySelector('span').textContent = asking ? '本地生成中…' : '本地提问';
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
      node.title = connected ? '最近一次 API 请求成功；不代表所有检查通过，不进行轮询。' : message;
    });
    document.querySelectorAll('[data-connection-dot]').forEach((node) => {
      node.className = `status-dot${connected ? ' dot-green' : state === 'offline' ? ' dot-red' : ''}`;
    });
    byId('connection-notice').hidden = connected && !message;
    byId('connection-notice').className = `notice ${state === 'offline' ? 'notice-error' : 'notice-neutral'}`;
    setText('connection-notice-text', message || (connected ? '' : '正在连接本地服务；尚不能确认任何检查结论。'));
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
    if (error.kind === 'timeout') return '请求超时，未获得可确认的结果。';
    if (error.kind === 'http') return `接口返回 HTTP ${error.httpStatus}，未获得有效结果。`;
    if (error.kind === 'format') return '接口数据格式不符合约定，不能确认结果。';
    return '无法连接本地服务。请确认服务器已启动，并通过默认 127.0.0.1:4173 访问控制台。';
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
    setText('evidence-metric-detail', checks.length ? `${passed} 项通过 · ${checks.length - passed} 项未通过或未运行` : '接口尚无检查记录');
    byId('evidence-metric-dot').className = `status-dot${checks.length && passed === checks.length ? ' dot-green' : checks.length ? ' dot-amber' : ''}`;
    setText('evidence-summary-detail', checks.length
      ? `${passed} passed · ${failed} failed · ${blocked} blocked · ${notRun} not run。只统计接口记录，不代表完整交付验证。`
      : '接口返回空检查列表；没有可宣称通过的验证记录。');
    setText('evidence-source', source);
    const time = readableDate(data.generatedAt);
    setText('evidence-generated-at', time);
    setText('preview-updated', `快照 · ${time}`);
    updateBadge('evidence-snapshot-badge', checks.length ? 'Snapshot received' : 'No records');
    byId('evidence-load-notice').hidden = true;

    const body = byId('evidence-table-body');
    const preview = byId('evidence-preview-list');
    body.replaceChildren();
    preview.replaceChildren();
    if (!checks.length) {
      const row = element('tr');
      const cell = element('td', 'table-empty', '尚无检查记录。请先执行项目检查，再刷新证据。');
      cell.colSpan = 3;
      row.append(cell);
      body.append(row);
      preview.append(element('div', 'empty-inline', '尚无检查记录。空列表不等于全部通过。'));
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
      row.append(name, status, element('td', '', safeText(check.detail, '接口未提供详细说明。', 1200)));
      tableFragment.append(row);
    });
    body.append(tableFragment);

    checks.slice(0, 4).forEach((check) => {
      const style = statusStyles[check.status];
      const row = element('div', 'preview-row');
      const mark = element('span', `preview-check-icon badge-${style.tone}`);
      mark.append(icon(style.icon));
      const text = element('div', 'preview-check-text');
      text.append(element('strong', '', safeText(check.label)), element('small', '', safeText(check.detail, '接口未提供详细说明。')));
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
    setText('evidence-metric-detail', '证据不可用，无法确认通过数量');
    byId('evidence-metric-dot').className = 'status-dot dot-amber';
    setText('evidence-summary-detail', message);
    setText('evidence-source', '不可用');
    setText('evidence-generated-at', '尚无有效快照');
    setText('preview-updated', '无有效证据快照');
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
      description.append(element('small', '', tool ? safeText(tool.version, '未提供版本') : '版本未确认'));
      row.append(description, badge(status, tone));
      list.append(row);
      if (key === 'gitleaks') {
        updateBadge('gitleaks-badge', status, tone);
        setText('gitleaks-version', available
          ? `${safeText(tool.version, '版本未提供')} · 可用不等于扫描通过`
          : disconnected ? '服务未连接，无法确认工具状态' : known ? '工具不可用；演示不会伪造通过结果' : '接口未提供有效工具状态');
        const node = byId('gate-node-state');
        const dot = element('span', `status-dot${available ? ' dot-green' : known ? ' dot-amber' : ''}`);
        node.replaceChildren(dot, document.createTextNode(available ? ' 工具可用 · 需执行' : disconnected ? ' Not connected' : known ? ' Gitleaks 不可用' : ' 状态未确认'));
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
      clearEvidence('服务已连接，但 status 接口未提供有效证据。可通过“刷新证据”独立重试。');
    }
  }

  function clearWorkspace(message) {
    hasWorkspace = false;
    setConnection('offline', `Not connected · ${message}`);
    setText('runtime-name', 'Not connected');
    ['runtime-version', 'runtime-node', 'runtime-expected-node', 'runtime-platform', 'runtime-mode'].forEach((id) => setText(id, '—'));
    renderTools(null, true);
    clearEvidence('无法获取当前证据；未知状态不作为通过记录。');
  }

  function markEvidenceRefreshing() {
    updateBadge('evidence-snapshot-badge', 'Loading');
    if (hasEvidence) {
      setText('evidence-load-notice', '正在刷新；下方暂为上次读取的快照，不代表本次请求已经成功。');
      byId('evidence-load-notice').hidden = false;
    }
  }

  async function refreshStatus() {
    if (refreshing || scanning) return;
    refreshing = true;
    updateControls();
    markEvidenceRefreshing();
    setConnection('loading', hasWorkspace ? '正在刷新本地状态；刷新完成前，下方保留上次读取的信息。' : '正在连接本地服务。工具状态与验证证据尚未确认。');
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
      setConnection('connected', hasWorkspace ? '' : '证据接口已连接。工具与运行环境尚未确认，请点击“刷新状态”。');
    } catch (error) {
      if (error.kind === 'network' || error.kind === 'timeout') clearWorkspace(explainError(error));
      else clearEvidence(`证据读取失败。${explainError(error)}`);
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
    // 返回值相互矛盾时宁可显示错误，也不将“预期通过”当成真实放行。
    if (data.status === 'passed' && (data.exitCode !== 0 || data.findings.length !== 0)) throw requestError('format');
    if (data.status === 'blocked' && (!Number.isInteger(data.exitCode) || data.exitCode === 0)) throw requestError('format');
    if (['passed', 'blocked'].includes(data.status) && (typeof data.engine !== 'string' || !data.engine.trim())) throw requestError('format');
    return data;
  }

  function renderDemo(data) {
    const messages = {
      passed: ['Input cleared.', '后端返回 Passed，本次输入通过当前规则检查。此结果不代表项目、远端 CI 或容器运行已全部安全。'],
      blocked: ['Secret blocked.', '后端返回 Blocked，本次合成输入已被扫描引擎拦截。只展示规则与位置，不回显原始密钥。'],
      unavailable: ['Scanner unavailable.', '后端报告扫描引擎不可用。本次没有通过结论；请准备 Gitleaks 工具并刷新状态后重试。'],
      error: ['No verified verdict.', '后端报告执行错误。本次没有可确认的通过结论；请检查本地服务器与工具配置。']
    };
    const [title, message] = messages[data.status];
    setDemoState(data.status, title, message);
    setText('demo-engine', safeText(data.engine, '未报告', 100));
    setText('demo-duration', typeof data.elapsedMs === 'number' && Number.isFinite(data.elapsedMs) && data.elapsedMs >= 0 ? `${Math.round(data.elapsedMs)} ms` : '未报告');
    setText('demo-exit-code', Number.isInteger(data.exitCode) ? String(data.exitCode) : '未报告');
    setText('demo-scenario', data.scenario === 'leak' ? 'leak / 合成泄露' : 'clean / 干净输入');
    const finished = readableDate(new Date().toISOString());
    setText('demo-finished-at', `收到响应 · ${finished}`);
    setText('last-verdict-detail', `${data.scenario} · ${finished}`);
    setText('findings-count', `${data.findings.length} 条返回记录`);
    const list = byId('findings-list');
    list.replaceChildren();
    if (!data.findings.length) {
      list.append(element('div', 'empty-inline', data.status === 'passed'
        ? '本次扫描未返回命中记录，仅对当前输入与当前规则有效。'
        : '接口未返回命中明细；没有记录不等于检查通过。'));
      return;
    }
    const fragment = document.createDocumentFragment();
    data.findings.forEach((finding) => {
      const row = element('div', 'finding-row');
      row.append(element('div', 'finding-rule', safeText(finding.ruleId, '未提供规则 ID', 150)));
      // 不回显自由文本 message / description，避免其中意外携带匹配到的凭据。
      row.append(element('p', 'finding-description', '规则命中记录；原始匹配值与自由文本描述不予展示。'));
      const line = Number.isInteger(finding.line) && finding.line > 0 ? String(finding.line) : '未提供行号';
      row.append(element('div', 'finding-location mono', `${safeText(finding.file, '未提供文件', 250)} : ${line}`));
      fragment.append(row);
    });
    list.append(fragment);
  }

  async function runDemo(scenario) {
    if (scanning || refreshing || !['leak', 'clean'].includes(scenario)) return;
    scanning = true;
    updateControls();
    setDemoState('scanning', 'Scanning in progress.', '正在提交合成场景并等待后端扫描结果。执行完成前，两个演示入口均已锁定。');
    setText('last-verdict-detail', `${scenario} · 等待真实扫描结果`);
    ['demo-engine', 'demo-duration', 'demo-exit-code'].forEach((id) => setText(id, '—'));
    setText('demo-scenario', scenario);
    setText('findings-count', '扫描中');
    setText('demo-finished-at', '等待后端响应');
    const waiting = element('div', 'empty-inline');
    waiting.append(element('span', 'loading-ring'), element('span', '', '扫描中，不预设拦截或放行结果…'));
    byId('findings-list').replaceChildren(waiting);
    try {
      const data = await requestJSON('/api/demo/secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      renderDemo(validateDemo(data, scenario));
    } catch (error) {
      const message = explainError(error) + (error.kind === 'timeout' ? ' 服务端扫描可能仍在执行，请先确认其状态再重试。' : ' 本次演示不会显示为通过。');
      setDemoState('error', error.kind === 'network' ? 'Not connected.' : 'No verified verdict.', message);
      setText('last-verdict-detail', '请求失败 · 无有效扫描结论');
      setText('findings-count', '无有效结果');
      setText('demo-finished-at', '请求未获得有效扫描结果');
      byId('findings-list').replaceChildren(element('div', 'empty-inline', '未获得有效扫描明细，不能据此判断输入安全。'));
      if (error.kind === 'network' || error.kind === 'timeout') clearWorkspace(explainError(error));
    } finally {
      scanning = false;
      updateControls();
    }
  }

  async function copyCommand(button) {
    if (button.disabled) return;
    const target = byId(button.dataset.copy);
    if (!target) return;
    const text = target.textContent;
    button.disabled = true;
    button.querySelector('span').textContent = '复制中';
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      // 浏览器拒绝剪贴板权限时，仍可尝试用户点击触发的本地复制。
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
      button.querySelector('span').textContent = '已复制';
      showToast('命令已复制；尚未执行。');
      setTimeout(() => { button.querySelector('span').textContent = '复制'; }, 2000);
    } else {
      button.querySelector('span').textContent = '复制';
      showToast('浏览器未允许复制。请选中命令文本手动复制。');
    }
  }

  function setRagNotice(ready, message) {
    const node = byId('rag-kb');
    node.replaceChildren(element('span', `status-dot${ready ? ' dot-green' : ' dot-amber'}`), element('span', '', message));
  }

  async function refreshRag() {
    updateBadge('rag-badge', 'Checking', 'neutral');
    setRagNotice(false, '正在确认本地模型与知识库…');
    try {
      const status = await requestJSON('/api/rag/status');
      ragLoaded = true;
      ragReady = status.ready === true;
      if (ragReady) {
        updateBadge('rag-badge', 'Ready', 'green');
        setRagNotice(true, `${status.documents} 篇文档 · ${status.chunks} 个片段 · ${safeText(status.embedModel, '本地嵌入模型', 60)}`);
        setText('rag-hint', `本地检索已就绪 · ${safeText(status.chatModel, '本地模型', 40)}`);
      } else {
        updateBadge('rag-badge', 'Unavailable', 'amber');
        setRagNotice(false, `本地模型未就绪：${safeText(status.reason, '未知原因', 160)}`);
        setText('rag-hint', '模型未就绪时不会发送请求，也不会显示假答案。');
      }
    } catch (error) {
      ragLoaded = true;
      ragReady = false;
      updateBadge('rag-badge', 'Not connected', 'amber');
      setRagNotice(false, explainError(error));
      setText('rag-hint', '无法读取本地模型状态，暂不可提问。');
    } finally { updateControls(); }
  }

  function renderSources(sources) {
    const list = byId('rag-sources');
    list.replaceChildren();
    setText('rag-source-count', `${sources.length} 条命中`);
    if (!sources.length) {
      list.append(element('div', 'empty-inline', '本次没有返回来源片段，不能据此认为回答有依据。'));
      return;
    }
    const fragment = document.createDocumentFragment();
    sources.forEach((source, index) => {
      const row = element('div', 'rag-source');
      const body = element('div', 'rag-source-body');
      body.append(element('strong', '', safeText(source.file, '未提供文件', 160)), element('small', '', safeText(source.heading, '未提供章节', 120)));
      row.append(element('span', 'rag-source-index', String(index + 1)), body, element('span', 'rag-source-score', typeof source.score === 'number' ? source.score.toFixed(3) : '—'));
      fragment.append(row);
    });
    list.append(fragment);
  }

  async function askRag() {
    if (asking || !ragReady) return;
    const input = byId('rag-question');
    const question = input.value.trim();
    if (!question) { showToast('请先输入一个问题。'); input.focus(); return; }
    if (question.length > 400) { showToast('问题请控制在 400 字以内。'); return; }
    asking = true;
    updateControls();
    byId('rag-result').setAttribute('aria-busy', 'true');
    updateBadge('rag-answer-badge', 'Retrieving', 'neutral');
    const answerBox = byId('rag-answer');
    answerBox.className = 'rag-answer is-loading';
    answerBox.textContent = '正在本地检索并生成。27B 模型通常需要十几秒，请稍候…';
    byId('rag-sources').replaceChildren(element('div', 'empty-inline', '正在检索本地片段…'));
    setText('rag-source-count', '检索中');
    ['rag-model', 'rag-duration', 'rag-egress', 'rag-retrieval'].forEach(id => setText(id, '—'));
    setText('rag-finished-at', '等待本地模型响应');
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
      setText('rag-model', safeText(data.model, '本地模型', 60));
      setText('rag-retrieval', data.retrieval === 'semantic' ? 'semantic · local vectors' : safeText(data.retrieval, '未报告', 40));
      setText('rag-duration', typeof data.elapsedMs === 'number' ? `${Math.round(data.elapsedMs)} ms` : '未报告');
      setText('rag-egress', data.localOnly === true ? 'Loopback only' : '未确认');
      setText('rag-finished-at', `收到回答 · ${readableDate(new Date().toISOString())}`);
      renderSources(data.sources);
    } catch (error) {
      answerBox.className = 'rag-answer';
      answerBox.textContent = explainError(error) + ' 本次没有可确认的回答；不展示推测内容。';
      updateBadge('rag-answer-badge', error.kind === 'network' || error.kind === 'timeout' ? 'Unavailable' : 'Error', 'amber');
      setText('rag-finished-at', '请求未获得有效回答');
      byId('rag-sources').replaceChildren(element('div', 'empty-inline', '没有可确认的来源片段。'));
      setText('rag-source-count', '无有效来源');
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
