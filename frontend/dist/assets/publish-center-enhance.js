(function () {
  "use strict";

  var TEMPLATE_KEY = "auto-upload:publish-center:copy-templates";
  var HISTORY_KEY = "auto-upload:publish-center:topic-history";
  var AI_TOGGLE_KEY = "auto-upload:publish-center:tencent-ai-annotation";
  var STYLE_ID = "pcx-enhance-style";
  var TEMPLATE_PANEL_ID = "pcx-template-panel";
  var HISTORY_PANEL_ID = "pcx-topic-history";
  var AI_TOGGLE_ID = "pcx-ai-annotation-toggle";
  var MAX_TEMPLATES = 100;
  var MAX_HISTORY = 200;

  var runtime = {
    topicObserver: null,
    lastTopicHost: null,
    lastSelectedTopics: [],
    payloadHookInstalled: false
  };

  function safeParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function readTemplates() {
    var value = safeParse(localStorage.getItem(TEMPLATE_KEY), []);
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter(function (item) {
        return item && typeof item.content === "string";
      })
      .map(function (item) {
        return {
          id: String(item.id || Date.now() + Math.random()),
          name: String(item.name || "未命名模板"),
          content: String(item.content || ""),
          updatedAt: Number(item.updatedAt || Date.now())
        };
      })
      .sort(function (a, b) {
        return b.updatedAt - a.updatedAt;
      })
      .slice(0, MAX_TEMPLATES);
  }

  function writeTemplates(templates) {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates.slice(0, MAX_TEMPLATES)));
  }

  function readHistory() {
    var value = safeParse(localStorage.getItem(HISTORY_KEY), []);
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map(function (item) {
        return {
          topic: cleanTopic(item && item.topic),
          useCount: Number((item && item.useCount) || 0),
          lastUsedAt: Number((item && item.lastUsedAt) || 0)
        };
      })
      .filter(function (item) {
        return Boolean(item.topic);
      })
      .sort(function (a, b) {
        return b.lastUsedAt - a.lastUsedAt;
      })
      .slice(0, MAX_HISTORY);
  }

  function writeHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  }

  function cleanTopic(topic) {
    return String(topic || "")
      .replace(/^#+/, "")
      .replace(/[xX\u00D7\u2715]\s*$/, "")
      .trim();
  }

  function isPublishCenterRoute() {
    var url = (window.location.pathname + " " + window.location.hash).toLowerCase();
    return url.indexOf("publish-center") !== -1 || url.indexOf("\u53D1\u5E03\u4E2D\u5FC3") !== -1;
  }

  function setNativeValue(element, value) {
    var prototype = element.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findTitleField() {
    var textareas = Array.prototype.slice.call(document.querySelectorAll("textarea"));
    var matched = null;
    textareas.some(function (textarea) {
      var host = textarea.closest(".el-form-item") || textarea.parentElement;
      var hostText = host ? host.innerText || "" : "";
      if (/\u4F5C\u54C1\u6587\u6848|\u53D1\u5E03\u5185\u5BB9|\u6587\u6848/.test(hostText)) {
        matched = { textarea: textarea, host: host };
        return true;
      }
      return false;
    });
    if (matched) {
      return matched;
    }
    if (textareas.length > 0) {
      var first = textareas[0];
      return { textarea: first, host: first.closest(".el-form-item") || first.parentElement };
    }
    return null;
  }

  function findTopicField() {
    var inputs = Array.prototype.slice.call(document.querySelectorAll("input"));
    var candidates = inputs.filter(function (input) {
      var type = (input.getAttribute("type") || "text").toLowerCase();
      return type === "text" || type === "search";
    });
    for (var i = 0; i < candidates.length; i += 1) {
      var input = candidates[i];
      var host = input.closest(".el-form-item") || input.parentElement;
      var hostText = host ? host.innerText || "" : "";
      if (/\u8BDD\u9898/.test(hostText) && /\u6DFB\u52A0/.test(hostText)) {
        return {
          input: input,
          host: host,
          addButton: findButtonByText(host, /\u6DFB\u52A0|Add/i)
        };
      }
    }
    return null;
  }

  function findButtonByText(root, pattern) {
    if (!root) {
      return null;
    }
    var buttons = Array.prototype.slice.call(root.querySelectorAll("button"));
    for (var i = 0; i < buttons.length; i += 1) {
      var button = buttons[i];
      if (pattern.test((button.innerText || "").trim())) {
        return button;
      }
    }
    return null;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".pcx-panel{margin-top:8px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;}",
      ".pcx-panel-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;}",
      ".pcx-title{font-size:12px;font-weight:600;color:#374151;}",
      ".pcx-row{display:flex;flex-wrap:wrap;gap:6px;}",
      ".pcx-btn{border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:2px 8px;line-height:20px;font-size:12px;cursor:pointer;}",
      ".pcx-btn:hover{border-color:#93c5fd;color:#2563eb;}",
      ".pcx-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid #d1d5db;background:#fff;border-radius:999px;padding:2px 8px;font-size:12px;}",
      ".pcx-chip-main{border:none;background:transparent;cursor:pointer;padding:0;color:#374151;}",
      ".pcx-chip-main:hover{color:#2563eb;}",
      ".pcx-chip-del{border:none;background:transparent;cursor:pointer;padding:0;color:#9ca3af;font-size:12px;}",
      ".pcx-chip-del:hover{color:#ef4444;}",
      ".pcx-muted{font-size:12px;color:#9ca3af;}",
      ".pcx-ai-toggle{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border:1px solid #d1d5db;border-radius:999px;background:#fff;font-size:12px;font-weight:600;color:#374151;cursor:pointer;user-select:none;white-space:nowrap;flex:0 0 auto;}",
      ".pcx-ai-toggle:hover{border-color:#93c5fd;color:#2563eb;}",
      ".pcx-ai-toggle input{margin:0;cursor:pointer;accent-color:#2563eb;}"
    ].join("");
    document.head.appendChild(style);
  }

  function isAiAnnotationEnabled() {
    return localStorage.getItem(AI_TOGGLE_KEY) === "1";
  }

  function setAiAnnotationEnabled(enabled) {
    localStorage.setItem(AI_TOGGLE_KEY, enabled ? "1" : "0");
  }

  function findPrepareActionBar() {
    var strongs = Array.prototype.slice.call(document.querySelectorAll("strong"));
    for (var i = 0; i < strongs.length; i += 1) {
      if ((strongs[i].innerText || "").trim() === "\u51C6\u5907\u53D1\u5E03") {
        return strongs[i].closest("section") || strongs[i].parentElement;
      }
    }
    return null;
  }

  function mountAiAnnotationToggle() {
    var bar = findPrepareActionBar();
    if (!bar || bar.querySelector("#" + AI_TOGGLE_ID)) {
      return;
    }
    var button = bar.querySelector(".el-button") || bar.querySelector("button");

    var label = document.createElement("label");
    label.id = AI_TOGGLE_ID;
    label.className = "pcx-ai-toggle";
    label.title =
      "\u52FE\u9009\u540E\uFF0C\u53D1\u5E03\u5230\u5FAE\u4FE1\u89C6\u9891\u53F7\u65F6\u4F1A\u81EA\u52A8\u5728\u300C\u89C6\u9891\u6807\u6CE8\u300D\u4E2D\u9009\u62E9\u300C\u542BAI\u751F\u6210\u5185\u5BB9\u300D";

    var input = document.createElement("input");
    input.type = "checkbox";
    input.checked = isAiAnnotationEnabled();
    input.addEventListener("change", function () {
      setAiAnnotationEnabled(input.checked);
    });

    var text = document.createElement("span");
    text.textContent = "\u89C6\u9891\u53F7\u6807\u6CE8AI";

    label.appendChild(input);
    label.appendChild(text);
    if (button) {
      bar.insertBefore(label, button);
    } else {
      bar.appendChild(label);
    }
  }

  function applyTencentAiAnnotation(payload) {
    var enabled = isAiAnnotationEnabled();
    if (Array.isArray(payload)) {
      var changed = false;
      payload.forEach(function (item) {
        if (item && Number(item.type) === 2) {
          item.tencentAiAnnotation = enabled;
          changed = true;
        }
      });
      return changed;
    }
    if (payload && typeof payload === "object" && Number(payload.type) === 2) {
      payload.tencentAiAnnotation = enabled;
      return true;
    }
    return false;
  }

  function installPublishPayloadHook() {
    if (runtime.payloadHookInstalled || typeof window.fetch !== "function") {
      return;
    }
    runtime.payloadHookInstalled = true;
    var originalFetch = window.fetch;
    window.fetch = function (input, init) {
      var nextInit = init;
      try {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        if (nextInit && typeof nextInit.body === "string" && /\/postVideo(?:Batch)?(?:\?|$)/.test(url)) {
          var parsed = JSON.parse(nextInit.body);
          if (applyTencentAiAnnotation(parsed)) {
            nextInit = Object.assign({}, nextInit, { body: JSON.stringify(parsed) });
          }
        }
      } catch (error) {
        nextInit = init;
      }
      return originalFetch.call(this, input, nextInit);
    };
  }

  function mountTemplatePanel(field) {
    var textarea = field && field.textarea;
    var host = field && field.host;
    if (!textarea || !host || host.querySelector("#" + TEMPLATE_PANEL_ID)) {
      return;
    }
    var panel = document.createElement("div");
    panel.id = TEMPLATE_PANEL_ID;
    panel.className = "pcx-panel";

    var header = document.createElement("div");
    header.className = "pcx-panel-header";

    var title = document.createElement("span");
    title.className = "pcx-title";
    title.textContent = "文案模板";

    var saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "pcx-btn";
    saveButton.textContent = "保存当前为模板";
    saveButton.addEventListener("click", function () {
      var content = String(textarea.value || "").trim();
      if (!content) {
        alert("请先填写作品文案");
        return;
      }
      var defaultName = "模板 " + new Date().toLocaleString();
      var name = prompt("请输入模板名称", defaultName);
      if (!name) {
        return;
      }
      var templates = readTemplates();
      var existing = templates.find(function (item) {
        return item.name === name;
      });
      if (existing && !confirm("已存在同名模板，是否覆盖？")) {
        return;
      }
      var next = templates.filter(function (item) {
        return item.name !== name;
      });
      next.unshift({
        id: existing ? existing.id : String(Date.now() + Math.random()),
        name: name,
        content: content,
        updatedAt: Date.now()
      });
      writeTemplates(next);
      renderTemplateRows(rows, textarea);
    });

    header.appendChild(title);
    header.appendChild(saveButton);

    var rows = document.createElement("div");
    rows.className = "pcx-row";
    renderTemplateRows(rows, textarea);

    panel.appendChild(header);
    panel.appendChild(rows);
    host.appendChild(panel);
  }

  function renderTemplateRows(container, textarea) {
    container.innerHTML = "";
    var templates = readTemplates();
    if (!templates.length) {
      var empty = document.createElement("span");
      empty.className = "pcx-muted";
      empty.textContent = "暂无模板，保存一次后即可复用";
      container.appendChild(empty);
      return;
    }
    templates.forEach(function (template) {
      var chip = document.createElement("span");
      chip.className = "pcx-chip";

      var apply = document.createElement("button");
      apply.type = "button";
      apply.className = "pcx-chip-main";
      apply.textContent = template.name;
      apply.title = template.content;
      apply.addEventListener("click", function () {
        setNativeValue(textarea, template.content);
      });

      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "pcx-chip-del";
      edit.title = "编辑";
      edit.textContent = "改";
      edit.addEventListener("click", function () {
        var nextName = prompt("模板名称", template.name);
        if (!nextName) {
          return;
        }
        var nextContent = prompt("模板内容", template.content);
        if (!nextContent) {
          return;
        }
        var list = readTemplates().map(function (item) {
          if (item.id !== template.id) {
            return item;
          }
          return {
            id: item.id,
            name: nextName,
            content: nextContent,
            updatedAt: Date.now()
          };
        });
        writeTemplates(list);
        renderTemplateRows(container, textarea);
      });

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "pcx-chip-del";
      remove.title = "删除";
      remove.textContent = "删";
      remove.addEventListener("click", function () {
        if (!confirm("确认删除模板：" + template.name + "？")) {
          return;
        }
        var list = readTemplates().filter(function (item) {
          return item.id !== template.id;
        });
        writeTemplates(list);
        renderTemplateRows(container, textarea);
      });

      chip.appendChild(apply);
      chip.appendChild(edit);
      chip.appendChild(remove);
      container.appendChild(chip);
    });
  }

  function getSelectedTopics(topicHost) {
    if (!topicHost) {
      return [];
    }
    var tags = Array.prototype.slice
      .call(topicHost.querySelectorAll(".el-tag"))
      .filter(function (tag) {
        return !tag.closest("#" + HISTORY_PANEL_ID);
      })
      .map(function (tag) {
        return cleanTopic((tag.innerText || "").replace(/\s+/g, " "));
      })
      .filter(Boolean);
    return Array.from(new Set(tags));
  }

  function upsertTopics(topics) {
    if (!topics || !topics.length) {
      return;
    }
    var map = new Map();
    readHistory().forEach(function (item) {
      map.set(item.topic, item);
    });
    var now = Date.now();
    topics.forEach(function (topic) {
      var clean = cleanTopic(topic);
      if (!clean) {
        return;
      }
      var current = map.get(clean);
      if (current) {
        current.useCount = Number(current.useCount || 0) + 1;
        current.lastUsedAt = now;
      } else {
        map.set(clean, { topic: clean, useCount: 1, lastUsedAt: now });
      }
    });
    var next = Array.from(map.values()).sort(function (a, b) {
      return b.lastUsedAt - a.lastUsedAt;
    });
    writeHistory(next);
  }

  function removeHistory(topic) {
    var list = readHistory().filter(function (item) {
      return item.topic !== topic;
    });
    writeHistory(list);
  }

  function addTopicByUi(topicField, topic) {
    if (!topicField || !topicField.input || !topicField.host) {
      return;
    }
    var input = topicField.input;
    var addButton = topicField.addButton || findButtonByText(topicField.host, /\u6DFB\u52A0|Add/i);
    setNativeValue(input, topic);
    if (addButton && !addButton.disabled) {
      addButton.click();
      return;
    }
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
  }

  function mountTopicHistory(topicField) {
    var host = topicField && topicField.host;
    if (!host || host.querySelector("#" + HISTORY_PANEL_ID)) {
      return;
    }
    var panel = document.createElement("div");
    panel.id = HISTORY_PANEL_ID;
    panel.className = "pcx-panel pcx-history";

    var header = document.createElement("div");
    header.className = "pcx-panel-header";

    var title = document.createElement("span");
    title.className = "pcx-title";
    title.textContent = "历史话题";

    var clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "pcx-btn";
    clearButton.textContent = "清空";
    clearButton.addEventListener("click", function () {
      if (!confirm("确认清空历史话题吗？")) {
        return;
      }
      writeHistory([]);
      renderHistoryRows(rows, topicField);
    });

    header.appendChild(title);
    header.appendChild(clearButton);

    var rows = document.createElement("div");
    rows.className = "pcx-row";
    renderHistoryRows(rows, topicField);

    panel.appendChild(header);
    panel.appendChild(rows);
    host.appendChild(panel);

    wireTopicObserver(topicField, rows);
  }

  function renderHistoryRows(container, topicField) {
    container.innerHTML = "";
    var history = readHistory();
    if (!history.length) {
      var empty = document.createElement("span");
      empty.className = "pcx-muted";
      empty.textContent = "暂无历史话题，添加过的话题会自动出现在这里";
      container.appendChild(empty);
      return;
    }
    history.forEach(function (item) {
      var chip = document.createElement("span");
      chip.className = "pcx-chip";

      var use = document.createElement("button");
      use.type = "button";
      use.className = "pcx-chip-main";
      use.textContent = "#" + item.topic;
      use.addEventListener("click", function () {
        addTopicByUi(topicField, item.topic);
      });

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "pcx-chip-del";
      remove.textContent = "x";
      remove.title = "从历史删除";
      remove.addEventListener("click", function () {
        removeHistory(item.topic);
        renderHistoryRows(container, topicField);
      });

      chip.appendChild(use);
      chip.appendChild(remove);
      container.appendChild(chip);
    });
  }

  function wireTopicObserver(topicField, rowsContainer) {
    if (!topicField || !topicField.host) {
      return;
    }
    if (runtime.topicObserver && runtime.lastTopicHost !== topicField.host) {
      runtime.topicObserver.disconnect();
      runtime.topicObserver = null;
      runtime.lastSelectedTopics = [];
    }
    if (runtime.topicObserver && runtime.lastTopicHost === topicField.host) {
      return;
    }
    runtime.lastTopicHost = topicField.host;
    var sync = function () {
      var current = getSelectedTopics(topicField.host);
      var previousSet = new Set(runtime.lastSelectedTopics);
      var added = current.filter(function (topic) {
        return !previousSet.has(topic);
      });
      runtime.lastSelectedTopics = current;
      if (added.length) {
        upsertTopics(added);
        renderHistoryRows(rowsContainer, topicField);
      }
    };
    sync();
    runtime.topicObserver = new MutationObserver(function () {
      sync();
    });
    runtime.topicObserver.observe(topicField.host, {
      subtree: true,
      childList: true,
      characterData: true
    });
  }

  function boot() {
    if (!isPublishCenterRoute()) {
      return;
    }
    ensureStyle();
    var titleField = findTitleField();
    if (titleField) {
      mountTemplatePanel(titleField);
    }
    var topicField = findTopicField();
    if (topicField) {
      mountTopicHistory(topicField);
    }
    mountAiAnnotationToggle();
  }

  var scheduled = false;
  function scheduleBoot() {
    if (scheduled) {
      return;
    }
    scheduled = true;
    window.requestAnimationFrame(function () {
      scheduled = false;
      boot();
    });
  }

  var observer = new MutationObserver(function () {
    scheduleBoot();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });

  setInterval(boot, 1200);
  window.addEventListener("hashchange", scheduleBoot);
  window.addEventListener("popstate", scheduleBoot);
  installPublishPayloadHook();
  boot();
})();
