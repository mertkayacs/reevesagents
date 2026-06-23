# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · **العربية**

كيفية قيادة وكيل برمجة ذكي لـ ReevesAgents. هذا الملف هو دليل المشغّل للأداة نفسها. لا يغيّر كيفية تصرّف الوكلاء في مشاريعك الخاصة.

يشغّل ReevesAgents أدوات CLI للبرمجة الذكية (Claude Code وCodex وKimi وQwen وOpenCode وHermes وغيرها) جنبًا إلى جنب، كل واحدة CLI حقيقي في نافذة tmux خاصة به. وكيل واحد يمكنه أن ينشئ ويوجّه ويشرف على الباقي. الحالة تعيش في JSON محلي تحت `~/.reeves`. بلا مفاتيح API، بلا قاعدة بيانات، بلا عملية خفية في الخلفية.

## طريقتان لاستخدامه

1. **قيادة CLI مباشرة.** شغّل `reevesagents spawn ...` لبدء الوكلاء، ثم `runs` و`peek` و`send` و`stop` لمراقبتهم وتوجيههم. جيد للبرامج النصية والتنسيق لمرة واحدة.
2. **دع CLI المضيف يقود الآخرين عبر MCP.** `reevesagents attach <cli>` يعطي CLI ذاك مجموعة من أدوات التحكم بالوكلاء (spawn و send_text و read و kill و...). بعد أن تعيد تشغيل CLI، جلسة واحدة يمكنها أن تنشئ فريقًا وتوجهه. هذه هي الميزة الأساسية. انظر [docs/mcp.md](docs/mcp.md).

## تحقق من الإعداد أولًا

```sh
reevesagents doctor
```

يبلّغ عن tmux وNode والدليل `~/.reeves` وأي مزوّدي CLI مثبّتون وسليمون (يفحص `--help` كل CLI). لا يستطيع أن يختبر هل CLI موثّق، لذا CLI مثبّت لكن غير موثّق يزال يمرّ هنا. شغّله قبل الإنشاء حتى التشغيل لا يفشل على CLI مفقود؛ `peek` (أدناه) يمسك نافذة جاثمة على شاشة تسجيل دخول. `reevesagents doctor --json` يرجع الشيء ذاته كـ JSON قابل للقراءة الآلية.

المتطلبات: Node 20.19+، tmux 3.0+، وعلى الأقل CLI مزوّد واحد مثبّت وموثّق. macOS أو Linux أو WSL (نظام Windows الأصلي ليس بيئة التشغيل المستهدفة).

## التثبيت

```sh
pnpm add -g reevesagents     # أو: npm install -g reevesagents
```

تشغيل بلا تثبيت: `pnpm dlx reevesagents doctor`.

## إنشاء الوكلاء

كل وكيل يُكتب كـ `provider[:nickname[:model]]`؛ الكنية والنموذج اختياريان. الوكيل الأول يقود التشغيلة؛ الباقي يلتحقون به كعاملين.

```sh
# وكيل Claude Code قائد، وكيل Claude Code ثاني مراجع، وكيلا Codex عاملان، وكيل Kimi عامل واحد.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

قبل أن يبدأ أي شيء، `spawn` يتحقق من أن كل CLI مزوّد مسمى على PATH ويسمّي أي مفقود، لذا خطأ إملاء أو CLI غير مثبّت يفشل بسرعة بدلًا من البدء النصفي للتشغيلة. عند النجاح يطبع معرّف التشغيلة ومعرّف كل وكيل والأوامر `peek`/`send`/`open` الدقيقة لقيادتهم.

أعلام `spawn` المفيدة: `--name <run>`، `--cwd <dir>` (الافتراضي الدليل الحالي)، `--prompt <text>` (يُلصق في كل وكيل عند البدء)، `--skip` (إطلاق الوكلاء بدون طلبات أذونات خاصة بهم؛ استخدمه حين لا أحد هناك للموافقة)، `--run <run-id>` (أضف وكلاء إلى تشغيلة موجودة بدلًا من بدء جديدة)، `--json` (اطبع معرّفات التشغيلة والوكيل كـ JSON بدلًا من نص).

## معرّفات المزوّد والكنى

شغّل `reevesagents providers` (أضف `--json` لقائمة آلية). أي كنية تعمل كمزوّد في مواصفة spawn.

| المعرّف    | المزوّد      | الكنى الشائعة                    |
| ---------- | ------------ | ----------------------------- |
| `cc`       | Claude Code  | `claude`, `claude-code`       |
| `codex`    | Codex CLI    | `codex-cli`                   |
| `kimi`     | Kimi Code    | `kimi-code`                   |
| `qwen`     | Qwen Code    | `qwen-code`                   |
| `opencode` | OpenCode CLI | `open_code`                   |
| `hermes`   | Hermes       |                               |
| `pi`       | Pi           |                               |
| `aider`    | Aider        |                               |
| `deepseek` | DeepSeek CLI | `deepseek-cli`                |

## مراقبة وتوجيه الوكلاء الجاري تشغيلهم

```sh
reevesagents runs                      # سرد التشغيلات النشطة (أضف --json للبرامج النصية)
reevesagents agents <run-id>           # سرد الوكلاء في تشغيلة واحدة
reevesagents peek <agent-id> -n 40     # المخرجات الحديثة من وكيل واحد
reevesagents send <agent-id> "do X"    # لصق نص في موجّه الوكيل
reevesagents key <agent-id> enter      # أرسله (send لا يُرسل بمفرده)
reevesagents interrupt <agent-id>      # ctrl-c الوكيل
reevesagents open <run-id|agent-id>    # انتقل إلى نافذة tmux الخاصة به
```

`send` يلصق فقط؛ تابعه بـ `key <agent-id> enter` لإرسال. المفاتيح المقبولة بـ `key`: `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`, `right`, `ctrl-c`.

## إيقاف نظيف

```sh
reevesagents stop <run-id> --yes       # إنهاء تشغيلة كاملة وهدم جلسة tmux الخاصة بها
reevesagents kill <agent-id> --yes     # إنهاء وكيل واحد
```

`stop` و`kill` هما الأمران المدمّران الوحيدان، لذا يرفضان العمل بدون `--yes`.

## مثال عملي: خمسة وكلاء، ثم قيادتهم

السيناريو "ثبّت reevesagents، أنشئ اثنين Claude واثنين Codex وواحد Kimi، وضعهم للعمل" من البداية إلى النهاية.

```sh
# 1. تأكّد من أن الخمسة CLIs مثبّتون وسليمون.
reevesagents doctor

