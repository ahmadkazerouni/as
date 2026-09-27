// برنامه‌ی اصلی: مسیریابی ساده با # و ساخت صفحه‌ها
(function () {
  const $view = document.getElementById("view");
  const C = window.CURRICULUM;
  const STORE = "moallem.state";

  // ---------- وضعیت ذخیره‌شده در مرورگر ----------
  const state = load();
  function load() {
    try {
      return Object.assign({ plan: null, grade: null, stage: "motevasete1", progress: {} }, JSON.parse(localStorage.getItem(STORE)) || {});
    } catch (e) {
      return { plan: null, grade: null, stage: "motevasete1", progress: {} };
    }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
  }
  function prog(key) {
    return (state.progress[key] = state.progress[key] || { lessonDone: false, quizBest: null, messages: 0 });
  }

  // ---------- ابزارها ----------
  const faDigits = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function md(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  }
  function subjectsFor(grade) {
    return C.subjects[grade] || C.defaultSubjects;
  }
  function findSubject(id) {
    for (const g of Object.keys(C.subjects)) {
      const s = C.subjects[g].find((x) => x.id === id);
      if (s) return { ...s, grade: g };
    }
    return null;
  }
  function render(html) {
    $view.innerHTML = html;
    $view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    document.querySelectorAll(".nav a").forEach((a) => {
      a.classList.toggle("active", location.hash.startsWith(a.getAttribute("href")));
    });
  }

  // ---------- صفحه‌ی اصلی ----------
  function home() {
    const plans = window.PLANS.map((p) => `
      <div class="panel plan ${p.featured ? "featured" : ""}">
        ${p.featured ? '<span class="tag">پرطرفدار</span>' : ""}
        <h3>${p.title}</h3>
        <div><span class="price">${p.price}</span> <span class="muted">${p.period}</span></div>
        <ul>${p.features.map((f) => `<li>${f}</li>`).join("")}</ul>
        <a class="btn ${p.featured ? "primary" : ""}" href="#/pay/${p.id}">${state.plan === p.id ? "اشتراک فعال ✓" : "انتخاب این طرح"}</a>
      </div>`).join("");

    render(`
      <section class="hero">
        <div>
          <p class="eyebrow">معلم خصوصی هوشمند، مطابق کتاب درسی</p>
          <h1>هر وقت درس را نفهمیدی، <span class="mark">معلمت</span> همین‌جاست.</h1>
          <p>پایه و درست را انتخاب کن. معلم هوش مصنوعی قدم‌به‌قدم درس می‌دهد، سؤال می‌پرسد تا مطمئن شود فهمیده‌ای، امتحان می‌گیرد و تمرین‌هایت را با تو حل می‌کند.</p>
          <div class="hero-cta">
            <a class="btn primary" href="#/learn">شروع یادگیری</a>
            <a class="btn" href="#/lesson/math9/1">امتحان رایگان: ریاضی نهم</a>
          </div>
        </div>
        <div class="panel hero-demo" aria-label="نمونه‌ی گفتگو">
          <div class="demo-head"><b>ریاضی نهم · فصل ۱</b><span class="mode demo">نمونه</span></div>
          <div class="msg tutor">اگر A = {۱، ۲، ۳} و B = {۲، ۳، ۴} باشد، A ∩ B چه می‌شود؟</div>
          <div class="msg student">{۱، ۲، ۳، ۴}</div>
          <div class="msg tutor">این اجتماع شد 🙂 کدام عددها <b>هم</b> در A هستند <b>هم</b> در B؟ یکی‌یکی چک کن.</div>
          <div class="msg student">آهان! {۲، ۳}</div>
        </div>
      </section>

      <h2 class="section-title">چطور کار می‌کند</h2>
      <section class="steps">
        <div class="panel step"><span class="num">۱</span><b>پایه‌ات را انتخاب کن</b><span class="muted">از اول ابتدایی تا کنکور</span></div>
        <div class="panel step"><span class="num">۲</span><b>فصل را انتخاب کن</b><span class="muted">یا بگو از پایه شروع کند</span></div>
        <div class="panel step"><span class="num">۳</span><b>با معلم گفتگو کن</b><span class="muted">توضیح، مثال، سؤال و حل تمرین</span></div>
        <div class="panel step"><span class="num">۴</span><b>آزمون بده</b><span class="muted">نمره و توضیح هر اشتباه</span></div>
      </section>

      <h2 class="section-title">طرح‌های اشتراک</h2>
      <section class="plans">${plans}</section>
    `);
  }

  // ---------- پرداخت (نمایشی) ----------
  function pay(planId) {
    const p = window.PLANS.find((x) => x.id === planId);
    if (!p) return home();
    render(`
      <div class="crumbs"><a href="#/">خانه</a> ‹ <span>پرداخت</span></div>
      <form class="panel checkout" id="payForm">
        <h2>خرید طرح «${p.title}»</h2>
        <div class="row"><span class="muted">مبلغ</span><b>${p.price} ${p.price === "رایگان" ? "" : "تومان"}</b></div>
        <div class="field">
          <label for="pay-name">نام دانش‌آموز</label>
          <input id="pay-name" required placeholder="مثلاً: سارا محمدی">
        </div>
        <div class="field">
          <label for="pay-phone">شماره‌ی موبایل والدین</label>
          <input id="pay-phone" required inputmode="tel" placeholder="۰۹۱۲۱۲۳۴۵۶۷">
          <small>گزارش پیشرفت هفتگی به این شماره پیامک می‌شود.</small>
        </div>
        <div class="notice warn">نسخه‌ی نمایشی: هنوز درگاه پرداخت (مثل زرین‌پال) وصل نشده و پولی کم نمی‌شود.</div>
        <button class="btn primary" type="submit">${p.price === "رایگان" ? "فعال‌سازی رایگان" : "پرداخت و فعال‌سازی"}</button>
        <p id="payDone" class="notice" hidden></p>
      </form>
    `);
    document.getElementById("payForm").addEventListener("submit", (e) => {
      e.preventDefault();
      state.plan = p.id;
      state.student = document.getElementById("pay-name").value.trim();
      save();
      const done = document.getElementById("payDone");
      done.hidden = false;
      done.innerHTML = `اشتراک «${p.title}» فعال شد ✓ <a href="#/learn">برو سراغ درس‌ها</a>`;
    });
  }

  // ---------- انتخاب مقطع، پایه و درس ----------
  function learn() {
    const stage = C.stages.find((s) => s.id === state.stage) || C.stages[1];
    const grade = state.grade && stage.grades.includes(state.grade) ? state.grade : null;

    const stageTabs = C.stages.map((s) =>
      `<button class="chip" data-stage="${s.id}" aria-pressed="${s.id === stage.id}">${s.title}</button>`).join("");
    const grades = stage.grades.map((g) =>
      `<button class="chip" data-grade="${g}" aria-pressed="${g === grade}">${g}</button>`).join("");

    let subjects = "";
    if (grade) {
      subjects = `
        <h2 class="section-title" style="margin-top:22px">درس پایه‌ی ${grade}</h2>
        <div class="grid-cards">
          ${subjectsFor(grade).map((s) => s.ready
            ? `<a class="card-btn" href="#/chapters/${s.id}">${s.title}<small>${faDigits(C.chapters[s.id].length)} فصل</small><span class="badge">آماده</span></a>`
            : `<div class="card-btn locked" aria-disabled="true">${s.title}<small>به‌زودی</small><span class="badge soon">به‌زودی</span></div>`).join("")}
        </div>`;
    } else {
      subjects = `<p class="muted" style="margin-top:18px">یک پایه انتخاب کن. (در این نسخه «نهم ← ریاضی» کامل است.)</p>`;
    }

    render(`
      <div class="crumbs"><a href="#/">خانه</a> ‹ <span>درس‌ها</span></div>
      <h1 class="section-title">در چه مقطعی درس می‌خوانی؟</h1>
      <div class="tabs" role="group" aria-label="مقطع">${stageTabs}</div>
      <div class="tabs" role="group" aria-label="پایه">${grades}</div>
      ${subjects}
    `);
    $view.querySelectorAll("[data-stage]").forEach((b) => b.addEventListener("click", () => {
      state.stage = b.dataset.stage; state.grade = null; save(); learn();
    }));
    $view.querySelectorAll("[data-grade]").forEach((b) => b.addEventListener("click", () => {
      state.grade = b.dataset.grade; save(); learn();
    }));
  }

  // ---------- فهرست فصل‌ها ----------
  function chapters(subjectId) {
    const subj = findSubject(subjectId);
    const list = C.chapters[subjectId];
    if (!subj || !list) return learn();

    render(`
      <div class="crumbs"><a href="#/">خانه</a> ‹ <a href="#/learn">درس‌ها</a> ‹ <span>${subj.title} ${subj.grade}</span></div>
      <h1 class="section-title">${subj.title} پایه‌ی ${subj.grade}</h1>
      <div class="panel basics">
        <div><b>مطمئن نیستی از کجا شروع کنی؟</b><div class="muted">معلم اول پیش‌نیازها را با مثال ساده مرور می‌کند و بعد وارد فصل ۱ می‌شود.</div></div>
        <a class="btn primary" href="#/lesson/${subjectId}/1/basics">از پایه شروع کن</a>
      </div>
      <div class="chapter-list">
        ${list.map((ch) => {
          const p = state.progress[`${subjectId}-${ch.id}`];
          const status = p && (p.lessonDone || p.quizBest !== null)
            ? `<span class="done">${p.lessonDone ? "درس دیده شد" : ""}${p.quizBest !== null ? ` · آزمون: ${faDigits(p.quizBest)}٪` : ""}</span>` : "";
          const hasQuiz = Boolean(window.QUIZZES[`${subjectId}-${ch.id}`]);
          return `
          <div class="panel chapter">
            <div class="n">${faDigits(ch.id)}</div>
            <div><b>${ch.title}</b> ${status}<div class="topics">${ch.topics.join(" · ")}</div></div>
            <div class="actions">
              <a class="btn primary" href="#/lesson/${subjectId}/${ch.id}">شروع درس</a>
              ${hasQuiz ? `<a class="btn" href="#/quiz/${subjectId}/${ch.id}">آزمون</a>` : ""}
            </div>
          </div>`;
        }).join("")}
      </div>
    `);
  }

  // ---------- کلاس: گفتگو با معلم ----------
  function lesson(subjectId, chapterId, basics) {
    const subj = findSubject(subjectId);
    const ch = (C.chapters[subjectId] || []).find((c) => c.id === Number(chapterId));
    if (!subj || !ch) return learn();

    const key = `${subjectId}-${ch.id}`;
    const ai = window.Tutor.isAiEnabled();
    const ctx = { grade: subj.grade, subject: subj.title, chapter: ch.title, topics: ch.topics, fromBasics: Boolean(basics) };
    const demo = window.Tutor.createDemoSession(key);
    const history = []; // برای حالت هوش مصنوعی

    render(`
      <div class="crumbs"><a href="#/">خانه</a> ‹ <a href="#/learn">درس‌ها</a> ‹ <a href="#/chapters/${subjectId}">${subj.title} ${subj.grade}</a> ‹ <span>فصل ${faDigits(ch.id)}</span></div>
      <div class="classroom">
        <section class="panel chat" aria-label="کلاس">
          <div class="chat-head">
            <b>فصل ${faDigits(ch.id)}: ${ch.title}${basics ? " · از پایه" : ""}</b>
            ${ai ? '<span class="mode ai">هوش مصنوعی وصل است</span>' : '<a class="mode demo" href="#/settings">حالت نمایشی</a>'}
          </div>
          <div class="messages" id="msgs" aria-live="polite"></div>
          <div class="quick" id="quick">
            <button class="chip" data-q="یک مثال دیگر بزن">یک مثال دیگر</button>
            <button class="chip" data-q="نفهمیدم، ساده‌تر توضیح بده">ساده‌تر بگو</button>
            <button class="chip" data-q="یک سؤال تمرینی از من بپرس">سؤال تمرینی</button>
          </div>
          <form class="composer" id="composer">
            <label for="msg-input" class="muted" hidden>پیام</label>
            <input id="msg-input" autocomplete="off" placeholder="جوابت یا سؤالت را بنویس…">
            <button class="btn primary" type="submit">ارسال</button>
          </form>
        </section>
        <aside class="side">
          <div class="panel">
            <h3>پیشرفت این درس</h3>
            <div class="bar"><span id="bar" style="width:0%"></span></div>
          </div>
          <div class="panel">
            <h3>سرفصل‌ها</h3>
            <ol>${ch.topics.map((t) => `<li>${t}</li>`).join("")}</ol>
          </div>
          <div class="panel stack">
            <h3>بعد از درس</h3>
            ${window.QUIZZES[key] ? `<a class="btn" href="#/quiz/${subjectId}/${ch.id}">آزمون این فصل</a>` : '<span class="muted">آزمون این فصل به‌زودی</span>'}
            <span class="muted" style="font-size:14px">سؤال یا تمرین خودت را هم می‌توانی همین‌جا تایپ کنی تا معلم قدم‌به‌قدم حلش کند.</span>
          </div>
        </aside>
      </div>
    `);

    const $msgs = document.getElementById("msgs");
    const $input = document.getElementById("msg-input");
    const $bar = document.getElementById("bar");

    function add(role, text, cls = "") {
      const el = document.createElement("div");
      el.className = `msg ${role} ${cls}`;
      el.innerHTML = md(text);
      $msgs.appendChild(el);
      $msgs.scrollTop = $msgs.scrollHeight;
      return el;
    }
    function updateBar() {
      const pct = ai ? Math.min(100, prog(key).messages * 10) : demo.progress();
      $bar.style.width = pct + "%";
      if (pct >= 100 && !prog(key).lessonDone) { prog(key).lessonDone = true; save(); }
    }

    async function send(text) {
      if (!text.trim()) return;
      add("student", text);
      prog(key).messages++; save();
      if (!ai) {
        setTimeout(() => { add("tutor", demo.reply(text)); updateBar(); }, 350);
        return;
      }
      history.push({ role: "user", content: text });
      const typing = add("tutor", "در حال نوشتن…", "typing");
      try {
        const answer = await window.Tutor.askAi(ctx, history);
        history.push({ role: "assistant", content: answer });
        typing.remove();
        add("tutor", answer);
      } catch (err) {
        typing.remove();
        history.pop();
        add("tutor", "ارتباط با هوش مصنوعی برقرار نشد. " + err.message + "\nتنظیمات را چک کنید.", "error");
      }
      updateBar();
    }

    document.getElementById("composer").addEventListener("submit", (e) => {
      e.preventDefault();
      const t = $input.value; $input.value = ""; send(t);
    });
    document.getElementById("quick").addEventListener("click", (e) => {
      const b = e.target.closest("[data-q]"); if (b) send(b.dataset.q);
    });

    // شروع درس
    if (ai) {
      send(basics ? "سلام، می‌خواهم از پایه شروع کنم. اول پیش‌نیازها را مرور کن." : "سلام، درس را شروع کن.");
    } else {
      add("tutor", demo.first());
      updateBar();
    }
  }

  // ---------- آزمون ----------
  function quiz(subjectId, chapterId) {
    const key = `${subjectId}-${chapterId}`;
    const qs = window.QUIZZES[key];
    const subj = findSubject(subjectId);
    if (!qs || !subj) return learn();
    const ch = C.chapters[subjectId].find((c) => c.id === Number(chapterId));
    let i = 0, correct = 0;

    function show() {
      const q = qs[i];
      render(`
        <div class="crumbs"><a href="#/chapters/${subjectId}">${subj.title} ${subj.grade}</a> ‹ <span>آزمون فصل ${faDigits(ch.id)}</span></div>
        <div class="panel quiz">
          <div class="row"><span class="eyebrow">سؤال ${faDigits(i + 1)} از ${faDigits(qs.length)}</span><span class="eyebrow">${ch.title}</span></div>
          <div class="bar"><span style="width:${(i / qs.length) * 100}%"></span></div>
          <p class="q">${q.q}</p>
          <div class="options">${q.options.map((o, k) => `<button class="option" data-k="${k}">${o}</button>`).join("")}</div>
          <div class="explain" id="explain" hidden></div>
          <div class="quiz-foot">
            <span class="muted">درست: ${faDigits(correct)}</span>
            <button class="btn primary" id="next" hidden>${i === qs.length - 1 ? "دیدن نتیجه" : "سؤال بعدی"}</button>
          </div>
        </div>
      `);
      $view.querySelectorAll(".option").forEach((b) => b.addEventListener("click", () => {
        const k = Number(b.dataset.k);
        const ok = k === q.answer;
        if (ok) correct++;
        $view.querySelectorAll(".option").forEach((o) => {
          o.disabled = true;
          if (Number(o.dataset.k) === q.answer) o.classList.add("correct");
        });
        if (!ok) b.classList.add("wrong");
        const ex = document.getElementById("explain");
        ex.hidden = false;
        ex.innerHTML = `<b>${ok ? "آفرین! درست است." : "اشکالی ندارد، ببین چرا:"}</b> ${q.why}`;
        document.getElementById("next").hidden = false;
      }));
      document.getElementById("next").addEventListener("click", () => {
        i++; i < qs.length ? show() : result();
      });
    }

    function result() {
      const pct = Math.round((correct / qs.length) * 100);
      const p = prog(key);
      p.quizBest = Math.max(p.quizBest ?? 0, pct);
      save();
      render(`
        <div class="panel quiz stack" style="text-align:center">
          <span class="eyebrow">نتیجه‌ی آزمون ${ch.title}</span>
          <div class="score">${faDigits(pct)}٪</div>
          <p>${faDigits(correct)} جواب درست از ${faDigits(qs.length)} سؤال</p>
          <p class="muted">${pct >= 80 ? "عالی بود! آماده‌ی فصل بعدی هستی." : "بد نیست! سؤال‌هایی را که اشتباه زدی با معلم مرور کن."}</p>
          <div class="hero-cta" style="justify-content:center">
            <a class="btn primary" href="#/lesson/${subjectId}/${chapterId}">مرور با معلم</a>
            <a class="btn" href="#/quiz/${subjectId}/${chapterId}/again">دوباره امتحان بده</a>
            <a class="btn ghost" href="#/chapters/${subjectId}">فهرست فصل‌ها</a>
          </div>
        </div>
      `);
    }
    show();
  }

  // ---------- پیشرفت ----------
  function progress() {
    const rows = Object.entries(state.progress).map(([key, p]) => {
      const [sid, cid] = key.split("-");
      const subj = findSubject(sid);
      const ch = subj && C.chapters[sid].find((c) => c.id === Number(cid));
      if (!ch) return "";
      return `<tr><td>${subj.title} ${subj.grade}</td><td>${faDigits(ch.id)}. ${ch.title}</td><td>${p.lessonDone ? "✓" : "در حال یادگیری"}</td><td>${p.quizBest === null ? "—" : faDigits(p.quizBest) + "٪"}</td><td>${faDigits(p.messages)}</td></tr>`;
    }).join("");
    const all = Object.values(state.progress);
    const quizzes = all.filter((p) => p.quizBest !== null);
    const avg = quizzes.length ? Math.round(quizzes.reduce((a, p) => a + p.quizBest, 0) / quizzes.length) : null;

    render(`
      <div class="crumbs"><a href="#/">خانه</a> ‹ <span>پیشرفت من</span></div>
      <h1 class="section-title">${state.student ? `پیشرفت ${esc(state.student)}` : "پیشرفت من"}</h1>
      <div class="stats">
        <div class="panel stat"><div class="muted">درس‌های دیده‌شده</div><div class="v">${faDigits(all.filter((p) => p.lessonDone).length)}</div></div>
        <div class="panel stat"><div class="muted">میانگین آزمون‌ها</div><div class="v">${avg === null ? "—" : faDigits(avg) + "٪"}</div></div>
        <div class="panel stat"><div class="muted">پیام به معلم</div><div class="v">${faDigits(all.reduce((a, p) => a + p.messages, 0))}</div></div>
      </div>
      ${rows ? `<div class="panel table-wrap"><table>
        <thead><tr><th>درس</th><th>فصل</th><th>وضعیت</th><th>بهترین نمره</th><th>پیام‌ها</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`
        : `<div class="panel" style="padding:20px">هنوز درسی شروع نکرده‌ای. <a href="#/lesson/math9/1">با فصل ۱ ریاضی نهم شروع کن</a>.</div>`}
      <p class="muted" style="margin-top:14px">این اطلاعات فعلاً فقط در همین مرورگر ذخیره می‌شود.</p>
    `);
  }

  // ---------- تنظیمات هوش مصنوعی ----------
  function settings() {
    const s = window.Tutor.loadSettings();
    render(`
      <div class="crumbs"><a href="#/">خانه</a> ‹ <span>تنظیمات</span></div>
      <form class="panel checkout" id="setForm">
        <h2>اتصال به هوش مصنوعی</h2>
        <p class="muted">بدون این تنظیمات، سایت در «حالت نمایشی» با یک درس آماده کار می‌کند. برای تدریس واقعی، یک سرویس سازگار با OpenAI API وصل کنید؛ مثلاً یک سرور با مدل متن‌باز (Qwen یا Llama از طریق Ollama).</p>
        <div class="field">
          <label for="set-url">آدرس سرویس (Base URL)</label>
          <input id="set-url" dir="ltr" value="${esc(s.baseUrl || "")}" placeholder="http://localhost:11434/v1">
        </div>
        <div class="field">
          <label for="set-model">نام مدل</label>
          <input id="set-model" dir="ltr" value="${esc(s.model || "")}" placeholder="qwen2.5:7b">
        </div>
        <div class="field">
          <label for="set-key">کلید API (اگر لازم است)</label>
          <input id="set-key" dir="ltr" type="password" value="${esc(s.apiKey || "")}" placeholder="اختیاری">
          <small>کلید فقط در همین مرورگر ذخیره می‌شود. در نسخه‌ی نهایی باید روی سرور باشد.</small>
        </div>
        <div class="row">
          <button class="btn primary" type="submit">ذخیره</button>
          <button class="btn ghost" type="button" id="clearSet">برگشت به حالت نمایشی</button>
        </div>
        <p id="setDone" class="notice" hidden></p>
      </form>
    `);
    const done = document.getElementById("setDone");
    document.getElementById("setForm").addEventListener("submit", (e) => {
      e.preventDefault();
      window.Tutor.saveSettings({
        baseUrl: document.getElementById("set-url").value.trim(),
        model: document.getElementById("set-model").value.trim(),
        apiKey: document.getElementById("set-key").value.trim()
      });
      done.hidden = false;
      done.textContent = window.Tutor.isAiEnabled() ? "ذخیره شد. معلم از این به بعد از هوش مصنوعی استفاده می‌کند." : "ذخیره شد، ولی آدرس سرویس و نام مدل هر دو لازم‌اند.";
    });
    document.getElementById("clearSet").addEventListener("click", () => {
      window.Tutor.saveSettings({});
      settings();
    });
  }

  // ---------- مسیریاب ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const [page, a, b, c] = parts;
    switch (page) {
      case "pay": return pay(a);
      case "learn": return learn();
      case "chapters": return chapters(a);
      case "lesson": return lesson(a, b, c === "basics");
      case "quiz": return quiz(a, b);
      case "progress": return progress();
      case "settings": return settings();
      default: return home();
    }
  }
  window.addEventListener("hashchange", route);
  route();
})();
