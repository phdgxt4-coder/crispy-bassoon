/* بصيرة - المرحلة 1: الواجهة الصوتية + الإعدادات + التحديث التلقائي */
(function () {
  'use strict';

  var VERSION = self.BASEERA_VERSION || '0.0.0';
  var NOTES = self.BASEERA_NOTES || '';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* ---------------- التخزين والإعدادات ---------------- */
  var Store = {
    get: function (k, d) {
      try {
        var v = localStorage.getItem('baseera.' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem('baseera.' + k, JSON.stringify(v)); } catch (e) { /* تجاهل */ }
    }
  };

  var DEFAULTS = { rate: 1.0, vibrate: true, touchMode: true, updateMode: 'auto', welcomed: false };
  var Settings = {
    get: function (k) { return Store.get('s.' + k, DEFAULTS[k]); },
    set: function (k, v) { Store.set('s.' + k, v); }
  };

  /* ---------------- النطق ---------------- */
  var Speech = (function () {
    var synth = window.speechSynthesis;
    var voice = null;
    var pending = [];
    var epoch = 0;
    var lastCancel = 0;
    var keep = [];

    function pickVoice() {
      if (!synth) return;
      var vs = synth.getVoices() || [];
      voice = vs.filter(function (v) { return /^ar[-_]EG/i.test(v.lang); })[0] ||
              vs.filter(function (v) { return /^ar/i.test(v.lang); })[0] || null;
    }
    if (synth) {
      pickVoice();
      synth.onvoiceschanged = pickVoice;
    }

    function allowed() {
      // المتصفح مبيسمحش بالنطق قبل أول لمسة من المستخدم
      return !(navigator.userActivation && !navigator.userActivation.hasBeenActive);
    }

    function chunks(text) {
      var parts = text.split(/(?<=[.!؟?،,\n])\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
      var out = [], cur = '';
      parts.forEach(function (p) {
        if (cur && (cur + ' ' + p).length > 160) { out.push(cur); cur = p; }
        else cur = cur ? cur + ' ' + p : p;
      });
      if (cur) out.push(cur);
      return out.length ? out : [text];
    }

    function make(text) {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = voice ? voice.lang : 'ar-EG';
      if (voice) u.voice = voice;
      u.rate = Settings.get('rate');
      u.pitch = 1;
      keep.push(u); // يمنع Chrome من حذف الجملة قبل ما تخلص
      var release = function () { var i = keep.indexOf(u); if (i >= 0) keep.splice(i, 1); };
      u.addEventListener('end', release);
      u.addEventListener('error', release);
      return u;
    }

    // say(text, {interrupt:true}) -> Promise بتخلص لما الجملة تخلص
    function say(text, opts) {
      opts = opts || {};
      var interrupt = opts.interrupt !== false;
      if (!synth || !text) return Promise.resolve();
      if (!allowed()) { pending.push(text); return Promise.resolve(); }
      return new Promise(function (resolve) {
        var my = 0;
        if (interrupt) {
          my = ++epoch;
          synth.cancel();
          lastCancel = performance.now();
        }
        var wait = Math.max(0, lastCancel + 70 - performance.now());
        setTimeout(function () {
          if (interrupt && my !== epoch) { resolve(); return; }
          var cs = chunks(text);
          cs.forEach(function (c, i) {
            var u = make(c);
            if (i === cs.length - 1) {
              u.addEventListener('end', function () { resolve(); });
              u.addEventListener('error', function () { resolve(); });
            }
            synth.speak(u);
          });
        }, wait);
      });
    }

    function flushPending() {
      if (!pending.length || !allowed()) return;
      var t = pending.join('. ');
      pending = [];
      say(t, { interrupt: false });
    }

    return {
      say: say,
      flushPending: flushPending,
      speaking: function () { return !!synth && (synth.speaking || synth.pending); },
      hasArabic: function () { return !!voice; },
      stop: function () { if (synth) synth.cancel(); }
    };
  })();

  /* ---------------- الاهتزاز ---------------- */
  var Haptics = {
    vib: function (p) {
      if (Settings.get('vibrate') && navigator.vibrate) {
        try { navigator.vibrate(p); } catch (e) { /* تجاهل */ }
      }
    },
    tick: function () { this.vib(15); },
    ok: function () { this.vib([30, 40, 30]); },
    strong: function () { this.vib([200, 80, 200, 80, 300]); }
  };

  /* ---------------- "مشغول": بيمنع التحديث وقت عملية جارية (للمراحل الجاية) ---------------- */
  var Busy = {
    n: 0,
    begin: function () { this.n++; },
    end: function () { this.n = Math.max(0, this.n - 1); },
    get active() { return this.n > 0; }
  };
  window.BaseeraBusy = Busy; // الأقسام الجاية (قراءة، عملة...) هتستخدمه

  /* ---------------- الشاشات والتنقل ---------------- */
  var current = 'start';
  var focusIdx = -1;
  var homeVisits = 0;

  var TUTORIAL =
    'أهلا بيك في بصيرة، رفيقك اللي بيشوفلك. ' +
    'اسحب صباعك يمين أو شمال عشان تتنقل بين الأزرار، وأنا هقولك اسم كل زر. ' +
    'لما توصل للزر اللي عايزه، اضغط ضغطتين ورا بعض في أي مكان في الشاشة عشان تشغله. ' +
    'اسحب لتحت عشان ترجع، واسحب لفوق عشان أعيد عليك الكلام. ' +
    'وزر الطوارئ الأحمر، بتضغط عليه مطولاً. ' +
    'يلا نبدأ.';

  var SECTIONS = {
    read:     { title: 'اقرأ',          desc: 'قراءة النصوص بالكاميرا. الميزة دي لسه مش جاهزة، وهتتفعل في مرحلة جاية.' },
    currency: { title: 'عملة',          desc: 'التعرف على قيمة العملة. الميزة دي لسه مش جاهزة، وهتتفعل في مرحلة جاية.' },
    product:  { title: 'منتج أو دواء',  desc: 'قراءة المنتجات والأدوية. الميزة دي لسه مش جاهزة، وهتتفعل في مرحلة جاية.' },
    scene:    { title: 'إيه قدامي؟',    desc: 'وصف اللي قدامك. الميزة دي لسه مش جاهزة، وهتتفعل في مرحلة جاية.' }
  };

  function focusables() {
    return $$('#screen-' + current + ' [data-action], #screen-' + current + ' [data-hold]')
      .filter(function (el) { return !el.hidden; });
  }

  function labelOf(el) {
    return el.getAttribute('data-say') || el.getAttribute('aria-label') || el.textContent.trim();
  }

  function setLabel(sel, text) {
    var el = $(sel);
    if (!el) return;
    el.setAttribute('data-say', text);
    el.setAttribute('aria-label', text);
    var t = el.querySelector('.t');
    if (t) t.textContent = text;
  }

  function markFocus(el) {
    $$('.focused').forEach(function (x) { x.classList.remove('focused'); });
    if (el) {
      el.classList.add('focused');
      try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* تجاهل */ }
    }
  }

  function moveFocus(step) {
    var list = focusables();
    if (!list.length) return;
    focusIdx = focusIdx < 0 ? (step > 0 ? 0 : list.length - 1)
                            : (focusIdx + step + list.length) % list.length;
    var el = list[focusIdx];
    markFocus(el);
    Haptics.tick();
    Speech.say(labelOf(el));
  }

  function activateFocused() {
    var list = focusables();
    var el = list[focusIdx];
    if (!el) {
      Speech.say('اسحب يمين أو شمال عشان تختار زر الأول.');
      return;
    }
    run(el);
  }

  function run(el) {
    if (el.hasAttribute('data-hold')) {
      // الطوارئ مبتتفعلش بالضغطتين، بس بالضغط المطوّل (عشان منفعلهاش بالغلط)
      Haptics.tick();
      Speech.say('عشان تفعّل الطوارئ، اضغط على الزر الأحمر مطولاً.');
      return;
    }
    Haptics.ok();
    var fn = Actions[el.getAttribute('data-action')];
    if (fn) fn(el);
  }

  function show(name, opts) {
    opts = opts || {};
    var el = $('#screen-' + name);
    if (!el) return;
    $$('.screen').forEach(function (s) { s.hidden = (s !== el); });
    current = name;
    focusIdx = -1;
    markFocus(null);

    if (opts.push !== false && name !== 'home' && name !== 'start') {
      history.pushState({ screen: name, params: opts.params || null }, '');
    }

    if (name === 'section' && opts.params) {
      $('#section-title').textContent = opts.params.title;
      $('#section-desc').textContent = opts.params.desc;
    }
    if (name === 'settings') refreshSettingsLabels();

    var h = el.querySelector('h1');
    if (h) { try { h.focus({ preventScroll: true }); } catch (e) { /* تجاهل */ } }

    announceEnter(name, opts);
  }

  function announceEnter(name, opts) {
    var q = { interrupt: !opts.queue };
    if (name === 'home') {
      homeVisits++;
      Speech.say(homeVisits === 1
        ? 'الشاشة الرئيسية. اقرأ، عملة، منتج أو دواء، إيه قدامي، الأوامر الصوتية، الإعدادات، والطوارئ. اسحب يمين عشان تتنقل بين الأزرار.'
        : 'الشاشة الرئيسية.', q);
    } else if (name === 'settings') {
      Speech.say('الإعدادات. اسحب يمين عشان تتنقل بين الخيارات.', q);
    } else if (name === 'section' && opts.params) {
      Speech.say(opts.params.title + '. ' + opts.params.desc, q);
    } else if (name === 'welcome') {
      Speech.say(TUTORIAL, q);
      setTimeout(function () { $('#no-ar').hidden = Speech.hasArabic(); }, 600);
    }
  }

  function goBack() {
    if (history.state && history.state.screen && history.state.screen !== 'home') history.back();
    else show('home', { push: false });
  }

  window.addEventListener('popstate', function (e) {
    var s = e.state && e.state.screen;
    if (!s || s === 'start') s = 'home';
    show(s, { push: false, params: e.state && e.state.params });
  });

  /* ---------------- الإعدادات ---------------- */
  var RATES = [
    { v: 0.75, n: 'بطيئة' },
    { v: 1.0,  n: 'عادية' },
    { v: 1.3,  n: 'سريعة' }
  ];

  function rateName() {
    var r = Settings.get('rate');
    var best = RATES[1];
    RATES.forEach(function (x) { if (Math.abs(x.v - r) < Math.abs(best.v - r)) best = x; });
    return best.n;
  }

  function refreshSettingsLabels() {
    setLabel('#btn-rate', 'سرعة الصوت: ' + rateName());
    setLabel('#btn-vibrate', 'الاهتزاز: ' + (Settings.get('vibrate') ? 'شغال' : 'مقفول'));
    setLabel('#btn-touch', 'وضع اللمس الصوتي: ' + (Settings.get('touchMode') ? 'شغال' : 'مقفول'));
    setLabel('#btn-updatemode', Settings.get('updateMode') === 'auto'
      ? 'التحديث: تلقائي' : 'التحديث: اسألني الأول');
    setLabel('#btn-checkupdate', pendingWorker
      ? 'ثبّت التحديث الجديد'
      : 'الإصدار ' + VERSION + '. اضغط للتحقق من تحديث');
  }

  /* ---------------- الأفعال ---------------- */
  var Actions = {
    read:     function () { show('section', { params: SECTIONS.read }); },
    currency: function () { show('section', { params: SECTIONS.currency }); },
    product:  function () { show('section', { params: SECTIONS.product }); },
    scene:    function () { show('section', { params: SECTIONS.scene }); },
    mic:      function () { Speech.say('الأوامر الصوتية لسه مش جاهزة. هتتفعل في المرحلة الجاية.'); },
    settings: function () { show('settings'); },
    back:     function () { goBack(); },

    emergency: function () {
      Speech.say('تجربة: زر الطوارئ اشتغل. إرسال الموقع للأرقام هيتفعل في مرحلة جاية.');
    },

    'tutorial-done': function () {
      Settings.set('welcomed', true);
      history.replaceState({ screen: 'home' }, '');
      show('home', { push: false });
    },
    'tutorial-again': function () { Speech.say(TUTORIAL); },
    replay: function () { Speech.say(TUTORIAL); },

    rate: function () {
      var r = Settings.get('rate');
      var idx = 0;
      RATES.forEach(function (x, i) { if (Math.abs(x.v - r) < Math.abs(RATES[idx].v - r)) idx = i; });
      var next = RATES[(idx + 1) % RATES.length];
      Settings.set('rate', next.v);
      refreshSettingsLabels();
      Speech.say('سرعة الصوت ' + next.n + '. دي سرعتي دلوقتي.');
    },
    vibrate: function () {
      var on = !Settings.get('vibrate');
      Settings.set('vibrate', on);
      refreshSettingsLabels();
      if (on) Haptics.ok();
      Speech.say(on ? 'الاهتزاز اتفتح.' : 'الاهتزاز اتقفل.');
    },
    touch: function () {
      var on = !Settings.get('touchMode');
      Settings.set('touchMode', on);
      touchState = { el: null, t: 0 };
      refreshSettingsLabels();
      Speech.say(on
        ? 'وضع اللمس الصوتي اتفتح. لمسة واحدة بتقولك اسم الزر، وضغطتين بتشغله.'
        : 'وضع اللمس الصوتي اتقفل. لمسة واحدة بتشغل الزر. استخدم ده لو بتشغّل قارئ الشاشة TalkBack.');
    },
    updatemode: function () {
      var next = Settings.get('updateMode') === 'auto' ? 'ask' : 'auto';
      Settings.set('updateMode', next);
      refreshSettingsLabels();
      Speech.say(next === 'auto'
        ? 'التحديث التلقائي اتفتح. التحديثات هتتثبت لوحدها.'
        : 'هسألك الأول قبل أي تحديث.');
      if (next === 'auto' && pendingWorker) scheduleApply();
    },
    checkupdate: function () { checkUpdateNow(); }
  };

  /* ---------------- اللمس والإيماءات ---------------- */
  var touchState = { el: null, t: 0 };
  var lastSwipeAt = 0;
  var lastTapAt = 0;
  var ptr = null;
  var longTimer = null;
  var holdTimer = null;
  var holdFired = false;

  var app = $('#app');

  function clearTimers() {
    clearTimeout(longTimer);
    clearTimeout(holdTimer);
  }

  app.addEventListener('pointerdown', function (e) {
    if (current === 'start') return;
    var onHold = !!e.target.closest('[data-hold]');
    var onBtn = onHold || !!e.target.closest('[data-action]');
    ptr = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false, long: false, onBtn: onBtn };
    holdFired = false;
    clearTimers();

    if (onHold) {
      // ضغط مطوّل على الطوارئ
      holdTimer = setTimeout(function () {
        if (ptr && !ptr.moved) {
          holdFired = true;
          Haptics.strong();
          Actions.emergency();
        }
      }, 1200);
    } else if (!onBtn) {
      // ضغط مطوّل على أي مكان فاضي = أمر صوتي
      longTimer = setTimeout(function () {
        if (ptr && !ptr.moved) {
          ptr.long = true;
          Haptics.ok();
          Actions.mic();
        }
      }, 800);
    }
  });

  app.addEventListener('pointermove', function (e) {
    if (!ptr) return;
    if (Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) > 20) {
      ptr.moved = true;
      clearTimers();
    }
  });

  app.addEventListener('pointercancel', function () { ptr = null; clearTimers(); });

  app.addEventListener('pointerup', function (e) {
    if (!ptr) return;
    clearTimers();
    var p = ptr;
    ptr = null;
    var dx = e.clientX - p.x;
    var dy = e.clientY - p.y;
    var dt = Date.now() - p.t;

    if (p.moved) {
      if (dt > 900) return;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        lastSwipeAt = Date.now();
        moveFocus(dx > 0 ? 1 : -1);          // يمين = التالي، شمال = السابق
      } else if (Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx) * 1.5) {
        lastSwipeAt = Date.now();
        if (dy > 0) {                          // لتحت = رجوع
          if (current !== 'home') { Haptics.tick(); goBack(); }
          else Speech.say('إنت في الشاشة الرئيسية.');
        } else {                               // لفوق = إعادة الكلام
          var el = focusables()[focusIdx];
          Speech.say(el ? labelOf(el) : 'اسحب يمين أو شمال عشان تختار زر.');
        }
      }
      return;
    }

    // ضغطتين في مكان فاضي = تشغيل العنصر المحدد
    if (!p.onBtn && !p.long) {
      var now = Date.now();
      if (now - lastTapAt < 400) {
        lastTapAt = 0;
        activateFocused();
      } else {
        lastTapAt = now;
      }
    }
  });

  // ضغط على زر
  document.addEventListener('click', function (e) {
    if (current === 'start') return;
    if (Date.now() - lastSwipeAt < 350) return;

    var hold = e.target.closest('[data-hold]');
    if (hold) {
      if (holdFired) { holdFired = false; return; }
      var li = focusables().indexOf(hold);
      focusIdx = li;
      markFocus(hold);
      Haptics.tick();
      Speech.say(labelOf(hold));
      return;
    }

    var el = e.target.closest('[data-action]');
    if (!el) return;

    if (!Settings.get('touchMode')) { run(el); return; }

    var now = Date.now();
    if (touchState.el === el && now - touchState.t < 4000) {
      touchState = { el: null, t: 0 };
      run(el);
    } else {
      touchState = { el: el, t: now };
      focusIdx = focusables().indexOf(el);
      markFocus(el);
      Haptics.tick();
      Speech.say(labelOf(el));
    }
  });

  // لمس الطوارئ بقارئ الشاشة (ضغطة مطولة من TalkBack)
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    if (e.target.closest('[data-hold]') && !holdFired) {
      holdFired = true;
      clearTimers();
      Haptics.strong();
      Actions.emergency();
    }
  });

  // أول لمسة: المتصفح بيسمح بالنطق بعدها، فنطلّع أي رسالة كانت مستنية
  document.addEventListener('pointerdown', function () { Speech.flushPending(); }, true);

  /* ---------------- التحديث التلقائي ---------------- */
  var swReg = null;
  var pendingWorker = null;
  var applying = false;
  var idleTimer = null;

  function initUpdates() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
      swReg = reg;

      function watch(w) {
        if (!w) return;
        w.addEventListener('statechange', function () {
          if (w.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady(w);
        });
      }

      if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady(reg.waiting);
      reg.addEventListener('updatefound', function () { watch(reg.installing); });

      var check = function () { if (navigator.onLine) reg.update().catch(function () {}); };
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('online', check);
      check();
    }).catch(function () { /* التطبيق يشتغل عادي بدون تحديث تلقائي */ });

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // نعيد التحميل بس لو إحنا اللي طلبنا التحديث
      if (applying) location.reload();
    });
  }

  function onUpdateReady(w) {
    pendingWorker = w;
    refreshSettingsLabels();
    if (Settings.get('updateMode') === 'auto') {
      Speech.say('فيه تحديث جديد لبصيرة. هيتثبت لما تخلّص اللي في إيدك.', { interrupt: false });
      scheduleApply();
    } else {
      Speech.say('فيه تحديث جديد. روح الإعدادات واضغط ثبّت التحديث الجديد.', { interrupt: false });
    }
  }

  // بنثبّت التحديث في وقت آمن بس: مفيش عملية شغالة ومفيش كلام بيتنطق
  function scheduleApply() {
    clearInterval(idleTimer);
    idleTimer = setInterval(function () {
      if (!Busy.active && !Speech.speaking() && current !== 'start') {
        clearInterval(idleTimer);
        applyUpdate();
      }
    }, 4000);
  }

  function applyUpdate() {
    if (!pendingWorker || applying) return;
    applying = true;
    Haptics.ok();
    Speech.say('بثبّت التحديث دلوقتي.', { interrupt: false }).then(function () {
      pendingWorker.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(function () { if (applying) location.reload(); }, 5000); // احتياطي
    });
  }

  function checkUpdateNow() {
    if (pendingWorker) { applyUpdate(); return; }
    if (!swReg) { Speech.say('التحديث مش متاح هنا.'); return; }
    if (!navigator.onLine) { Speech.say('مفيش إنترنت دلوقتي. جرب لما تتصل.'); return; }
    Speech.say('بدوّر على تحديث.');
    swReg.update().then(function () {
      setTimeout(function () {
        if (pendingWorker) return;
        if (swReg.installing) Speech.say('لقيت تحديث وبنزّله.', { interrupt: false });
        else Speech.say('إنت على آخر إصدار. الإصدار ' + VERSION + '.', { interrupt: false });
      }, 800);
    }).catch(function () {
      Speech.say('معرفتش أتحقق دلوقتي. جرب تاني.', { interrupt: false });
    });
  }

  /* ---------------- التشغيل ---------------- */
  function enterApp(fromStartTap) {
    var opts = { push: false, queue: !!fromStartTap };
    if (Settings.get('welcomed')) {
      history.replaceState({ screen: 'home' }, '');
      show('home', opts);
    } else {
      show('welcome', opts);
    }
  }

  function boot() {
    history.replaceState({ screen: 'home' }, '');
    $('#ver-label').textContent = 'الإصدار ' + VERSION;

    initUpdates();

    var started = !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
    if (started) enterApp(false);
    else show('start', { push: false });

    // لو التطبيق اتحدّث من آخر مرة، نقول الجديد
    var lastV = Store.get('lastVersion', null);
    if (lastV && lastV !== VERSION) {
      Speech.say('تم تحديث بصيرة للإصدار ' + VERSION + (NOTES ? '. الجديد: ' + NOTES : ''), { interrupt: false });
    }
    Store.set('lastVersion', VERSION);

    $('#start-btn').addEventListener('click', function () {
      Haptics.ok();
      enterApp(true);
    });
  }

  boot();
})();
