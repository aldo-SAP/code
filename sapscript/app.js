(function(){

  // ---------- Example ----------
  var EXAMPLE = [
"/:\tPAGE FIRST TEXT 'Erste Seite';",
"/:\tPAGE NEXT TEXT 'Folgeseite';",
"/W\tIDTVA",
"/:\tIF &T005-XEGLD& = 'X' AND &VBDKR-LAND1& <> 'FR '",
"L\tIdentification TVA : &KNA1-STCEG&",
"/:\tENDIF",
"/W\tCODARE",
"L\t&'ARE : 'KNA1-VBUND&",
"/:\tIF &T005-XEGLD& = 'X' AND &AM07M-ZSTAT& = 'N' AND &VBDKR-LAND1& <> 'FR '",
"L\t<C1>Livraison intracommunautaire en \u00e9xon\u00e9ration de TVA selon l'article",
"\t262Ter du CGI.</>",
"/:\tENDIF",
"/W\tEXEMPL",
"/:\tCASE &NAST-KSCHL&",
"/:\tWHEN 'RD01'",
"L\tExemplaire comptabilit\u00e9",
"/:\tWHEN 'RD05'",
"L\tORIGINAL",
"/:\tENDCASE"
  ].join("\n");

  // ---------- DOM refs ----------
  var pasteArea = document.getElementById('pasteArea');
  var parseBtn = document.getElementById('parseBtn');
  var exampleBtn = document.getElementById('exampleBtn');
  var clearBtn = document.getElementById('clearBtn');
  var statsBox = document.getElementById('stats');
  var validationEl = document.getElementById('validation');
  var errorBox = document.getElementById('errorBox');
  var treeEl = document.getElementById('tree');
  var codeViewEl = document.getElementById('codeView');
  var viewSelect = document.getElementById('viewSelect');
  var treePanelEl = document.querySelector('.tree-panel');
  var treeControlsEl = document.querySelector('.tree-controls');
  var treeTipEl = document.getElementById('treeTip');
  var searchBox = document.getElementById('searchBox');
  var expandAllBtn = document.getElementById('expandAll');
  var collapseAllBtn = document.getElementById('collapseAll');
  var toggleDescBtn = document.getElementById('toggleDesc');
  var themeToggle = document.getElementById('themeToggle');
  var mainEl = document.querySelector('main');
  var sidebarToggle = document.getElementById('sidebarToggle');
  var helpBtn = document.getElementById('helpBtn');
  var helpOverlay = document.getElementById('helpOverlay');
  var helpClose = document.getElementById('helpClose');

  // ---------- Theme ----------
  var savedTheme = null;
  function applyTheme(t){
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  function effectiveTheme(){
    if (savedTheme) return savedTheme;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function updateToggleLabel(){
    themeToggle.textContent = (effectiveTheme() === 'dark') ? 'Light mode' : 'Dark mode';
  }
  updateToggleLabel();
  themeToggle.addEventListener('click', function(){
    savedTheme = (effectiveTheme() === 'dark') ? 'light' : 'dark';
    applyTheme(savedTheme);
    updateToggleLabel();
  });

  sidebarToggle.addEventListener('click', function(){
    var collapsed = mainEl.classList.toggle('sidebar-collapsed');
    sidebarToggle.textContent = collapsed ? '\u00BB' : '\u00AB';
    sidebarToggle.title = collapsed ? 'Show input panel' : 'Hide input panel';
  });

  // ---------- View mode (tree / code) ----------
  function applyViewMode(){
    var mode = viewSelect.value;
    var isCode = mode === 'code';
    treePanelEl.classList.toggle('mode-code', isCode);
    treeEl.style.display = isCode ? 'none' : '';
    codeViewEl.style.display = isCode ? '' : 'none';
    toggleDescBtn.style.display = isCode ? 'none' : '';
    treeTipEl.textContent = isCode
      ? 'Tip: click the + / − to fold a block. Alt-click (or Shift-click) it to fold the whole branch at once.'
      : 'Tip: Alt-click (or Shift-click) a node to expand or collapse its whole branch at once.';
  }
  function saveViewPref(mode){
    try { localStorage.setItem('sapscript_view', mode); } catch (e) {}
  }
  (function restoreViewPref(){
    try {
      var saved = localStorage.getItem('sapscript_view');
      if (saved === 'tree' || saved === 'code') viewSelect.value = saved;
    } catch (e) {}
  })();
  viewSelect.addEventListener('change', function(){
    applyViewMode();
    saveViewPref(viewSelect.value);
  });
  applyViewMode();

  // ---------- Help modal ----------
  function openHelp(){ helpOverlay.classList.add('open'); }
  function closeHelp(){ helpOverlay.classList.remove('open'); }
  helpBtn.addEventListener('click', openHelp);
  helpClose.addEventListener('click', closeHelp);
  helpOverlay.addEventListener('click', function(e){ if (e.target === helpOverlay) closeHelp(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeHelp(); });

  // ---------- Parsing raw text into rows ----------
  function textToRows(text){
    var lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n");
    var rows = [];
    for (var i=0;i<lines.length;i++){
      var raw = lines[i];
      if (raw.trim() === '') continue;
      var col1, col2;
      var tabIdx = raw.indexOf('\t');
      if (tabIdx !== -1){
        col1 = raw.slice(0, tabIdx);
        col2 = raw.slice(tabIdx+1);
      } else {
        // fallback: split on 2+ spaces
        var m = raw.match(/^(\S*)\s{2,}(.*)$/);
        if (m){ col1 = m[1]; col2 = m[2]; }
        else { col1 = ''; col2 = raw; }
      }
      rows.push({ col1: col1, col2: col2, raw: raw, lineNo: i+1 });
    }
    return rows;
  }

  // ---------- Tree building ----------
  var idCounter;

  function buildTree(rows){
    idCounter = 1;
    var root = { id: 0, label: 'Document', type: 'root', children: [] };
    var windowNode = null;
    var elementNode = null;
    var controlStack = [];
    var lastLeaf = null;
    var counts = { windows:0, elements:0, ifBlocks:0, caseBlocks:0, textLines:0, commands:0 };
    var issues = [];
    var allGroupNodes = [];

    function addChild(parent, node){
      node.id = idCounter++;
      node.children = node.children || [];
      parent.children.push(node);
      return node;
    }
    function currentParent(){
      if (controlStack.length){
        var top = controlStack[controlStack.length-1];
        return top.branchNode || top.groupNode;
      }
      if (elementNode) return elementNode;
      if (windowNode) return windowNode;
      return root;
    }
    function findTopIdx(keyword){
      for (var i=controlStack.length-1;i>=0;i--){
        if (controlStack[i].keyword === keyword) return i;
      }
      return -1;
    }
    function popKeyword(keyword){
      var idx = findTopIdx(keyword);
      if (idx !== -1) controlStack.splice(idx);
    }

    for (var r=0;r<rows.length;r++){
      var row = rows[r];
      var c1 = row.col1.trim();
      var c2raw = row.col2;
      var c2 = c2raw.trim();

      if (c1 === '/W'){
        windowNode = addChild(root, { label: 'Window: ' + c2, type: 'window', codeCol1: '/W', codeCol2: c2, raw: row.raw, lineNo: row.lineNo });
        elementNode = null;
        controlStack = [];
        lastLeaf = null;
        counts.windows++;
        continue;
      }
      if (c1 === '/E'){
        var parentForEl = windowNode || root;
        elementNode = addChild(parentForEl, { label: 'Element: ' + c2, type: 'element', codeCol1: '/E', codeCol2: c2, raw: row.raw, lineNo: row.lineNo });
        controlStack = [];
        lastLeaf = null;
        counts.elements++;
        continue;
      }
      if (c1 === '/:'){
        var m = c2.match(/^([A-Za-z][A-Za-z-]*)/);
        var kw = m ? m[1].toUpperCase() : '';
        var rest = m ? c2.slice(m[0].length).trim() : c2;

        if (kw === 'IF'){
          var g = addChild(currentParent(), { label: 'IF / ENDIF', type: 'group-if', blockKeyword: 'IF', raw: row.raw, lineNo: row.lineNo });
          allGroupNodes.push(g);
          var b = addChild(g, { label: 'IF ' + rest, codeCol2: c2, type: 'branch', raw: row.raw, lineNo: row.lineNo });
          controlStack.push({ keyword:'IF', groupNode:g, branchNode:b });
          lastLeaf = null; counts.ifBlocks++; continue;
        }
        if (kw === 'ELSEIF'){
          var idxIf = findTopIdx('IF');
          if (idxIf !== -1){
            var top = controlStack[idxIf];
            var br = addChild(top.groupNode, { label: 'ELSEIF ' + rest, codeCol2: c2, type: 'branch', raw: row.raw, lineNo: row.lineNo });
            top.branchNode = br;
          } else {
            var issElseif = addChild(currentParent(), { type: 'issue', label: 'ELSEIF with no matching IF', raw: row.raw, lineNo: row.lineNo });
            issues.push({ lineNo: row.lineNo, message: 'Line ' + row.lineNo + ': ELSEIF with no matching IF', nodeId: issElseif.id });
          }
          lastLeaf = null; continue;
        }
        if (kw === 'ELSE'){
          var idxIf2 = findTopIdx('IF');
          if (idxIf2 !== -1){
            var top2 = controlStack[idxIf2];
            var br2 = addChild(top2.groupNode, { label: 'ELSE', codeCol2: c2, type: 'branch', raw: row.raw, lineNo: row.lineNo });
            top2.branchNode = br2;
          } else {
            var issElse = addChild(currentParent(), { type: 'issue', label: 'ELSE with no matching IF', raw: row.raw, lineNo: row.lineNo });
            issues.push({ lineNo: row.lineNo, message: 'Line ' + row.lineNo + ': ELSE with no matching IF', nodeId: issElse.id });
          }
          lastLeaf = null; continue;
        }
        if (kw === 'ENDIF'){
          var idxEndIf = findTopIdx('IF');
          if (idxEndIf !== -1){
            controlStack[idxEndIf].groupNode.endCol2 = c2; controlStack[idxEndIf].groupNode.endLineNo = row.lineNo;
            popKeyword('IF');
          } else {
            var issEndif = addChild(currentParent(), { type: 'issue', label: 'ENDIF with no matching IF', raw: row.raw, lineNo: row.lineNo });
            issues.push({ lineNo: row.lineNo, message: 'Line ' + row.lineNo + ': ENDIF with no matching IF', nodeId: issEndif.id });
          }
          lastLeaf = null; continue;
        }

        if (kw === 'CASE'){
          var gc = addChild(currentParent(), { label: 'CASE ' + rest + ' / ENDCASE', codeCol1: '/:', codeCol2: c2, type: 'group-case', blockKeyword: 'CASE', raw: row.raw, lineNo: row.lineNo });
          allGroupNodes.push(gc);
          controlStack.push({ keyword:'CASE', groupNode: gc, branchNode: null });
          lastLeaf = null; counts.caseBlocks++; continue;
        }
        if (kw === 'WHEN'){
          var idxCase = findTopIdx('CASE');
          if (idxCase !== -1){
            var topc = controlStack[idxCase];
            var brc = addChild(topc.groupNode, { label: 'WHEN ' + rest, codeCol2: c2, type: 'branch', raw: row.raw, lineNo: row.lineNo });
            topc.branchNode = brc;
          } else {
            var issWhen = addChild(currentParent(), { type: 'issue', label: 'WHEN with no matching CASE', raw: row.raw, lineNo: row.lineNo });
            issues.push({ lineNo: row.lineNo, message: 'Line ' + row.lineNo + ': WHEN with no matching CASE', nodeId: issWhen.id });
          }
          lastLeaf = null; continue;
        }
        if (kw === 'ENDCASE'){
          var idxEndCase = findTopIdx('CASE');
          if (idxEndCase !== -1){
            controlStack[idxEndCase].groupNode.endCol2 = c2; controlStack[idxEndCase].groupNode.endLineNo = row.lineNo;
            popKeyword('CASE');
          } else {
            var issEndcase = addChild(currentParent(), { type: 'issue', label: 'ENDCASE with no matching CASE', raw: row.raw, lineNo: row.lineNo });
            issues.push({ lineNo: row.lineNo, message: 'Line ' + row.lineNo + ': ENDCASE with no matching CASE', nodeId: issEndcase.id });
          }
          lastLeaf = null; continue;
        }

        if (kw === 'PROTECT'){
          var gp = addChild(currentParent(), { label: 'PROTECT / ENDPROTECT', codeCol1: '/:', codeCol2: c2, type: 'group-protect', blockKeyword: 'PROTECT', raw: row.raw, lineNo: row.lineNo });
          allGroupNodes.push(gp);
          controlStack.push({ keyword:'PROTECT', groupNode: gp, branchNode: gp });
          lastLeaf = null; continue;
        }
        if (kw === 'ENDPROTECT'){
          var idxEndProt = findTopIdx('PROTECT');
          if (idxEndProt !== -1){
            controlStack[idxEndProt].groupNode.endCol2 = c2; controlStack[idxEndProt].groupNode.endLineNo = row.lineNo;
            popKeyword('PROTECT');
          } else {
            var issEndprot = addChild(currentParent(), { type: 'issue', label: 'ENDPROTECT with no matching PROTECT', raw: row.raw, lineNo: row.lineNo });
            issues.push({ lineNo: row.lineNo, message: 'Line ' + row.lineNo + ': ENDPROTECT with no matching PROTECT', nodeId: issEndprot.id });
          }
          lastLeaf = null; continue;
        }

        if (kw === 'ADDRESS'){
          var ga = addChild(currentParent(), { label: 'ADDRESS ' + rest + ' / ENDADDRESS', codeCol1: '/:', codeCol2: c2, type: 'group-address', blockKeyword: 'ADDRESS', raw: row.raw, lineNo: row.lineNo });
          allGroupNodes.push(ga);
          controlStack.push({ keyword:'ADDRESS', groupNode: ga, branchNode: ga });
          lastLeaf = null; continue;
        }
        if (kw === 'ENDADDRESS'){
          var idxEndAddr = findTopIdx('ADDRESS');
          if (idxEndAddr !== -1){
            controlStack[idxEndAddr].groupNode.endCol2 = c2; controlStack[idxEndAddr].groupNode.endLineNo = row.lineNo;
            popKeyword('ADDRESS');
          } else {
            var issEndaddr = addChild(currentParent(), { type: 'issue', label: 'ENDADDRESS with no matching ADDRESS', raw: row.raw, lineNo: row.lineNo });
            issues.push({ lineNo: row.lineNo, message: 'Line ' + row.lineNo + ': ENDADDRESS with no matching ADDRESS', nodeId: issEndaddr.id });
          }
          lastLeaf = null; continue;
        }

        // generic control command: PAGE, DEFINE, SET, PERFORM, INCLUDE, STYLE, FORMAT,
        // RESET, NEW-PAGE, SUMMING, PRINT-CONTROL, TOP, BOTTOM, BOX, POSITION, SIZE, ORIGIN...
        // consecutive commands with the SAME keyword (e.g. a run of PARAGRAPH or STRING
        // or WINDOW or PAGE declarations at the top of the script) are folded into one
        // collapsible group instead of staying a long flat list.
        var genParent = currentParent();
        var genSiblings = genParent.children;
        var genPrev = genSiblings.length ? genSiblings[genSiblings.length - 1] : null;
        var genGroup = null;

        if (genPrev && genPrev.type === 'group-defs' && genPrev.keyword === kw){
          genGroup = genPrev;
        } else if (genPrev && genPrev.type === 'command' && genPrev.keyword === kw){
          genGroup = { id: idCounter++, label: '', type: 'group-defs', keyword: kw, children: [] };
          genSiblings[genSiblings.length - 1] = genGroup;
          genGroup.children.push(genPrev);
        }

        if (genGroup){
          lastLeaf = addChild(genGroup, { label: c2, type: 'command', keyword: kw, raw: row.raw, lineNo: row.lineNo });
          genGroup.label = kw + ' definitions (' + genGroup.children.length + ')';
        } else {
          lastLeaf = addChild(genParent, { label: c2, type: 'command', keyword: kw, raw: row.raw, lineNo: row.lineNo });
        }
        counts.commands++;
        continue;
      }

      // continuation line (blank first column) -> "Continuous text": stays on the same line
      if (c1 === ''){
        if (lastLeaf){
          // merge into whichever field this node actually displays from
          if (lastLeaf.text !== undefined) lastLeaf.text += ' ' + c2;
          else lastLeaf.label += ' ' + c2;
          lastLeaf.lineNoEnd = row.lineNo;
        } else {
          lastLeaf = addChild(currentParent(), { label: c2, type:'text', raw: row.raw, lineNo: row.lineNo });
          counts.textLines++;
        }
        continue;
      }

      // fixed line-type symbols (SAPSCRIPT column-1 codes that are not paragraph names)
      var SPECIAL_CODES = {
        '/*': { label: 'Comment',                         type: 'comment' },
        '/=': { label: 'Line feed + extended line',        type: 'text' },
        '/(': { label: 'Line feed + raw line',              type: 'text' },
        '/':  { label: 'Line feed',                         type: 'text' },
        '=':  { label: 'Extended line',                     type: 'text' },
        '(':  { label: 'Raw line',                          type: 'text' }
      };
      if (SPECIAL_CODES.hasOwnProperty(c1)){
        var sc = SPECIAL_CODES[c1];
        lastLeaf = addChild(currentParent(), { codeTag: c1, codeDesc: sc.label, text: c2, type: sc.type, raw: row.raw, lineNo: row.lineNo });
        counts.textLines++;
        continue;
      }

      // ordinary paragraph-format line (L, *, or a custom paragraph name)
      var pDesc = (c1 === '*') ? 'Default paragraph' : null;
      lastLeaf = addChild(currentParent(), { codeTag: c1, codeDesc: pDesc, text: c2, type: 'text', paragraph: c1, raw: row.raw, lineNo: row.lineNo });
      counts.textLines++;
    }

    // any IF/CASE/PROTECT/ADDRESS block that never saw its matching END keyword
    // (interrupted by a new /W, /E, or the end of the script) — flag it in place
    for (var gi = 0; gi < allGroupNodes.length; gi++){
      var gn = allGroupNodes[gi];
      if (gn.endLineNo === undefined){
        gn.missingEnd = true;
        gn.label += '  — ⚠ MISSING END' + gn.blockKeyword;
        issues.push({
          lineNo: gn.lineNo,
          message: 'Line ' + gn.lineNo + ': ' + gn.blockKeyword + ' is never closed (missing END' + gn.blockKeyword + ')',
          nodeId: gn.id
        });
      }
    }
    issues.sort(function(a, b){ return (a.lineNo||0) - (b.lineNo||0); });

    return { root: root, counts: counts, totalLines: rows.length, issues: issues };
  }

  // ---------- Rendering ----------
  var ICONS = {
    'root': '',
    'window': '\u25A3',
    'element': '\u25A2',
    'group-if': '\u2B87',
    'group-case': '\u21C6',
    'group-protect': '\u1F512'.length ? '\uD83D\uDD12' : '',
    'group-address': '\uD83D\uDCC7',
    'branch': '\u21B3',
    'group-defs': '\u2261',
    'command': '\u2699',
    'text': '\u2022',
    'comment': '#',
    'issue': '\u26a0'
  };

  function escapeHtml(s){
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function highlightFieldSymbols(escaped){
    return escaped.replace(/&amp;([^&\n]{1,60}?)&amp;/g, '<span class="field-sym">&amp;$1&amp;</span>');
  }

  function buildLabelHTML(node){
    if (node.codeTag !== undefined && node.codeTag !== null){
      var tag = escapeHtml(node.codeTag);
      var descHtml = node.codeDesc ? ('<span class="code-desc">  ' + escapeHtml(node.codeDesc) + '</span>') : '';
      var textHtml = highlightFieldSymbols(escapeHtml(node.text || ''));
      return '<span class="code-tag">[' + tag + descHtml + ']</span> ' + textHtml;
    }
    var esc = escapeHtml(node.label);
    return highlightFieldSymbols(esc);
  }

  function setCollapsed(li, collapsed){
    if (collapsed) li.classList.add('collapsed');
    else li.classList.remove('collapsed');
    var toggle = li.querySelector(':scope > .node > .toggle');
    if (toggle && !toggle.classList.contains('leaf')){
      toggle.textContent = collapsed ? '\u25B8' : '\u25BE';
    }
  }
  function setCollapsedRecursive(li, collapsed){
    setCollapsed(li, collapsed);
    var childLis = li.querySelectorAll(':scope > ul > li');
    childLis.forEach(function(cli){ setCollapsedRecursive(cli, collapsed); });
  }

  function renderNode(node){
    var li = document.createElement('li');
    li.className = 'type-' + node.type;
    if (node.missingEnd) li.classList.add('has-issue');
    var hasChildren = node.children && node.children.length > 0;

    var row = document.createElement('div');
    row.className = 'node';
    row.dataset.id = node.id;

    var toggle = document.createElement('span');
    toggle.className = 'toggle' + (hasChildren ? '' : ' leaf');
    toggle.textContent = hasChildren ? '\u25BE' : '\u2022';
    row.appendChild(toggle);

    var icon = document.createElement('span');
    icon.className = 'badge';
    icon.textContent = ICONS[node.type] || '';
    row.appendChild(icon);

    var label = document.createElement('span');
    label.className = 'label';
    label.innerHTML = buildLabelHTML(node);
    if (node.raw) row.title = 'Line ' + node.lineNo + ': ' + node.raw;
    row.appendChild(label);

    li.appendChild(row);

    if (hasChildren){
      if (node.type === 'group-defs'){
        li.classList.add('collapsed');
        toggle.textContent = '\u25B8';
      }
      row.title = (row.title ? row.title + '\n' : '') + 'Click to expand/collapse. Alt-click (or Shift-click) to expand/collapse the whole branch.';
      row.addEventListener('click', function(e){
        var collapsed = !li.classList.contains('collapsed');
        if (e.altKey || e.shiftKey) setCollapsedRecursive(li, collapsed);
        else setCollapsed(li, collapsed);
      });
      var ul = document.createElement('ul');
      for (var i=0;i<node.children.length;i++){
        ul.appendChild(renderNode(node.children[i]));
      }
      li.appendChild(ul);
    }
    return li;
  }

  function renderTree(root){
    treeEl.innerHTML = '';
    if (!root.children || !root.children.length){
      var p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = 'No rows parsed. Check that your script has a command and text column separated by a tab.';
      treeEl.appendChild(p);
      return;
    }
    var ul = document.createElement('ul');
    for (var i=0;i<root.children.length;i++){
      ul.appendChild(renderNode(root.children[i]));
    }
    treeEl.appendChild(ul);
  }

  // ---------- Code view (ABAP-editor style: tag / fold / line-no / code) ----------
  // Columns 1-3 (tag, fold, line-no) are fixed-width and never move. Only the
  // code text itself (column 4) shifts right to show nesting.
  function codeTextHTML(s){
    return highlightFieldSymbols(escapeHtml(s || ''));
  }

  function lineNoDisplay(lineNo, lineNoEnd){
    if (lineNo === undefined || lineNo === null || lineNo === '') return '–';
    if (lineNoEnd && lineNoEnd !== lineNo) return lineNo + '–' + lineNoEnd;
    return String(lineNo);
  }

  function setFoldCollapsed(li, collapsed){
    if (collapsed) li.classList.add('collapsed');
    else li.classList.remove('collapsed');
    var foldEl = li.querySelector(':scope > .code-row > .code-fold');
    if (foldEl && !foldEl.classList.contains('code-fold-empty')){
      foldEl.textContent = collapsed ? '+' : '−';
    }
  }
  function setFoldCollapsedRecursive(li, collapsed){
    setFoldCollapsed(li, collapsed);
    li.querySelectorAll(':scope > ul > li').forEach(function(cli){ setFoldCollapsedRecursive(cli, collapsed); });
  }

  function newCodeRow(col1, lineNoText, textHTML, foldable, depth, id){
    var row = document.createElement('div');
    row.className = 'code-row';
    if (id !== undefined && id !== null) row.dataset.id = String(id);

    var fold = document.createElement('span');
    fold.className = 'code-fold' + (foldable ? '' : ' code-fold-empty');
    if (foldable) fold.textContent = '−';
    row.appendChild(fold);

    var tag = document.createElement('span');
    tag.className = 'code-tag';
    tag.textContent = col1 || '';
    row.appendChild(tag);

    var lno = document.createElement('span');
    lno.className = 'code-lno';
    lno.textContent = lineNoText;
    row.appendChild(lno);

    var text = document.createElement('span');
    text.className = 'code-text';
    for (var gi = 0; gi < depth; gi++){
      var guide = document.createElement('span');
      guide.className = 'indent-guide';
      text.appendChild(guide);
    }
    var content = document.createElement('span');
    content.className = 'code-text-content';
    content.innerHTML = textHTML;
    text.appendChild(content);
    row.appendChild(text);

    return { row: row, fold: fold };
  }

  function appendFoldableRow(parentUl, col1, lineNoText, textHTML, typeClass, childNodes, defaultCollapsed, depth, childDepth, id){
    var li = document.createElement('li');
    li.className = 'code-item type-' + typeClass;
    var hasChildren = childNodes && childNodes.length > 0;
    var built = newCodeRow(col1, lineNoText, textHTML, hasChildren, depth, id);
    li.appendChild(built.row);

    if (hasChildren){
      var childUl = document.createElement('ul');
      childNodes.forEach(function(c){ appendCodeNode(childUl, c, childDepth); });
      li.appendChild(childUl);
      built.row.style.cursor = 'pointer';
      if (defaultCollapsed) setFoldCollapsed(li, true);
      built.fold.addEventListener('click', function(e){
        e.stopPropagation();
        var collapsed = !li.classList.contains('collapsed');
        if (e.altKey || e.shiftKey) setFoldCollapsedRecursive(li, collapsed);
        else setFoldCollapsed(li, collapsed);
      });
      built.row.addEventListener('click', function(e){
        if (e.target === built.fold) return; // fold icon already handled its own click
        var collapsed = !li.classList.contains('collapsed');
        if (e.altKey || e.shiftKey) setFoldCollapsedRecursive(li, collapsed);
        else setFoldCollapsed(li, collapsed);
      });
      built.row.title = 'Click to expand/collapse. Alt-click (or Shift-click) to expand/collapse the whole branch.';
    }
    parentUl.appendChild(li);
    return li;
  }

  function appendSimpleRow(parentUl, col1, lineNoText, textHTML, typeClass, depth, id){
    var li = document.createElement('li');
    li.className = 'code-item type-' + typeClass;
    var built = newCodeRow(col1, lineNoText, textHTML, false, depth, id);
    li.appendChild(built.row);
    parentUl.appendChild(li);
    return li;
  }

  function appendClosingRow(ul, node, depth, endLabel){
    // renders the ENDIF/ENDCASE/ENDPROTECT/ENDADDRESS line — or, if the block was
    // never actually closed in the source, a flagged warning row in its place
    if (node.endLineNo !== undefined){
      appendSimpleRow(ul, '/:', lineNoDisplay(node.endLineNo), codeTextHTML(node.endCol2 || endLabel), 'command', depth, node.id + '_end');
    } else {
      appendSimpleRow(ul, '⚠', lineNoDisplay(null), codeTextHTML('Missing ' + endLabel + ' — ' + node.blockKeyword + ' opened at line ' + node.lineNo + ' is never closed'), 'issue', depth, node.id + '_end');
    }
  }

  function appendCodeNode(ul, node, depth){
    switch (node.type){
      case 'window':
        appendFoldableRow(ul, node.codeCol1, lineNoDisplay(node.lineNo), codeTextHTML(node.codeCol2), 'window', node.children, false, depth, depth+1, node.id);
        break;
      case 'element':
        appendFoldableRow(ul, node.codeCol1, lineNoDisplay(node.lineNo), codeTextHTML(node.codeCol2), 'element', node.children, false, depth, depth+1, node.id);
        break;
      case 'group-defs':
        // folded PARAGRAPH/STRING/WINDOW/PAGE-style definition run — collapsed by default, same as the tree
        appendFoldableRow(ul, '/:', lineNoDisplay(null), codeTextHTML(node.label), 'group-defs', node.children, true, depth, depth+1, node.id);
        break;
      case 'group-if':
        // no row of its own: IF/ELSEIF/ELSE are already rows (each individually foldable) at the SAME depth; ENDIF closes it
        node.children.forEach(function(branch){ appendCodeNode(ul, branch, depth); });
        appendClosingRow(ul, node, depth, 'ENDIF');
        break;
      case 'group-case':
        appendFoldableRow(ul, node.codeCol1, lineNoDisplay(node.lineNo), codeTextHTML(node.codeCol2), 'command', node.children, false, depth, depth+1, node.id);
        appendClosingRow(ul, node, depth, 'ENDCASE');
        break;
      case 'group-protect':
        appendFoldableRow(ul, node.codeCol1, lineNoDisplay(node.lineNo), codeTextHTML(node.codeCol2), 'command', node.children, false, depth, depth+1, node.id);
        appendClosingRow(ul, node, depth, 'ENDPROTECT');
        break;
      case 'group-address':
        appendFoldableRow(ul, node.codeCol1, lineNoDisplay(node.lineNo), codeTextHTML(node.codeCol2), 'command', node.children, false, depth, depth+1, node.id);
        appendClosingRow(ul, node, depth, 'ENDADDRESS');
        break;
      case 'branch':
        appendFoldableRow(ul, '/:', lineNoDisplay(node.lineNo), codeTextHTML(node.codeCol2 || node.label), 'branch', node.children, false, depth, depth+1, node.id);
        break;
      case 'command':
        appendSimpleRow(ul, '/:', lineNoDisplay(node.lineNo), codeTextHTML(node.label), 'command', depth, node.id);
        break;
      case 'issue':
        appendSimpleRow(ul, '⚠', lineNoDisplay(node.lineNo), codeTextHTML(node.label), 'issue', depth, node.id);
        break;
      default: { // text, comment
        var col1 = (node.codeTag !== undefined && node.codeTag !== null) ? node.codeTag : (node.paragraph || '');
        var col2 = (node.text !== undefined) ? node.text : node.label;
        appendSimpleRow(ul, col1, lineNoDisplay(node.lineNo, node.lineNoEnd), codeTextHTML(col2), node.type, depth, node.id);
      }
    }
  }

  function renderCodeView(root){
    codeViewEl.innerHTML = '';
    if (!root.children || !root.children.length){
      var p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = 'No rows parsed. Check that your script has a command and text column separated by a tab.';
      codeViewEl.appendChild(p);
      return;
    }
    var ul = document.createElement('ul');
    ul.className = 'code-tree';
    root.children.forEach(function(c){ appendCodeNode(ul, c, 0); });
    codeViewEl.appendChild(ul);
  }

  function codeExpandCollapseAll(collapsed){
    codeViewEl.querySelectorAll('.code-tree li').forEach(function(li){
      if (li.querySelector(':scope > ul')) setFoldCollapsed(li, collapsed);
    });
  }

  // ---------- Controls ----------
  function setError(msg){
    if (msg){ errorBox.textContent = msg; errorBox.style.display = 'block'; }
    else { errorBox.style.display = 'none'; errorBox.textContent = ''; }
  }

  // ---------- Validation log: jump to the offending line in whichever view is active ----------
  function jumpToIssue(nodeId){
    var isCode = viewSelect.value === 'code';
    var container = isCode ? codeViewEl : treeEl;
    var target = container.querySelector('[data-id="' + nodeId + '"]');
    if (!target){
      // the row may only exist in the other view (shouldn't normally happen, but fall back safely)
      var other = (isCode ? treeEl : codeViewEl).querySelector('[data-id="' + nodeId + '"]');
      if (!other) return;
      viewSelect.value = isCode ? 'tree' : 'code';
      applyViewMode();
      container = isCode ? treeEl : codeViewEl;
      target = container.querySelector('[data-id="' + nodeId + '"]');
      if (!target) return;
    }
    var li = target.closest('li');
    var parentLi = li ? li.parentElement.closest('li') : null;
    while (parentLi){
      if (isCode) setFoldCollapsed(parentLi, false); else setCollapsed(parentLi, false);
      parentLi = parentLi.parentElement.closest('li');
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('jump-flash');
    void target.offsetWidth; // restart animation if clicked twice
    target.classList.add('jump-flash');
  }

  function renderValidation(issues){
    validationEl.innerHTML = '';
    if (!issues || !issues.length){
      var ok = document.createElement('div');
      ok.className = 'validation-ok';
      ok.textContent = '✓ No structural issues found';
      validationEl.appendChild(ok);
      return;
    }
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'validation-toggle';
    toggle.textContent = '⚠ ' + issues.length + ' structural issue' + (issues.length === 1 ? '' : 's') + ' found — click to view';
    var list = document.createElement('ul');
    list.className = 'validation-list';
    list.style.display = 'none';
    issues.forEach(function(iss){
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'validation-item';
      var lineSpan = document.createElement('span');
      lineSpan.className = 'vline';
      lineSpan.textContent = 'Line ' + iss.lineNo + '  ';
      btn.appendChild(lineSpan);
      btn.appendChild(document.createTextNode(iss.message.replace(/^Line \d+:\s*/, '')));
      btn.addEventListener('click', function(){ jumpToIssue(iss.nodeId); });
      li.appendChild(btn);
      list.appendChild(li);
    });
    toggle.addEventListener('click', function(){
      list.style.display = (list.style.display === 'none') ? '' : 'none';
    });
    validationEl.appendChild(toggle);
    validationEl.appendChild(list);
  }

  function runParse(text){
    setError('');
    if (!text || !text.trim()){
      setError('Paste or upload some SAPSCRIPT text first.');
      return;
    }
    var rows = textToRows(text);
    var result;
    try {
      result = buildTree(rows);
    } catch (e){
      setError('Could not parse this text: ' + e.message);
      return;
    }
    renderTree(result.root);
    renderCodeView(result.root);
    renderValidation(result.issues);
    var statItems = [
      [result.totalLines, 'lines'],
      [result.counts.windows, 'windows'],
      [result.counts.elements, 'elements'],
      [result.counts.ifBlocks, 'IF blocks'],
      [result.counts.caseBlocks, 'CASE blocks'],
      [result.counts.textLines, 'text lines']
    ];
    statsBox.innerHTML = statItems.map(function(it){
      return '<div class="stat-cell"><b>' + it[0] + '</b><span>' + it[1] + '</span></div>';
    }).join('');
    searchBox.value = '';
  }

  parseBtn.addEventListener('click', function(){ runParse(pasteArea.value); });
  exampleBtn.addEventListener('click', function(){ pasteArea.value = EXAMPLE; runParse(EXAMPLE); });
  clearBtn.addEventListener('click', function(){
    pasteArea.value = '';
    statsBox.innerHTML = '';
    validationEl.innerHTML = '';
    setError('');
    treeEl.innerHTML = '<p class="empty-state">Paste a script, then click "Build tree".</p>';
    codeViewEl.innerHTML = '<p class="empty-state">Paste a script, then click "Build tree".</p>';
  });

  expandAllBtn.addEventListener('click', function(){
    if (viewSelect.value === 'code'){ codeExpandCollapseAll(false); return; }
    treeEl.querySelectorAll('#tree li').forEach(function(li){
      if (li.querySelector(':scope > ul')) setCollapsed(li, false);
    });
  });
  collapseAllBtn.addEventListener('click', function(){
    if (viewSelect.value === 'code'){ codeExpandCollapseAll(true); return; }
    treeEl.querySelectorAll('#tree li').forEach(function(li){
      if (li.querySelector(':scope > ul')) setCollapsed(li, true);
    });
  });

  toggleDescBtn.addEventListener('click', function(){
    var on = treeEl.classList.toggle('show-desc');
    toggleDescBtn.textContent = on ? 'Hide descriptions' : 'Show descriptions';
  });

  // Filtering: fold shut every branch that doesn't contain the query anywhere
  // inside it (its row stays visible, just collapsed, so the surrounding
  // structure and what comes after it is still there), while keeping the
  // path down to each match (its ancestors) expanded. Nothing is ever
  // removed from view — only folded — so the full hierarchy and sequence
  // of lines stays intact. Applied to both the tree and the code view, in
  // lockstep, so switching views mid-filter keeps the same filtered state.
  function walkTreeFilter(li, q){
    var node = li.querySelector(':scope > .node');
    var label = node ? node.querySelector('.label') : null;
    var selfMatch = !!(label && label.textContent.toLowerCase().indexOf(q) !== -1);
    var childUl = li.querySelector(':scope > ul');
    var childMatch = false;
    if (childUl){
      Array.prototype.forEach.call(childUl.children, function(cli){
        if (walkTreeFilter(cli, q)) childMatch = true;
      });
    }
    if (node) node.classList.toggle('match', selfMatch);
    if (childUl) setCollapsed(li, !childMatch);
    return selfMatch || childMatch;
  }
  function filterTreeView(q){
    Array.prototype.forEach.call(treeEl.querySelectorAll(':scope > ul > li'), function(li){
      walkTreeFilter(li, q);
    });
  }
  function clearTreeFilter(){
    treeEl.querySelectorAll('.node.match').forEach(function(n){ n.classList.remove('match'); });
    treeEl.querySelectorAll('li').forEach(function(li){
      if (li.querySelector(':scope > ul')) setCollapsed(li, false);
    });
  }

  function walkCodeFilter(li, q){
    var row = li.querySelector(':scope > .code-row');
    var tagEl = row ? row.querySelector(':scope > .code-tag') : null;
    var contentEl = row ? row.querySelector('.code-text-content') : null;
    var matchText = ((tagEl ? tagEl.textContent : '') + ' ' + (contentEl ? contentEl.textContent : '')).toLowerCase();
    var selfMatch = matchText.indexOf(q) !== -1;
    var childUl = li.querySelector(':scope > ul');
    var childMatch = false;
    if (childUl){
      Array.prototype.forEach.call(childUl.children, function(cli){
        if (walkCodeFilter(cli, q)) childMatch = true;
      });
    }
    if (row) row.classList.toggle('match', selfMatch);
    if (childUl) setFoldCollapsed(li, !childMatch);
    return selfMatch || childMatch;
  }
  function filterCodeView(q){
    Array.prototype.forEach.call(codeViewEl.querySelectorAll(':scope > ul > li'), function(li){
      walkCodeFilter(li, q);
    });
  }
  function clearCodeFilter(){
    codeViewEl.querySelectorAll('.code-row.match').forEach(function(r){ r.classList.remove('match'); });
    codeViewEl.querySelectorAll('.code-item').forEach(function(li){
      if (li.querySelector(':scope > ul')) setFoldCollapsed(li, false);
    });
  }

  searchBox.addEventListener('input', function(){
    var q = searchBox.value.trim().toLowerCase();
    if (!q){
      clearTreeFilter();
      clearCodeFilter();
      return;
    }
    filterTreeView(q);
    filterCodeView(q);
  });

})();
