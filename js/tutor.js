// موتور معلم: دو حالت دارد
// ۱) حالت نمایشی: بدون اینترنت و کلید API، با درس از پیش نوشته‌شده (فقط فصل ۱ ریاضی نهم)
// ۲) حالت هوش مصنوعی: به هر سرویس سازگار با OpenAI Chat Completions وصل می‌شود
//    (مثلاً یک سرور Ollama/vLLM با مدل متن‌باز مثل Qwen، یا یک سرویس API ایرانی).
//
// ⚠️ در این نمونه‌ی اولیه کلید API در مرورگر کاربر ذخیره می‌شود. در نسخه‌ی واقعی
// این درخواست‌ها باید از یک سرور (Backend) رد شوند تا کلید لو نرود.

(function () {
  const SETTINGS_KEY = "moallem.ai.settings";

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function isAiEnabled() {
    const s = loadSettings();
    return Boolean(s.baseUrl && s.model);
  }

  // ---------- Claude (فقط وقتی سایت داخل claude.ai باز شده) ----------
  // برای تست: اگر سرویس شخصی تنظیم نشده باشد و صفحه داخل Claude باز باشد،
  // خود Claude پشت معلم است. روی GitHub Pages این بخش وجود ندارد و سایت
  // به سرویس تنظیم‌شده یا حالت نمایشی برمی‌گردد.
  let claudeSample = null;
  let claudeBlocked = false;
  let imageLimits = null;
  const ready = (async () => {
    try {
      if (window.claude && typeof window.claude.use === "function") {
        claudeSample = await window.claude.use("sample");
        if (claudeSample) {
          const lim = await claudeSample.limits().catch(() => null);
          imageLimits = lim && lim.images ? lim.images : null;
        }
      }
    } catch (e) {
      claudeSample = null;
    }
  })();

  function provider() {
    if (isAiEnabled()) return "custom";
    if (claudeSample && !claudeBlocked) return "claude";
    return "demo";
  }

  async function askClaude(ctx, history, opts) {
    const turns = [{ role: "user", content: "دستورالعمل ثابت (این را اجرا کن، به آن جواب نده):\n\n" + systemPrompt(ctx) }, ...history.slice(-30)];
    try {
      const res = await claudeSample(turns, {
        cache: false,
        modelTier: opts.images ? "default" : "quick",
        onText: opts.onText,
        signal: opts.signal,
        images: opts.images || undefined
      });
      return res.text.trim();
    } catch (e) {
      if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(e.code)) {
        claudeBlocked = true;
      }
      throw e;
    }
  }

  function systemPrompt(ctx) {
    return [
      "تو «معلم‌یار» هستی: یک معلم خصوصی صبور، گرم و مهربان برای دانش‌آموزان ایرانی. فقط فارسی حرف می‌زنی، با لحن خودمانی ولی مؤدب (مثل یک معلم خوب که دانش‌آموز را «تو» خطاب می‌کند).",
      `دانش‌آموز در پایه‌ی «${ctx.grade}» است و درس «${ctx.subject}»، فصل «${ctx.chapter}» را می‌خواند.`,
      ctx.fromBasics
        ? "دانش‌آموز خواسته از پایه شروع کنی: اول پیش‌نیازهای این فصل را با مثال‌های خیلی ساده مرور کن."
        : "درس را طبق سرفصل‌های کتاب درسی آموزش‌وپرورش ایران پیش ببر.",
      `سرفصل‌های این فصل: ${ctx.topics.join("، ")}.`,
      "روش تدریس: هر بار فقط یک مفهوم کوچک را با یک مثال از زندگی روزمره توضیح بده، بعد یک سؤال کوتاه بپرس و منتظر جواب بمان.",
      "اگر دانش‌آموز اشتباه جواب داد، جواب درست را فوراً نگو؛ با یک راهنمایی یا سؤال کمکی او را به جواب برسان (روش سقراطی).",
      "اگر دانش‌آموز سؤال یا تمرین خودش را فرستاد، راه‌حل را قدم‌به‌قدم توضیح بده و در هر قدم بپرس که فهمید یا نه.",
      "اگر دانش‌آموز عکس سؤالی فرستاد، اول بگو سؤال را چه خواندی، بعد قدم‌به‌قدم با او حلش کن.",
      "اگر گفت «امتحان بگیر»، ۵ سؤال از همین فصل بپرس، یکی‌یکی؛ بعد از هر جواب بگو درست بود یا نه و چرا، و آخر نمره را از ۲۰ اعلام کن و بگو کدام بخش را مرور کند.",
      "پیام‌هایت کوتاه و گفتگویی باشد (معمولاً ۳ تا ۶ خط)، نه یک سخنرانی طولانی. از عددهای فارسی استفاده کن. می‌توانی گاهی از یک ایموجی ساده استفاده کنی.",
      "فرمت: متن ساده. برای تأکید فقط **این شکلی** بنویس. از LaTeX، جدول و تیتر استفاده نکن؛ نمادها را مستقیم بنویس (مثل ∪ ∩ √ ² ≤).",
      "اگر سؤال به درس ربطی نداشت، مؤدبانه و کوتاه بحث را به درس برگردان."
    ].join("\n");
  }

  async function askAi(ctx, history) {
    const s = loadSettings();
    const url = s.baseUrl.replace(/\/+$/, "") + "/chat/completions";
    const headers = { "Content-Type": "application/json" };
    if (s.apiKey) headers.Authorization = "Bearer " + s.apiKey;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: s.model,
        temperature: 0.5,
        messages: [{ role: "system", content: systemPrompt(ctx) }, ...history]
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`سرویس هوش مصنوعی خطای ${res.status} داد. ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "جوابی دریافت نشد.";
  }

  // ---------- حالت نمایشی ----------
  function normalize(t) {
    const fa = "۰۱۲۳۴۵۶۷۸۹";
    return t
      .replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)))
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .trim();
  }

  function checkAnswer(step, answer) {
    const a = normalize(answer);
    const keys = step.expect.map(normalize);
    if (step.mustAll) {
      // برای جواب‌های عددی: همه‌ی عددهای لازم باشند و عدد اضافه نباشد
      const nums = (a.match(/\d+/g) || []).sort().join(",");
      const need = [...new Set(keys.filter((k) => /^\d+$/.test(k)))].sort().join(",");
      return nums === need;
    }
    return keys.some((k) => a.includes(k));
  }

  function createDemoSession(lessonKey) {
    const steps = window.DEMO_LESSONS[lessonKey];
    let i = 0;
    return {
      hasScript: Boolean(steps),
      first() {
        if (!steps) {
          return "این فصل در حالت نمایشی درس آماده ندارد. 🙂\n\nبرای اینکه معلم واقعاً درس بدهد، از بخش «تنظیمات هوش مصنوعی» یک سرویس هوش مصنوعی وصل کنید. تا آن موقع می‌توانید «فصل ۱: مجموعه‌ها» را امتحان کنید.";
        }
        return steps[0].say;
      },
      reply(userText) {
        if (!steps) return "برای گفتگوی آزاد، سرویس هوش مصنوعی را از «تنظیمات» وصل کنید.";
        const step = steps[i];
        if (step.end) {
          return "در حالت نمایشی فقط همین درس آماده است. برای جواب دادن به سؤال‌های آزاد و حل تمرین‌های خودت، باید سرویس هوش مصنوعی از «تنظیمات» وصل شود. 🙂";
        }
        if (checkAnswer(step, userText)) {
          i++;
          return step.right + "\n\n" + steps[i].say;
        }
        return step.wrong;
      },
      progress() {
        return steps ? Math.round((i / (steps.length - 1)) * 100) : 0;
      }
    };
  }

  // ---------- خواندن با صدا (اگر مرورگر صدای فارسی داشته باشد) ----------
  function persianVoice() {
    if (!("speechSynthesis" in window)) return null;
    return speechSynthesis.getVoices().find((v) => /^fa/i.test(v.lang)) || null;
  }
  function speak(text) {
    const v = persianVoice();
    if (!v) return false;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g, "").replace(/[\u{1F300}-\u{1FAFF}]/gu, ""));
    u.voice = v; u.lang = v.lang; u.rate = 0.95;
    speechSynthesis.speak(u);
    return true;
  }

  window.Tutor = {
    loadSettings, saveSettings, isAiEnabled, askAi, askClaude, createDemoSession,
    ready, provider, imageLimits: () => imageLimits, persianVoice, speak
  };
})();
