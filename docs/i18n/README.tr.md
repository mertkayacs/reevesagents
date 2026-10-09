<p align="center"><a href="https://reevesagents.mertkayacs.com/tr/"><img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-banner.gif" width="800" alt="ReevesAgents: yapay zekâ kodlama asistanlarını birlikte çalıştırın"></a></p>

# reevesagents: yapay zekâ kodlama araçları için bir çalışma alanı

Claude Code, Codex, Kimi, OpenCode, Hermes ve diğer yapay zekâ kodlama araçlarını bilgisayarınızda yan yana çalıştırın. reevesagents bu araçların terminal oturumlarını bir arada tutar; her aracın ne yaptığını görür, talimat gönderir ve bir run'ı tek yerden durdurursunuz.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-hero.webp" width="720" alt="Altın çerçeveli lider panel, ince altın tellerle sekiz parlayan cam panele bağlı; run'daki her araç için bir panel">

[Demoyu izleyin](https://reevesagents.mertkayacs.com/tr/demo/) ya da aşağıdan komut satırı aracını kurun.

## Hızlı başlangıç

Node.js 20.19 veya üstü, tmux 3.0 veya üstü ve kurulu, oturumu açık bir yapay zekâ kodlama aracı gerekir. macOS, Linux ve WSL'de çalışır. Arayüzü kapattığınızda araçlar tmux sayesinde çalışmaya devam eder.

```sh
npm install -g reevesagents && reevesagents doctor && reevesagents
```

Bu komut terminal arayüzünü açar. Tarayıcı arayüzü için `reevesagents web` komutunu çalıştırın; yalnızca bilgisayarınızın loopback adresini dinler.

## Bir ekip başlatın

Araçlara bir görev vererek run başlatın:

```sh
reevesagents spawn claude-code:lead codex:tests --name "review" --prompt "Kodu ve testleri incele."
```

Çıktıyı okumak ve her aracı yönlendirmek için terminal ya da tarayıcı arayüzünü kullanın. Her sağlayıcı kendi oturumunu korur ve model isteklerini kendisi gönderir. Run durumu `~/.reeves` altında JSON olarak saklanır.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-tr.png" width="720" alt="reevesagents Web UI'da yeni bir run başlatma: run adı, Claude Code, Codex CLI ve Kimi Code gibi araçların seçimi, bir model ve bir izin modu">

## Bir araç diğerlerini yönetsin

İsteğe bağlı MCP sunucusunu (Model Context Protocol, yapay zekâ araçları arasında standart bir bağlantı) güvendiğiniz bir ana araca bağlayın:

```sh
reevesagents attach claude && reevesagents hosts
```

Bağlantının yüklenmesi için o aracı yeniden başlatın. Ardından diğer araçları başlatabilir, çıktılarını okuyabilir, yönlendirebilir ve durdurabilir. Worker'lara varsayılan olarak MCP bağlantısı verilmez. Sağlayıcıların izin sorularını açık tutun ve hassas işlemlerden önce onayları gözden geçirin.

Claude Code'da bağlantıyı ve kullanım talimatlarını birlikte, eklenti olarak kurabilirsiniz:

```sh
claude plugin marketplace add mertkayacs/reevesagents
claude plugin install reevesagents@reevesagents
```

Diğer araçlar için kullanım talimatlarını [reevesagents skill'i](https://github.com/mertkayacs/reevesagents-skill) sağlar. Araç listesi ve gereksinimler için [MCP başvuru belgesine](../mcp.md) bakın.

Sunucu, [resmî MCP Registry'de](https://registry.modelcontextprotocol.io/?q=io.github.mertkayacs/reevesagents) `io.github.mertkayacs/reevesagents` adıyla listelenir.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-steer.webp" width="560" alt="Altın çerçeveli lider panel, altın teller boyunca diğer üç panele mesaj gönderiyor">

## Arayüz seçin

| Arayüz | Ne işe yarar |
| --- | --- |
| Terminal arayüzü | Run'ları klavyeyle izleyin ve yönetin |
| Web UI | Run'ları, canlı çıktıyı, onayları ve geçmişi tarayıcıda izleyin |
| Komut satırı | Script'lerden run başlatın ve çıktıyı okuyun |
| MCP sunucusu | Güvendiğiniz bir yapay zekâ kodlama aracı ekibi yönetsin |

<details>
<summary>Web UI ekran görüntüsü</summary>

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-tr.png" width="720" alt="Henüz run yokken reevesagents Web UI: boş agent listesi, Yeni run düğmeleri, dil ve ayar denetimleri">

</details>

## Belgeler

- [Kullanım kılavuzu](https://reevesagents.mertkayacs.com/tr/docs/): kurulum, komutlar ve yapılandırma.
- [SSS](https://reevesagents.mertkayacs.com/tr/faq/): sağlayıcı kurulumu ve sorun giderme.
- [MCP başvuru belgesi](../mcp.md): araçlar ve bağlantılar (İngilizce).
- [Katkı rehberi](../../.github/CONTRIBUTING.md), [testler](../testing.md) ve [değişiklik günlüğü](../../CHANGELOG.md) (İngilizce).

Diğer diller: [English](../../README.md), [Deutsch](README.de.md), [Français](README.fr.md), [Español](README.es.md), [Português](README.pt.md), [Italiano](README.it.md), [Русский](README.ru.md), [简体中文](README.zh-Hans.md), [العربية](README.ar.md).

## Lisans

[Apache-2.0](../../LICENSE). [npm](https://www.npmjs.com/package/reevesagents) üzerinde yayında.

<a href="https://eschatialabs.com"><picture><source media="(prefers-color-scheme: dark) and (min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46-dark@2x.png"><source media="(prefers-color-scheme: dark)" srcset="https://eschatialabs.com/brand/lockup-46-dark@1x.png"><source media="(min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46@2x.png"><img src="https://eschatialabs.com/brand/lockup-46@1x.png" width="124" height="46" alt="Eschatia Labs"></picture></a><br>[Mert Kaya](https://mertkayacs.com) tarafından geliştirilen bir [Eschatia Labs](https://eschatialabs.com) projesi.
