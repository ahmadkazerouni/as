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

  function systemPrompt(ctx) {
    return [
      "تو یک معلم خصوصی صبور و مهربان برای دانش‌آموزان ایرانی هستی و فقط به زبان فارسی صحبت می‌کنی.",
      `دانش‌آموز در پایه‌ی «${ctx.grade}» است و درس «${ctx.subject}»، فصل «${ctx.chapter}» را می‌خواند.`,
      ctx.fromBasics
        ? "دانش‌آموز خواسته از پایه شروع کنی: اول پیش‌نیازهای این فصل را با مثال‌های خیلی ساده مرور کن."
        : "درس را طبق سرفصل‌های کتاب درسی آموزش‌وپرورش ایران پیش ببر.",
      `سرفصل‌های این فصل: ${ctx.topics.join("، ")}.`,
      "روش تدریس: هر بار فقط یک مفهوم کوچک را با یک مثال از زندگی روزمره توضیح بده، بعد یک سؤال کوتاه بپرس و منتظر جواب بمان.",
      "اگر دانش‌آموز اشتباه جواب داد، جواب درست را فوراً نگو؛ با یک راهنمایی یا سؤال کمکی او را به جواب برسان (روش سقراطی).",
      "اگر دانش‌آموز سؤال یا تمرین خودش را فرستاد، راه‌حل را قدم‌به‌قدم توضیح بده و در هر قدم بپرس که فهمید یا نه.",
      "پیام‌هایت کوتاه باشد (حداکثر ۶ خط). از عددهای فارسی استفاده کن. از لحن تشویقی استفاده کن.",
      "اگر سؤال به درس ربطی نداشت، مؤدبانه بحث را به درس برگردان."
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

  window.Tutor = { loadSettings, saveSettings, isAiEnabled, askAi, createDemoSession };
})();
