<p align="center">
  <a href="https://reevesagents.mertkayacs.com">
    <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/reevesagents"><img src="https://img.shields.io/npm/v/reevesagents.svg" alt="npm version" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/reevesagents.svg" alt="node" /></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/npm/l/reevesagents.svg" alt="license" /></a>
  <a href="https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI" alt="CI" /></a>
</p>

<p align="center">
  <a href="https://reevesagents.mertkayacs.com/demo"><b>العرض الحي</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/docs"><b>التوثيق</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/faq"><b>الأسئلة الشائعة</b></a> ·
  <a href="https://github.com/mertkayacs/reevesagents/issues"><b>المشكلات</b></a>
</p>

[English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Русский](README.ru.md) · [简体中文](README.zh-Hans.md) · **العربية**

ReevesAgents مساحة عمل محلية لأدوات CLI للبرمجة بالذكاء الاصطناعي. يشغّل Claude Code
وCodex وOpenCode وHermes وKimi وDeepSeek وQwen وPi وAider وغيرها من أدوات CLI
للمزوّدين جنبًا إلى جنب داخل tmux. تستطيع استخدامه أداة CLI/TUI/Web UI عادية، أو
ربط خادم MCP الاختياري الخاص به حتى يتمكن وكيل واحد من إنشاء البقية وقراءة
مخرجاتهم وتوجيههم وإيقافهم.

يبقى تسجيل الدخول إلى كل مزوّد داخل أداة CLI الخاصة به. ويحفظ ReevesAgents حالته
في بضعة ملفات JSON صِرفة تحت `~/.reeves`، ولا يعمل إلا حين تستخدمه أنت أو أداة CLI
مربوطة به.

## البداية السريعة

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

ابدأ تشغيلة من CLI:

```sh
reevesagents spawn claude-code:lead codex:tests hermes:research \
  --name "release check" \
  --prompt "Review the release path, test coverage, and docs."
```

افتح واجهة Web UI:

```sh
reevesagents web
```

دع وكيلًا مربوطًا يقود البقية:

```sh
reevesagents attach codex
reevesagents hosts
```

أعد تشغيل تلك الأداة بعد الربط حتى تحمّل أدوات MCP.

## ما الذي يقدّمه

| الواجهة | ما تصلح له |
| --- | --- |
| **TUI** | التحكم في التشغيلات من لوحة المفاتيح داخل الطرفية. |
| **Web UI** | عرض مرئي محلي للتشغيلات واللوحات والوكلاء والموافقات والسجل. |
| **CLI** | السكربتات والفحوص السريعة وإنشاء الوكلاء وتنظيف الحالة والانتقال إلى نوافذ tmux. |
| **MCP التحكم بالوكلاء** | أداة CLI واحدة تثق بها تنشئ أدوات CLI أخرى وتوجّهها عبر أدوات محلية. |
| **tmux** | نوافذ حقيقية لأدوات CLI من المزوّدين، تواصل العمل بعد إغلاق الواجهة. |

صُمّم ReevesAgents ليعمل محليًا. الحالة ملفات JSON صِرفة تحت `~/.reeves`، وأدوات
CLI التي يشغّلها هي نفسها التي تستخدمها بيدك كل يوم.

<a id="install"></a>
<details>
<summary><strong>التثبيت</strong></summary>

يحتاج ReevesAgents إلى Node.js `20.19+` وtmux `3.0+`، وأداة CLI مدعومة واحدة على
الأقل من أحد المزوّدين، مثبّتة ومسجَّل الدخول فيها. ويعمل على macOS وLinux وWSL.

```sh
# Homebrew
brew tap mertkayacs/reevesagents
brew install reevesagents

# pnpm
pnpm add -g reevesagents

# npm
npm install -g reevesagents

# one-shot checks
pnpm dlx reevesagents doctor
npx reevesagents doctor
```

لتثبيت إصدار بعينه، ضع رقمه مكان `<version>`:

```sh
pnpm add -g reevesagents@<version>
```

التثبيت من المصدر:

```sh
git clone https://github.com/mertkayacs/reevesagents.git
cd reevesagents
pnpm install
pnpm build
pnpm link --global
reevesagents doctor
```

</details>

<a id="screenshots"></a>
<details>
<summary><strong>لقطات الشاشة</strong></summary>

تتحكم TUI وWeb UI في التشغيلات المحلية نفسها:

![ReevesAgents TUI: منتقي اللغة وقائمة الترحيب وشاشة doctor](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI: التشغيلات ولوحات الوكلاء الحية](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-ar.png)

![ReevesAgents Web UI: بدء تشغيلة جديدة](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-ar.png)

</details>

<a id="commands"></a>
<details>
<summary><strong>الأوامر</strong></summary>

تشغيله بلا معطيات يفتح TUI.

