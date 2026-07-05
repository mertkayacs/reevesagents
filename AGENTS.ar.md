# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · **العربية**

كيف يقود وكيل برمجة AI أداة ReevesAgents. هذا الملف هو دليل المشغّل للأداة نفسها، وهو لا يغيّر سلوك الوكلاء في مشاريعك الخاصة.

يشغّل ReevesAgents أدوات CLI لبرمجة AI (Claude Code وCodex وKimi وQwen وOpenCode وHermes وغيرها) جنبًا إلى جنب، كل واحدة منها CLI حقيقي في نافذة tmux خاصة به. ويستطيع وكيل واحد أن ينشئ الباقي ويوجّهه ويشرف عليه. تقيم الحالة في JSON محلي تحت `~/.reeves`. بلا مفاتيح API، وبلا قاعدة بيانات، وبلا عملية خفية في الخلفية.

## طريقتان لاستخدامه

1. **قُد CLI مباشرة.** شغّل `reevesagents spawn ...` لبدء الوكلاء، ثم `runs` و`peek` و`send` و`stop` لمراقبتهم وتوجيههم. مناسب للبرامج النصية والتنسيق لمرة واحدة.
2. **دع CLI المضيف لديك يقود الآخرين عبر MCP.** يمنح `reevesagents attach <cli>` تلك الأداة مجموعة من أدوات التحكم بالوكلاء (spawn وsend_text وread وkill و...). وبعد إعادة تشغيل الأداة، تستطيع جلسة واحدة إنشاء فريق وتوجيهه. هذه هي الميزة الأساسية. انظر [docs/mcp.md](docs/mcp.md).

## تحقق من الإعداد أولًا

```sh
reevesagents doctor
```

يبلّغ عن tmux وNode ودليل الحالة `~/.reeves`، وعن أدوات CLI للمزوّدين المثبّتة والمتوافقة (يفحص `--help` لكل أداة). لا يستطيع اختبار ما إذا كانت الأداة موثّقة، لذا تمرّ هنا أداة مثبّتة لكنها خارج تسجيل الدخول. شغّله قبل الإنشاء حتى لا تفشل تشغيلة بسبب CLI مفقود؛ ويلتقط `peek` (أدناه) نافذة تُركت واقفة عند شاشة تسجيل الدخول. ويعيد `reevesagents doctor --json` النتيجة نفسها بصيغة JSON قابلة للقراءة آليًا.

المتطلبات: Node 20.19+ وtmux 3.0+ وأداة CLI واحدة على الأقل من مزوّد، مثبّتة وموثّقة. macOS أو Linux أو WSL (نظام Windows الأصلي ليس هدفًا).

## التثبيت

```sh
pnpm add -g reevesagents     # أو: npm install -g reevesagents
```

تشغيل بلا تثبيت: `pnpm dlx reevesagents doctor`.

## إنشاء الوكلاء

يُكتب كل وكيل بالصيغة `provider[:nickname[:model]]`؛ والكنية والنموذج اختياريان. يقود الوكيل الأول التشغيلة، وينضم الباقون إليها عاملين.

```sh
# قائد Claude Code، ومراجع Claude Code ثانٍ، وعاملا Codex، وعامل Kimi واحد.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

قبل أن يبدأ أي شيء، يتحقق `spawn` من وجود كل أداة CLI مسمّاة على PATH ويسمّي المفقود منها، فيفشل خطأ الكتابة أو الأداة غير المثبّتة سريعًا بدل أن تبدأ التشغيلة نصف بداية. وعند النجاح يطبع معرّف التشغيلة ومعرّف كل وكيل وأوامر `peek`/`send`/`open` الدقيقة لقيادتهم.

أعلام `spawn` المفيدة: `--name <run>`، و`--cwd <dir>` (الافتراضي الدليل الحالي)، و`--prompt <text>` (يُلصق في كل وكيل عند البدء)، و`--skip` (إطلاق الوكلاء دون مطالبات الأذونات الخاصة بهم؛ استخدمه حين لا يوجد إنسان حاضر للموافقة)، و`--run <run-id>` (إضافة وكلاء إلى تشغيلة قائمة بدل بدء واحدة جديدة)، و`--json` (طباعة معرّفات التشغيلة والوكلاء بصيغة JSON بدل النص).

## معرّفات المزوّدين والكنى

شغّل `reevesagents providers` (أضف `--json` لقائمة قابلة للقراءة آليًا). وتصلح أي كنية اسمًا للمزوّد في مواصفة spawn.

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

## مراقبة الوكلاء العاملين وتوجيههم

```sh
reevesagents runs                      # سرد التشغيلات الحية (أضف --json للبرامج النصية)
reevesagents agents <run-id>           # سرد الوكلاء في تشغيلة واحدة
reevesagents peek <agent-id> -n 40     # المخرجات الحديثة من وكيل واحد
reevesagents send <agent-id> "do X"    # لصق نص عند موجّه الوكيل
reevesagents key <agent-id> enter      # إرساله (send لا يرسل بمفرده)
reevesagents interrupt <agent-id>      # إرسال ctrl-c إلى الوكيل
reevesagents open <run-id|agent-id>    # الانتقال إلى نافذة tmux الخاصة به
reevesagents approvals                 # طلبات الموافقة المعلّقة (أضف --json)
reevesagents approve <approval-id>     # حسم طلب واحد بالقبول؛ deny <approval-id> يرفضه
```

`send` يلصق فقط؛ أتبِعه بـ `key <agent-id> enter` للإرسال. المفاتيح التي يقبلها `key`: `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`, `right`, `ctrl-c`.

## إيقاف نظيف

```sh
reevesagents stop <run-id> --yes       # إنهاء تشغيلة كاملة وهدم جلسة tmux الخاصة بها
reevesagents kill <agent-id> --yes     # إنهاء وكيل واحد
```

يرفض `stop` و`kill` العمل بدون `--yes`. وتشمل البوابة نفسها أوامر التنظيف: يزيل `delete <agent-id>` و`delete-run <run-id>` السجلات المنتهية، ويزيل `delete-history <id>` سجلًا مؤرشفًا.

## مثال عملي: خمسة وكلاء، ثم قيادتهم

السيناريو "ثبّت reevesagents، وأنشئ وكيلين من Claude ووكيلين من Codex ووكيلًا من Kimi، وضعهم في العمل" من البداية إلى النهاية.

```sh
# 1. تأكّد من أن أدوات CLI الخمس مثبّتة ومتوافقة.
reevesagents doctor

