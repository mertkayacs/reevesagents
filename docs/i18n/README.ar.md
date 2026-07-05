<p align="center">
  <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
</p>

[![npm version](https://img.shields.io/npm/v/reevesagents.svg)](https://www.npmjs.com/package/reevesagents)
[![visits](https://visitor-badge.laobi.icu/badge?page_id=mertkayacs.reevesagents&left_text=visits)](https://github.com/mertkayacs/reevesagents)
[![node](https://img.shields.io/node/v/reevesagents.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/reevesagents.svg)](../../LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI)](https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml)

[English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Русский](README.ru.md) · [简体中文](README.zh-Hans.md) · **العربية**

*دع وكيلًا واحدًا ينشئ وكلاء آخرين ويقودهم. ReevesAgents مساحة عمل محلية مجانية يعمل فيها وكلاء البرمجة (مثل Claude Code وCodex وHermes وDeepSeek وKimi) جنبًا إلى جنب، ويستطيع وكيل واحد أن ينشئ الباقي ويوجّهه ويشرف عليه. بلا مفاتيح API، وبلا تغييرات على Agent.md أو Claude.md الموجود لديك.*

**بعشر لغات!**

GitHub: https://github.com/mertkayacs/reevesagents

## دع وكيلًا واحدًا يثبّته ويشغّل الباقي

هذه هي الفكرة كلها: وكيل AI واحد ينشئ الآخرين ويقودهم. بل تستطيع أداة CLI لوكيل (أي وكيل برمجة يعمل من سطر الأوامر، مثل Claude Code أو Codex أو Hermes) أن تثبّت ReevesAgents وتوصله بنفسها، ثم تبدأ تشغيل فريق.

**إن كنت وكيلًا يقرأ هذا، فنفّذ هذه الأوامر بنفسك:**

- **ثبّته:** `npm install -g reevesagents`
- **وصّله بأداة CLI الخاصة بك:** يوصل `reevesagents attach` أداة ReevesAgents بما لديك من أدوات CLI للوكلاء. ولأداة واحدة بعينها، اذكر اسمها، مثلًا `reevesagents attach claude`.
- **تحقّق من نجاح الخطوة:** يسرد `reevesagents hosts` أدوات CLI للوكلاء على هذا الجهاز ويبيّن أيّها متصل.
- **أعد تحميل أدواتك:** أعد تشغيل جلسة CLI لديك حتى تلتقط الاتصال (يستخدم هذا بروتوكول MCP، وهو الطريقة القياسية التي تعرض بها أداةُ وكيلٍ أوامرَها لأداة أخرى).

الآن تستطيع أداة CLI لديك **إنشاء وكلاء آخرين وقيادتهم**: ابدأ وكيلًا على مهمة، وأرسل إليه نصًا أو ضغطات مفاتيح، واقرأ ما يفعله، ووافق على ما يطلبه أو ارفضه. ويستطيع وكيل Claude Code واحد تشغيل فريق من وكلاء Codex وClaude Code على مشكلات منفصلة. ولقطع الاتصال لاحقًا، شغّل `reevesagents detach claude`.

أتفضّل التعامل معه ببرامج نصية من سطر الأوامر؟ [AGENTS.ar.md](../../AGENTS.ar.md) هو دليل المشغّل المكتوب للوكلاء: معرّفات المزوّدين وكناهم، ومواصفة `spawn`، وكيفية مراقبة فريق يعمل وتوجيهه.

أتفضّل إعداده يدويًا؟ فعّله من شاشة **Agent control** في TUI أو Web UI؛ انظر [Agent control](#agent-control) أدناه.

واجهة TUI وواجهة Web UI المحلية تقودان التشغيلة نفسها:

![ReevesAgents TUI: منتقي اللغة وشاشة الترحيب وشاشة Doctor](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI: عمليات التشغيل ولوحات الوكلاء المباشرة](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-ar.png)

![ReevesAgents Web UI: بدء تشغيلة جديدة](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-ar.png)

ReevesAgents مساحة عمل حرة ومفتوحة المصدر لوكلاء برمجة AI. شغّل عدة وكلاء في آن
واحد، ودع وكيلًا واحدًا ينشئ الباقي ويقوده: وكيل Claude Code يدير وكلاء Codex
وClaude Code على مشكلات منفصلة. ضع كل وكيل في موضع قوته، مثلًا DeepSeek على
الواجهة الخلفية، وClaude على المنتج وتوجيه الويب، وCodex على نظام تصميم أو
تمريرة تنفيذ، وHermes على البريد أو البحث أو الاستقصاء.

تتوفر الواجهة بعشر لغات: الإنجليزية والألمانية والفرنسية والإسبانية والبرتغالية
والإيطالية والتركية والروسية والصينية المبسطة والعربية.

هل أنت جديد على ReevesAgents؟ يرشدك [دليل المستخدمين](../GUIDE.ar.md) عبر التثبيت وتشغيلتك الأولى وترك وكيل واحد يقود الباقي.

## الواجهات

| الواجهة | ما تصلح له |
| --- | --- |
| **TUI** | تحكّم سريع يعتمد لوحة المفاتيح أولًا داخل الطرفية. |
| **Web UI** | عرض مرئي موحّد للتشغيلات والوكلاء واللوحات الحية والسجل. |
| **CLI** | البرامج النصية وأوامر الإطلاق السريعة وفحوصات doctor وفتح tmux. |
| **tmux** | نوافذ CLI حقيقية من المزوّدين تظل قيد التشغيل محليًا. |
| **Agent control** | الفكرة الأساسية: وكيل واحد ينشئ الباقي ويقوده. تفعّله لكل CLI على حدة، وبعدها يستطيع وكيل Claude Code تشغيل وكلاء Codex وHermes وClaude Code في آن واحد. |

## لماذا ReevesAgents

- **دع وكيلك يقود الوكلاء.** ينشئ CLI القائد لديك (Claude Code مثلًا) مجموعة من وكلاء Claude أو Codex أو DeepSeek أو Hermes أو OpenCode أو غيرها ويوجّهها عبر MCP.
- **نفّذ مهام متعددة وكرّرها في حلقات.** شغّل عدة وكلاء بالتوازي على أجزاء مختلفة من مشروع، وأبقِ الوكلاء طويلي التشغيل يعملون، وراقبهم جميعًا من عرض واحد. وضع نموذجًا أرخص في المقدمة ليوزّع العمل على وكلاء أذكى أو أصغر.
- **أبقِ الكلفة عملية.** دع النماذج الرخيصة أو المجانية تكتب الكود الروتيني والاختبارات بينما تخطط أنت وتصمّم بنموذج أكبر، بدلًا من دفع كل شيء عبر نموذج افتراضي واحد مكلف.
- **مساحة عمل واحدة دون فقدان السياق.** إن كنت تتنقل أصلًا بين Claude وCodex وDeepSeek وHermes وOpenCode، فسيجمع ReevesAgents تلك الجلسات في مكان محلي واحد؛ افتح أي وكيل من TUI أو Web UI لتقوده مباشرة.
- **حافظ على مرونتك تجاه المزوّدين.** يبقى تسجيل الدخول إلى المزوّد ضمن كل CLI. لا يخزّن ReevesAgents أي بيانات اعتماد ولا يمرّر حركة النماذج عبر وسيط، فتضيف أدوات CLI وتزيلها وتبدّلها بحرية.
- **شاهد العمل في لمحة.** التشغيلات النشطة والوكلاء والنماذج وأوضاع الأذونات وإجراءات الإيقاف والحذف والسجل في عرض Web UI واحد، بينما يُبقي tmux أدوات CLI الحقيقية حيّة.

هذه ليست منصة وكلاء سحابية، بل طبقة محلية صغيرة حول أدوات CLI حقيقية: بلا قاعدة
بيانات، وبلا Docker، وبلا عملية خفية في الخلفية، وبلا مفاتيح API مخزّنة لدى
ReevesAgents.

## التثبيت

يُنشر ReevesAgents على npm باسم `reevesagents`. ثبّته تثبيتًا عامًا بمدير الحزم
الذي تستخدمه أصلًا، ثم افحص الجهاز عبر `doctor`.

```sh
npm install -g reevesagents
reevesagents doctor
reevesagents
```

لتثبيت إصدار بعينه، أضف `@<version>` إلى اسم الحزمة، مثلًا
`npm install -g reevesagents@1.3.1`.

<details>
<summary><b>pnpm</b></summary>

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

تشغيل لمرة واحدة بلا تثبيت عام:

```sh
pnpm dlx reevesagents doctor
```

</details>

<details>
<summary><b>Yarn</b></summary>

تشغيل لمرة واحدة عبر Yarn (Berry):

```sh
yarn dlx reevesagents doctor
```

تثبيت عام عبر Yarn Classic:

```sh
yarn global add reevesagents
reevesagents doctor
reevesagents
```

</details>

<details>
<summary><b>Bun</b></summary>

```sh
bun add -g reevesagents
reevesagents doctor
reevesagents
```

تشغيل لمرة واحدة بلا تثبيت عام:

```sh
bunx reevesagents doctor
```

</details>

<details>
<summary><b>npx (بلا تثبيت)</b></summary>

```sh
npx reevesagents doctor
```

</details>

<details>
<summary><b>Homebrew</b></summary>

```sh
brew tap mertkayacs/reevesagents
brew install reevesagents
reevesagents doctor
reevesagents
```

</details>

<details>
<summary><b>من المصدر</b></summary>

استخدم المصدر حين تريد فحص الشيفرة أو المساهمة أو التشغيل من المستودع.

```sh
git clone https://github.com/mertkayacs/reevesagents.git
cd reevesagents
pnpm install
pnpm build
pnpm link --global
reevesagents doctor
reevesagents
```

</details>

## المتطلبات المسبقة

ReevesAgents محلي أولًا، وهو يفترض جهاز مطوّر اعتياديًا عليه tmux وأداة CLI
واحدة على الأقل من أحد المزوّدين.

- macOS أو Linux أو WSL. نظام Windows الأصلي ليس بيئة التشغيل المستهدفة؛ استخدم WSL.
- Node.js `20.19+`.
- tmux. يُوصى بالإصدار `3.0+`.
- صدفة تفاعلية اعتيادية على `PATH`.
- أداة CLI واحدة على الأقل من مزوّد مدعوم على `PATH`.

يستطيع ReevesAgents إطلاق أدوات CLI التالية من المزوّدين متى كانت مثبّتة وموثّقة
على جهازك: Claude Code وCodex CLI وOpenCode وHermes وKimi وDeepSeek وPi وQwen
وAider. ويبقى تسجيل الدخول إلى المزوّد ونماذجه وأدواته وحصصه ومطالبات الأذونات
ضمن كل مزوّد. لا يخزّن ReevesAgents مفاتيح API الخاصة بالمزوّدين ولا يمرّر حركة
النماذج عبر وسيط.

## البداية السريعة

```sh
reevesagents                 # تشغيل واجهة TUI
reevesagents web             # فتح واجهة Web UI المحلية
reevesagents doctor          # فحص الجهاز
```

ابدأ تشغيلة مسمّاة من CLI. أول مواصفة هي القائد، والبقية عاملون، وكل مواصفة
تُكتب `provider[:nickname[:model]]`:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:system hermes:research \
  --name "launch week build" \
  --prompt "Plan the backend, product surface, design system, and research notes."
```

للاطلاع على شرح كامل، انظر [دليل المستخدمين](../GUIDE.ar.md).

## الأوامر

تشغيله بلا وسائط يطلق واجهة TUI. والأوامر الفرعية هي واجهة المشغّل للبشر
والبرامج النصية.

الواجهة اليومية:

| الأمر | الغرض | الأعلام الأساسية |
| --- | --- | --- |
| `reevesagents` | إطلاق TUI (بلا أمر فرعي). | لا شيء |
| `spawn [spec...]` | بدء تشغيلة بوكيل واحد أو أكثر من المزوّدين. كل `spec` هو `provider[:nickname[:model]]`. أول مواصفة هي القائد، والبقية عاملون. وغياب المواصفة يجعل الافتراضي `codex`. | `--name <name>` (الافتراضي `run`), `--cwd <dir>` (الافتراضي الدليل الحالي), `--prompt <text>` (يُلصق في كل وكيل), `--skip` (تخطّي مطالبات الأذونات), `--run <run-id>` (إضافة وكلاء إلى تشغيلة موجودة), `--auth-mode <mode>`, `--effort <level>`, `--json` |
| `runs` | سرد التشغيلات النشطة، واحدة في كل سطر. | `--json` (سجلات التشغيلات الكاملة كمصفوفة JSON) |
| `agents [run-id]` | سرد الوكلاء عبر كل التشغيلات، أو وكلاء تشغيلة واحدة. | `--json` |
| `open <id>` | تبديل tmux إلى نافذة Reeves الخاصة بتشغيلة أو إلى نافذة وكيل. داخل tmux يبدّل؛ وخارج tmux على TTY يتصل؛ وإلا فيطبع أمر tmux قابلًا للّصق. يقبل معرّف/اسم تشغيلة أو معرّف/كنية وكيل (يُسمح بمطابقة البادئة). | لا شيء |
| `peek <agent-id>` | طباعة المخرجات الحديثة من وكيل واحد. | `-n, --lines <n>` (الافتراضي `20`), `--json` (الأسطر كمصفوفة) |
| `send <agent-id> <text...>` | لصق نص عند موجّه الوكيل. لا يُرسِله؛ أتبِعه بـ `key <agent-id> enter`. | لا شيء |
| `key <agent-id> <key>` | إرسال مفتاح واحد: `enter` أو `escape` أو `backspace` أو `tab` أو `space` أو `up` أو `down` أو `left` أو `right` أو `ctrl-c`. | لا شيء |
| `interrupt <agent-id>` | إرسال ctrl-c إلى وكيل واحد. | لا شيء |
| `stop <run-id>` | إيقاف تشغيلة واحدة. | `-y, --yes` (أو `ALLOW_DESTRUCTIVE=1`) |
| `kill <agent-id>` | إيقاف وكيل واحد. | `-y, --yes` (أو `ALLOW_DESTRUCTIVE=1`) |
| `doctor` | تشغيل فحوصات سلامة البيئة (Node وtmux ومسار الحالة وأدوات CLI من المزوّدين). يخرج بقيمة غير صفرية عند فشل أي فحص. | `--json` |
| `web` | بدء Web UI حسب الطلب والمقتصرة على loopback. تعمل في المقدمة؛ ويظل الوكلاء قيد التشغيل بعد إيقافها. | `--port <n>` (المنفذ المفضّل، ويرجع إلى المنفذ الحر التالي), `--no-open` (عدم فتح المتصفح) |

الاكتشاف والموافقات والتحكم بالوكلاء والإعدادات والتنظيف:

| الأمر | الغرض | الأعلام الأساسية |
| --- | --- | --- |
| `providers` | سرد كل مزوّد مع حالة التوفر والكنى والنماذج المعروفة. | `--models`, `--json` |
| `approvals` | سرد طلبات الموافقة المعلّقة الواردة من الوكلاء. | `--json` |
| `approve <approval-id> [note]` | حسم طلب موافقة بالقبول. | لا شيء |
| `deny <approval-id> [note]` | حسم طلب موافقة بالرفض. | لا شيء |
| `hosts` | سرد أدوات CLI للوكلاء على هذا الجهاز وبيان أيّها يتصل به ReevesAgents. | لا شيء |
| `attach [cli]` | وصل ReevesAgents بأداة CLI واحدة للوكلاء، أو بكل أداة مثبّتة حين لا يُذكر اسم. يشغّل أمر `mcp add` الخاص بتلك الأداة. | لا شيء |
| `detach <cli>` | فصل ReevesAgents عن أداة CLI واحدة للوكلاء. يشغّل أمر `mcp remove` الخاص بتلك الأداة. | لا شيء |
| `mcp` | بدء خادم Agent control MCP عبر stdio. لا يُشغَّل يدويًا؛ بل تشغّله أداة CLI التي توصله بها. | لا شيء |
| `config [key] [value]` | عرض جميع الإعدادات القابلة للتعديل، أو قراءة أحدها، أو ضبطه. | `--json` |
| `presets` | سرد إعدادات التشغيل الجاهزة المحفوظة. | `--json` |
| `save-preset <run-id> <name> [description...]` | التقاط تشغيلة حيّة كإعداد جاهز قابل لإعادة الاستخدام. | لا شيء |
| `start-preset <name>` | بدء تشغيلة جديدة من إعداد جاهز. | `--name <run>`, `--cwd <dir>` |
| `delete-preset <name>` | حذف إعداد جاهز. | `-y, --yes` |
| `delete <agent-id>` | حذف سجل وكيل واحد منتهٍ. | `-y, --yes` |
| `delete-run <run-id>` | حذف تشغيلة واحدة منتهية وأرشفتها في السجل. | `-y, --yes` |
| `history` | سرد التشغيلات المنتهية والقديمة المؤرشفة. | `--json` |
| `delete-history <id>` | حذف سجل مؤرشف واحد. | `-y, --yes` |

`stop` و`kill` وأوامر `delete` أوامر مدمّرة، وهي ترفض العمل بدون `--yes` أو
`ALLOW_DESTRUCTIVE=1`.

## Agent control

يأتي ReevesAgents بخادم MCP اختياري يتيح لأداة CLI واحدة من AI أن تنشئ أدوات CLI
أخرى من AI وتقودها: بدء وكيل، ولصق موجّه، وإرسال مفاتيح، وقراءة المخرجات، وحسم
طلبات الموافقة. وهو آلية مسطّحة لا سياسة تنسيق: بلا أدوار، وبلا حلقات مستقلة،
وبلا بروتوكول تنسيق.

وهو معطّل افتراضيًا، ولا يربطه ReevesAgents بأي CLI من تلقاء نفسه.

تفعّله من شاشة **Agent control** في TUI أو Web UI. تسرد تلك الشاشة أدوات CLI
الموجودة على هذا الجهاز والقادرة على استضافة خادم MCP (claude وcodex وkimi
وqwen وopencode وhermes)، وتتيح لك الربط أو فك الربط أو ربط الكل. يشغّل الربط
أمر `mcp add` الخاص بذلك الـ CLI (مثلًا
`claude mcp add reevesagents -- reevesagents mcp`)؛ ويشغّل فك الربط أمر الإزالة
المقابل. لا يستدعي ReevesAgents سوى أمر كل CLI الخاص به، ولا يحرّر ملفات إعداد
المزوّدين يدويًا أبدًا. وOpenCode هو الاستثناء: فأمر `mcp add` عنده تفاعلي وبلا
إزالة، لذا تعلّمه الشاشة على أنه يُربط يدويًا.

بمجرد ربط أداة CLI، تصبح أدوات Agent Control متاحة لها كلما بدأت. تثبيتها
اختيارك الصريح، وذلك الاختيار هو الموافقة. والتشغيلة الواحدة هي الـ CLI
المتحكّم بوصفه الرأس مع الوكلاء الذين أنشأهم، وتظهر المجموعة كلها في TUI وWeb UI
كأي تشغيلة أخرى.

لا يتلقى العاملون المنشأون خادم MCP افتراضيًا، فلا يستطيعون إنشاء وكلاء آخرين.
ولكي تدع عاملًا يقود عامليه الفرعيين، اربط الـ MCP بأداة CLI ذلك العامل من
الشاشة نفسها. وتقع الحواجز الوقائية على مستوى الموارد: سقف وكلاء لكل تشغيلة
(`max_agents`) يُفرض عندما تضيف أداة spawn إلى تشغيلة، إضافة إلى كون كل وكيل
عملية CLI حقيقية في لوحة tmux خاصة به.

يستطيع أي CLI مربوط أيضًا اكتشاف ما يمكنه إطلاقه: تعيد أداة `list_providers`
والمورد `reevesagents://providers` المزوّدين الموجودين على هذا الجهاز مع
معرّفاتهم وحالة تثبيتهم وكناهم ونماذجهم المعروفة، فيمرّر الوكيل معرّفًا حقيقيًا
إلى `spawn` بدلًا من التخمين.

راجع [docs/mcp.md](../mcp.md) للاطلاع على التصميم الكامل وقائمة الأدوات.

## الإعدادات

الحالة والإعداد ملفات JSON محلية. بلا قاعدة بيانات، وبلا عملية خفية.

تقيم الحالة ضمن `~/.reeves`:

```text
~/.reeves/
  config.json     إعدادات عامة (فترة peek واللغة والأذونات الافتراضية والحدود)
  presets/        إعدادات تشغيلة جاهزة محفوظة
  runs/           مجلد واحد لكل تشغيلة نشطة (run.json بالإضافة إلى agents/<id>.json)
  history/        تشغيلات منتهية وقديمة مؤرشفة (history/runs/<id>.json)
```

يتجاوز متغيّرا بيئة الإعدادات الافتراضية، وذلك أساسًا للاختبار المعزول أو
الاستخدام بملفات تعريف متعددة:

- `REEVES_REGISTRY`: تجاوز جذر الحالة. يستبدل `~/.reeves` كدليل لـ `runs/`
  و`history/` و`presets/`.
- `REEVES_CONFIG`: تجاوز مسار ملف الإعداد. يستبدل `~/.reeves/config.json`.

تُنقّح الحقول النصية التي قد تحمل أسرارًا قبل كتابتها إلى الحالة.

## أمثلة

وزّع مشروعًا واحدًا على أدوات CLI التي تناسب كل مهمة:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" --prompt "Backend, product copy, and a review pass."
```

اسرد ما هو حيّ والتقط معرّف التشغيلة:

```sh
reevesagents runs
reevesagents runs --json   # مناسب للبرمجة النصية
```

راقب وكيلًا واحدًا دون مغادرة صدفتك، ثم اقفز إليه حين يحتاجك:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

وحين ينتهي العمل، أوقف التشغيلة كلها باستدعاء واحد:

```sh
reevesagents stop "feature x" --yes
```

## Web UI

واجهة Web UI محلية ومقتصرة على loopback.

```sh
reevesagents web
```

ترتبط بـ `127.0.0.1`، وتعمل في المقدمة، وتخرج حين توقفها، ويظل الوكلاء يعملون
في tmux بعد ذلك. من المتصفح يمكنك إنشاء التشغيلات، وإضافة الوكلاء، واختيار
نماذج المزوّدين وأوضاع الأذونات، وإيقاف الوكلاء، وحذف العمل المنتهي، وفحص
السجل، بينما تظل أدوات CLI الحقيقية قيد التشغيل.

تستخدم Web UI وحدتي تشغيل اختياريتين، `ws` و`@lydell/node-pty`. يثبّتهما npm
افتراضيًا. ويظل CLI وTUI يعملان بدونهما، ويشرح أمر `web` ما هو المفقود.

للوصول إلى Web UI من جهاز آخر، مرّر منفذ loopback عبر SSH؛ فلا يوجد نفق مدمج:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
# ثم تصفّح إلى http://localhost:8080
```

## استكشاف الأخطاء وإصلاحها

**tmux غير مثبّت.** يحتاج ReevesAgents إلى tmux للتنقل القائم على النوافذ. ثبّته
(`brew install tmux` أو `apt install tmux`) وشغّل `reevesagents doctor`. تلفّ
TUI نفسها تلقائيًا في جلسة tmux باسم `reeves`؛ اضبط `REEVES_NO_TMUX_WRAPPER=1`
لتخطّي هذا السلوك.

**أداة CLI من المزوّد مفقودة أو يبلّغ Doctor عن فشل.** لا يطلق ReevesAgents سوى
أدوات CLI من المزوّدين الموجودة أصلًا على `PATH` لديك والموثّقة. شغّل
`reevesagents doctor` لترى المزوّدين المكتشفين وما يفشل، ثم ثبّت أداة CLI من
المزوّد التي تحتاجها أو سجّل الدخول إليها.

**تبلّغ Web UI عن حزم مفقودة.** تحتاج Web UI إلى `ws` و`@lydell/node-pty`. قد
يُتخطّيان حين لا يكون للمنصّة ثنائي `@lydell/node-pty` مُسبق البناء أو حين أغفل
التثبيت التبعيات الاختيارية. أعد التثبيت مع تمكين التبعيات الاختيارية، ثم شغّل
`reevesagents doctor`.

**المنفذ مستخدم بالفعل.** يبدأ `reevesagents web` على المنفذ `8080` افتراضيًا. إن
كان مأخوذًا، يرتبط الخادم بالمنفذ الحر التالي في نطاق صغير ويطبع الرابط المختار.
مرّر `--port <n>` لاختيار منفذ بداية مختلف.

## غير مطلوب

لست بحاجة إلى مفاتيح API مخزّنة لدى ReevesAgents، ولا قاعدة بيانات، ولا Docker،
ولا خدمة في الخلفية، ولا إعداد MCP لتشغيلات الوكلاء المستقرة الاعتيادية.
والتثبيت خامل: الحزمة المستقرة بلا سكربت postinstall ولا تعيد كتابة إعدادات
المزوّدين. وربط Agent Control MCP هو الخطوة الصريحة الاختيارية الوحيدة التي
تمسّ إعدادات المزوّد، وذلك فقط عبر أمر `mcp add` الخاص بكل CLI.

## المساهمة

راجع [CONTRIBUTING.md](../../.github/CONTRIBUTING.md) لمعرفة الفروع وسير طلبات السحب،
و[SECURITY.md](../../.github/SECURITY.md) للإبلاغ عن الثغرات، و[CHANGELOG.md](../../CHANGELOG.md)
لأحدث التغييرات. يقيم نموذج التصميم في
[REEVESAGENTS_DESIGN.md](../REEVESAGENTS_DESIGN.md) وتوجد وثائق المساهمين
ضمن [docs/](..).

لا يحتاج المستخدمون النهائيون إلى سلسلة أدوات التطوير. يستخدم المساهمون pnpm
وTypeScript وtsup وVitest وESLint من المستودع.

## روابط

- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Releases: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](../../CHANGELOG.md)
- License: [Apache-2.0](../../LICENSE)

## الترخيص

Apache-2.0