| الأمر | الغرض |
| --- | --- |
| `reevesagents` | يفتح TUI. |
| `spawn [spec...]` | يبدأ تشغيلة. تُكتب كل مواصفة بالشكل `provider[:nickname[:model]]`. |
| `add [spec...]` | يضيف وكلاء إلى أحدث تشغيلة نشطة. |
| `runs` | يسرد التشغيلات النشطة. |
| `agents [run-id]` | يسرد الوكلاء في كل التشغيلات أو داخل تشغيلة واحدة. |
| `open <id>` | ينتقل إلى نافذة tmux لتشغيلة أو لوكيل. |
| `peek <agent-id>` | يطبع أحدث مخرجات وكيل واحد. |
| `send <agent-id> <text...>` | يلصق نصًا في وكيل من دون إرساله. |
| `key <agent-id> <key>` | يرسل `enter` أو `escape` أو الأسهم أو `tab` أو `space` أو `backspace` أو `ctrl-c`. |
| `interrupt <agent-id>` | يرسل Ctrl-C إلى وكيل واحد. |
| `stop <run-id>` | يوقف تشغيلة. يتطلب `--yes` أو `ALLOW_DESTRUCTIVE=1`. |
| `kill <agent-id>` | يوقف وكيلًا واحدًا. يتطلب `--yes` أو `ALLOW_DESTRUCTIVE=1`. |
| `setup` | فحص التشغيل الأول. ومع `--attach` يربط كل أداة CLI مضيفة مثبّتة. |
| `doctor` | يفحص Node وtmux والحالة وأدوات CLI للمزوّدين. |
| `web` | يشغّل Web UI على loopback وحده. |
| `providers` | يسرد معرّفات المزوّدين وأسماءهم المستعارة ونماذجهم ومدى توفرهم. |
| `approvals` | يسرد طلبات الموافقة المعلّقة. |
| `approve` / `deny` | يحسم طلب موافقة واحدًا. |
| `hosts` | يبيّن أي أدوات CLI المضيفة رُبط بها ReevesAgents. |
| `attach [cli]` | يربط MCP التحكم بالوكلاء بأداة CLI مضيفة واحدة، أو بكل الأدوات المضيفة المثبّتة. |
| `detach <cli>` | يزيل ذلك الربط من أداة CLI مضيفة واحدة. |
| `skills [action]` | يثبّت مهارة ReevesAgents أو يزيلها أو يعرض حالتها. |
| `mcp` | يشغّل خادم MCP عبر stdio. تشغّله الأدوات المضيفة بنفسها. |
| `config [key] [value]` | يعرض الإعدادات القابلة للتعديل أو يغيّرها. |
| `presets` | يسرد الإعدادات المسبقة المحفوظة للتشغيلات. |
| `save-preset` | يحفظ تشغيلة حية إعدادًا مسبقًا. |
| `start-preset` | يبدأ تشغيلة من إعداد مسبق. |
| `delete-preset` | يحذف إعدادًا مسبقًا. |
| `delete` | يحذف سجل وكيل واحد منتهٍ. يتطلب تأكيدًا. |
| `delete-run` | يحذف تشغيلة منتهية ويؤرشفها. يتطلب تأكيدًا. |
| `history` | يسرد التشغيلات المؤرشفة. |
| `delete-history` | يحذف سجلًا مؤرشفًا واحدًا. يتطلب تأكيدًا. |
| `reap` | ينهي الوكلاء العالقين والوكلاء الذين تجاوزوا `max_lifetime_ms`، ويغلق جلسات tmux اليتيمة التي لا يملكها أي سجل تشغيلة. |

خيارات شائعة:

- `--json`: متاح في أوامر السرد والإجراءات التي تستخدمها السكربتات.
- `--name <name>`: يسمّي التشغيلة.
- `--cwd <dir>`: يشغّل الوكلاء من دليل تحدده.
- `--prompt <text>`: يلصق نص البداية في كل وكيل يُنشأ.
- `--skip`: يتخطى مطالبات أذونات المزوّد للعمّال الذين يعملون بلا مراقبة.
- `--run <run-id>`: يضيف الوكلاء إلى تشغيلة محددة.
- `--port <n>` و`--no-open`: خيارات تشغيل Web UI.

</details>

<a id="agent-control"></a>
<details>
<summary><strong>التحكم بالوكلاء</strong></summary>

التحكم بالوكلاء (Agent Control) خادم MCP اختياري. اربطه فقط بأداة CLI تأتمنها على
تشغيل الأدوات المحلية:

```sh
reevesagents attach claude
reevesagents hosts
```

بعد إعادة التشغيل تحصل تلك الأداة على أدوات `spawn` و`read` و`send_text`
و`send_key` و`interrupt` و`kill` و`stop`، وعلى أدوات لإدارة الموافقات والإعدادات
المسبقة وفحص المضيفين. ويُتاح كتالوج المزوّدين أيضًا عبر المورد `reevesagents://providers`.