# 2. ابدأ الفريق. --skip حتى العاملين لا يتوقفون لطلبات أذونات خاصة بهم.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. spawn يطبع معرّف كل وكيل. سرد الكل، أو اقرأ واحد.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. قيّد: لصق رسالة، ثم أرسلها.
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. أضف عاملًا لنفس التشغيلة لاحقًا.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. أنهِ التشغيلة حين تنتهي.
reevesagents stop <run-id> --yes
```

قيادته من CLI مضيف عبر MCP بدلًا من الصدفة، السيناريو ذاته هو تعليمة واحدة: "استخدم reevesagents لبدء فريق، وكيل Claude Code قائد، وكيل Claude Code ثاني مراجع، وكيلا Codex (api و tests)، ووكيل Kimi للتوثيق. تخطّ طلبات الأذونات، أعطهم الملخص، ثم شاهد وأبلغ التقدم." المضيف يستدعي أدوات spawn/read/send نفسه. انظر [docs/mcp.md](docs/mcp.md).

## افعل ولا تفعل

افعل:

- شغّل `doctor` قبل spawn، وتأكّد من أن كل مزوّد تسمّيه مثبّت **وموثّق**. doctor لا يستطيع اختبار التوثيق؛ إن تعثّرت نافذة، `peek` يوضح شاشة التسجيل.
- تعامل مع `spawn` كـ fire-and-forget. يرجع معرّفات، ليس إجابات. استقصِ بـ `runs` و`agents <run-id>` و`peek <agent-id> -n 40` لترى ماذا يفعل الفريق.
- قدّم الإدخال في خطوتين: `send <agent-id> "..."` يلصق، `key <agent-id> enter` يُرسل.
- مرّ `--skip` حين لا أحد هناك للموافقة على الموجهات، أو العاملون يتوقفون عند الأول.
- استخدم `--json` (على `spawn` و`runs` و`agents` و`providers` و`doctor`) حين برنامج نصي أو وكيل يحتاج قراءة معرّفات وحالة بدلًا من نص.
- سمِّ المزوّدين بمعرّف أو أي كنية من `reevesagents providers` (`cc` أو `claude` أو `codex` أو `kimi` أو ...).

لا تفعل:

- لا تتوقع أن `spawn` يرجع نتيجة الوكيل؛ ابدأ الفريق، ثم اقرأها.
- لا `send` وتفترض أنها جرت؛ لا شيء يُرسل قبل أن `key <agent-id> enter`.
- لا تنشئ مزوّدًا مفقودًا أو غير موثّق؛ spawn يرفض الأول، والثاني يترك نافذة متوقفة على موجّه تسجيل لا تفعل العمل.
- لا تشغّل `stop` أو `kill` بدون `--yes`؛ هما الأمران المدمّران الوحيدان.
- لا تستهدف نظام Windows الأصلي؛ شغّل داخل WSL مع tmux والـ CLIs مثبّتة هناك.
- لا تلصق أسرارًا في `--prompt` أو `send`؛ المخرجات تُلتقط وتُعرض عبر `peek` والـ web UI.

## ملاحظات البرمجة النصية

- `spawn` و`runs` و`agents` و`providers` و`doctor` كلهم يقبلون `--json`.
- `spawn --json` يطبع معرّف التشغيلة ومعرّف كل وكيل؛ التقط تلك، أو اقرأها مرة أخرى من `runs --json` و`agents <run-id> --json`.
- تجاوز دليل الحالة بـ `REEVES_REGISTRY` وملف الإعداد بـ `REEVES_CONFIG` لإبقاء تشغيلة نصية معزولة عن `~/.reeves`.

## المزيد

- [README](README.md): جولة الميزة الكاملة وكل أمر.
- [docs/GUIDE.md](docs/GUIDE.md): دليل المستخدم خطوة بخطوة.
- [docs/mcp.md](docs/mcp.md): تصميم Agent control MCP وقائمة الأدوات.