# 2. ابدأ الفريق. استخدم --skip حتى لا يتوقف العاملون عند مطالبات الأذونات الخاصة بهم.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. يطبع spawn معرّف كل وكيل. اسردهم جميعًا، أو اقرأ واحدًا.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. وجّه: الصق رسالة، ثم أرسلها.
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. أضف عاملًا إلى التشغيلة نفسها لاحقًا.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. أنهِ التشغيلة عند اكتمال العمل.
reevesagents stop <run-id> --yes
```

أما قيادته من CLI مضيف عبر MCP بدل الصدفة، فالسيناريو نفسه يصبح تعليمة واحدة: "استخدم reevesagents لبدء فريق: قائد Claude Code، ومراجع Claude Code ثانٍ، وعاملا Codex (api وtests)، وعامل Kimi للتوثيق. تخطَّ مطالبات الأذونات، وأعطهم الملخص، ثم راقب التقدم وأبلغ عنه." يستدعي المضيف أدوات spawn/read/send بنفسه. انظر [docs/mcp.md](docs/mcp.md).

## افعل ولا تفعل

افعل:

- شغّل `doctor` قبل أي spawn، وتأكّد من أن كل مزوّد تسمّيه مثبّت **وموثّق**. لا يستطيع doctor اختبار تسجيل الدخول؛ فإن توقفت نافذة، أظهر `peek` شاشة تسجيل الدخول.
- تعامل مع `spawn` على أنه fire-and-forget. يعيد معرّفات لا إجابات. استعلم دوريًا بـ `runs` و`agents <run-id>` و`peek <agent-id> -n 40` لترى ما يفعله الفريق.
- قدّم الإدخال على خطوتين: `send <agent-id> "..."` يلصق، و`key <agent-id> enter` يرسل.
- مرّر `--skip` حين لا يوجد إنسان يجلس ليوافق على المطالبات، وإلا توقف العاملون عند أولها.
- استخدم `--json` (مع `spawn` و`runs` و`agents` و`providers` و`doctor`) حين يحتاج برنامج نصي أو وكيل إلى قراءة المعرّفات والحالة بدل النص.
- سمِّ المزوّدين بالمعرّف أو بأي كنية من `reevesagents providers` (`cc` أو `claude`، و`codex`، و`kimi`، ...).

لا تفعل:

- لا تتوقع أن يعيد `spawn` نتيجة وكيل؛ ابدأ الفريق ثم اقرأها.
- لا تنفّذ `send` وتفترض أن الأمر جرى؛ لا شيء يُرسَل حتى تنفّذ `key <agent-id> enter`.
- لا تنشئ وكيلًا لمزوّد مفقود أو غير موثّق؛ يرفض spawn الأول، ويترك الثاني نافذة واقفة عند مطالبة تسجيل دخول لا تنجز العمل أبدًا.
- لا تشغّل `stop` أو `kill` أو أوامر `delete` بدون `--yes`؛ فتلك هي الأوامر المدمّرة.
- لا تستهدف نظام Windows الأصلي؛ اعمل داخل WSL مع تثبيت tmux وأدوات CLI هناك.
- لا تلصق أسرارًا في `--prompt` أو `send`؛ فالمخرجات تُلتقط وتُعرض عبر `peek` وواجهة web UI.

## ملاحظات البرمجة النصية

- يقبل كل من `spawn` و`runs` و`agents` و`providers` و`doctor` الخيار `--json`.
- يطبع `spawn --json` معرّف التشغيلة ومعرّف كل وكيل؛ التقطها، أو اقرأها لاحقًا من `runs --json` و`agents <run-id> --json`.
- تجاوز دليل الحالة بـ `REEVES_REGISTRY` وملف الإعداد بـ `REEVES_CONFIG` لإبقاء التشغيلة المبرمجة نصيًا معزولة عن `~/.reeves`.

## المزيد

- [README](README.md): جولة كاملة في الميزات وكل الأوامر.
- [docs/GUIDE.md](docs/GUIDE.md): دليل المستخدم خطوة بخطوة.
- [docs/mcp.md](docs/mcp.md): تصميم Agent control MCP وقائمة الأدوات.