لا يحصل العمّال على الـ MCP افتراضيًا. وإن أردت أن ينشئ عامل عمّالًا خاصين به،
فاربط ReevesAgents بأداة CLI الخاصة بذلك العامل صراحةً.

يعزل Codex استدعاءات MCP داخل sandbox افتراضيًا، وهذا يمنع إطلاق نوافذ tmux. فإذا
استخدمت Codex مضيفًا يوجّه الوكلاء، فشغّله بصلاحيات كاملة، مثل
`codex --sandbox danger-full-access`، أو استخدم ملف تعريف لـ Codex يضبط
`sandbox_mode = "danger-full-access"`.

المرجع الكامل للأدوات: [docs/mcp.md](../mcp.md). ودليل التشغيل الموجّه للوكلاء:
[AGENTS.ar.md](../../AGENTS.ar.md).

</details>

<a id="configuration"></a>
<details>
<summary><strong>الإعداد</strong></summary>

تعيش الحالة تحت `~/.reeves`:

```text
~/.reeves/
  config.json
  presets/
  runs/
  history/
```

يغيّر متغيّرا بيئة المسارات الافتراضية:

- `REEVES_REGISTRY`: يغيّر جذر الحالة الذي يضم `runs/` و`history/` و`presets/`.
- `REEVES_CONFIG`: يغيّر مسار ملف الإعداد.

سجل واحد لكل خادم tmux: عملية تنظيف الجلسات اليتيمة في الخلفية تحكم على ملكية كل
جلسة بمقارنتها بالسجل الحالي، ولذلك يجب ألا يتشارك سجلان خادم tmux واحدًا.

وكل ما قد يحمل سرًّا يُنقّح قبل أن يصل إلى أي ملف.

</details>

<a id="examples"></a>
<details>
<summary><strong>أمثلة</strong></summary>

وزّع مشروعًا واحدًا على عدة أدوات CLI:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" \
  --prompt "Backend, product copy, and a review pass."
```

راقب وكيلًا واحدًا ثم افتح نافذته:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

أوقف التشغيلة حين ينتهي العمل:

```sh
reevesagents stop "feature x" --yes
```

</details>

<a id="web-ui"></a>
<details>
<summary><strong>واجهة Web UI</strong></summary>

```sh
reevesagents web
```

ترتبط واجهة Web UI بـ `127.0.0.1` وحده وتعمل في المقدمة. ويواصل الوكلاء عملهم
بعد إغلاق الصفحة لأنهم يعيشون في tmux.

تستخدم Web UI وحدتي تشغيل اختياريتين، `ws` و`@lydell/node-pty`، ويثبّتهما npm
افتراضيًا. تعمل أوامر CLI وTUI من دونهما، ويشرح `reevesagents web` ما الذي ينقص.

للوصول إليها من جهاز آخر، مرّر منفذ loopback عبر SSH:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
```

</details>

<a id="troubleshooting"></a>
<details>
<summary><strong>استكشاف الأخطاء وإصلاحها</strong></summary>

**tmux غير مثبّت.** ثبّت tmux ثم شغّل `reevesagents doctor`. تلفّ TUI نفسها
تلقائيًا في جلسة tmux اسمها `reeves`، ولتعطيل ذلك اضبط `REEVES_NO_TMUX_WRAPPER=1`.

**أداة CLI لمزوّد مفقودة أو خرجت من حسابها.** يطلق ReevesAgents أدوات CLI
الموجودة أصلًا على `PATH` والمسجَّل الدخول فيها. يعرض `reevesagents doctor` ما
اكتشفه. وإن كانت نافذة أُطلقت تنتظر عند شاشة تسجيل الدخول، فستراها في `peek`.

**تبلّغ Web UI عن حزم ناقصة.** أعد التثبيت مع تفعيل التبعيات الاختيارية، ثم شغّل
`reevesagents doctor`.

**المنفذ مستخدم.** يبدأ `reevesagents web` على المنفذ `8080` افتراضيًا. وإن كان
مشغولًا، يرتبط الخادم بأول منفذ حر في نطاق صغير ويطبع الرابط.

</details>

<a id="contributing"></a>
<details>
<summary><strong>المساهمة</strong></summary>

توثيق المساهمين موجود في [docs/](..). ابدأ بـ
[CONTRIBUTING.md](../../.github/CONTRIBUTING.md) و[الاختبار](../testing.md)
و[الإصدار](../releasing.md).

لا يحتاج المستخدمون النهائيون إلى أدوات التطوير. أما المساهمون فيستخدمون pnpm
وTypeScript وtsup وVitest وESLint من المستودع.

</details>

## روابط

- الموقع: https://reevesagents.mertkayacs.com
- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- الإصدارات: https://github.com/mertkayacs/reevesagents/releases
- المشكلات: https://github.com/mertkayacs/reevesagents/issues
- سجل التغييرات: [CHANGELOG.md](../../CHANGELOG.md)
- الترخيص: [Apache-2.0](../../LICENSE)
