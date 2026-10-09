<p align="center"><a href="https://reevesagents.mertkayacs.com/ar/"><img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-banner.png" width="800" alt="ReevesAgents: شغّل مساعدي البرمجة بالذكاء الاصطناعي معًا"></a></p>

# reevesagents: مساحة عمل لأدوات البرمجة بالذكاء الاصطناعي

شغّل Claude Code وCodex وKimi وOpenCode وHermes وغيرها من أدوات البرمجة بالذكاء الاصطناعي جنبًا إلى جنب على جهازك. يجمع reevesagents جلسات الطرفية الخاصة بها في مكان واحد، فتتابع عمل كل أداة وترسل التعليمات وتوقف التشغيلة من هناك.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-hero.webp" width="720" alt="لوحة قائدة بإطار ذهبي تتصل بخيوط ذهبية رفيعة بثماني لوحات زجاجية مضيئة، لوحة لكل أداة في التشغيلة">

[شاهد العرض التوضيحي](https://reevesagents.mertkayacs.com/ar/demo/) أو ثبّت أداة سطر الأوامر كما هو موضح أدناه.

## البدء السريع

يتطلب Node.js 20.19 أو أحدث، وtmux 3.0 أو أحدث، وأداة برمجة بالذكاء الاصطناعي مثبّتة ومسجّل الدخول إليها. يعمل على macOS وLinux وWSL. يُبقي tmux الأدوات قيد التشغيل حين تغلق الواجهة.

```sh
npm install -g reevesagents && reevesagents doctor && reevesagents
```

يفتح هذا الأمر واجهة الطرفية. لواجهة المتصفح شغّل `reevesagents web`، وهي لا تستمع إلا على عنوان loopback الخاص بجهازك.

## تشغيل فريق

ابدأ تشغيلة بمهمة للأدوات:

```sh
reevesagents spawn claude-code:lead codex:tests --name "review" --prompt "راجع الشيفرة والاختبارات."
```

استخدم واجهة الطرفية أو المتصفح لقراءة المخرجات وتوجيه كل أداة. يحتفظ كل مزوّد بتسجيل دخوله ويرسل طلباته إلى النموذج بنفسه. تُحفظ حالة التشغيلات بصيغة JSON تحت `~/.reeves`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-ar.png" width="720" alt="واجهة reevesagents Web UI عند بدء تشغيلة جديدة: اسم التشغيلة، واختيار أدوات مثل Claude Code وCodex CLI وKimi Code، ونموذج، ووضع الأذونات">

## أداة واحدة توجّه البقية

اربط خادم MCP الاختياري (Model Context Protocol، وهو اتصال قياسي بين أدوات الذكاء الاصطناعي) بأداة مضيفة تثق بها:

```sh
reevesagents attach claude && reevesagents hosts
```

أعد تشغيل الأداة المضيفة لتحميل الاتصال. بعد ذلك تستطيع بدء الأدوات الأخرى وقراءة مخرجاتها وتوجيهها وإيقافها. لا يحصل العمّال على اتصال MCP افتراضيًا. أبقِ طلبات الأذونات لدى المزوّدين مفعّلة، وراجع الموافقات قبل أي إجراء حساس.

في Claude Code يمكنك تثبيت الاتصال وتعليمات استخدامه معًا كإضافة:

```sh
claude plugin marketplace add mertkayacs/reevesagents
claude plugin install reevesagents@reevesagents
```

للأدوات المضيفة الأخرى، توفّر [مهارة reevesagents](https://github.com/mertkayacs/reevesagents-skill) تعليمات الاستخدام. راجع [مرجع MCP](../mcp.md) لمعرفة الأدوات ومتطلبات كل أداة مضيفة.

الخادم مُدرج في [سجل MCP الرسمي](https://registry.modelcontextprotocol.io/?q=io.github.mertkayacs/reevesagents) باسم `io.github.mertkayacs/reevesagents`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-steer.webp" width="560" alt="لوحة قائدة بإطار ذهبي ترسل رسائل عبر خيوط ذهبية إلى ثلاث لوحات أخرى">

## اختر واجهة

| الواجهة | الاستخدام |
| --- | --- |
| واجهة الطرفية | متابعة التشغيلات والتحكم فيها من لوحة المفاتيح |
| Web UI | متابعة التشغيلات والمخرجات المباشرة والموافقات والسجل في المتصفح |
| سطر الأوامر | بدء التشغيلات وقراءة المخرجات من السكربتات |
| خادم MCP | تكليف أداة برمجة موثوقة بتوجيه فريق |

<details>
<summary>لقطة شاشة لواجهة Web UI</summary>

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-ar.png" width="720" alt="واجهة reevesagents Web UI قبل أي تشغيلة: قائمة وكلاء فارغة، وأزرار تشغيلة جديدة، وعناصر التحكم في اللغة والإعدادات">

</details>

## التوثيق

- [دليل المستخدم](https://reevesagents.mertkayacs.com/ar/docs/): التثبيت والأوامر والإعداد.
- [الأسئلة الشائعة](https://reevesagents.mertkayacs.com/ar/faq/): إعداد المزوّدين وحل المشكلات.
- [مرجع MCP](../mcp.md): الأدوات واتصالات الأدوات المضيفة (بالإنجليزية).
- [دليل المساهمة](../../.github/CONTRIBUTING.md) و[الاختبارات](../testing.md) و[سجل التغييرات](../../CHANGELOG.md) (بالإنجليزية).

لغات أخرى: [English](../../README.md), [Deutsch](README.de.md), [Français](README.fr.md), [Español](README.es.md), [Português](README.pt.md), [Italiano](README.it.md), [Türkçe](README.tr.md), [Русский](README.ru.md), [简体中文](README.zh-Hans.md).

## الترخيص

[Apache-2.0](../../LICENSE). متاح على [npm](https://www.npmjs.com/package/reevesagents).

<a href="https://eschatialabs.com"><picture><source media="(prefers-color-scheme: dark) and (min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46-dark@2x.png"><source media="(prefers-color-scheme: dark)" srcset="https://eschatialabs.com/brand/lockup-46-dark@1x.png"><source media="(min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46@2x.png"><img src="https://eschatialabs.com/brand/lockup-46@1x.png" width="124" height="46" alt="Eschatia Labs"></picture></a><br>مشروع من [Eschatia Labs](https://eschatialabs.com) من تطوير [Mert Kaya](https://mertkayacs.com).
