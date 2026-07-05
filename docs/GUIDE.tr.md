# ReevesAgents Kullanıcı Rehberi

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · **Türkçe** · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Sade, adım adım bir anlatım: kurun, ilk run'ınızı başlatın ve bir agent'ın diğerlerini yönetmesine izin verin. Tam komut ve seçenek referansı için [README](i18n/README.tr.md) dosyasına bakın.

## ReevesAgents nedir

- AI kodlama agent'ları (Claude Code, Codex, Hermes, DeepSeek, Kimi ve daha fazlası) için ücretsiz, yerel bir çalışma alanı. Hepsi makinenizde yan yana çalışır.
- Ana fikir: bir agent diğerlerini oluşturur ve yönetir. Bir Claude Code agent'ı, ayrı görevlerdeki Codex ve Claude Code agent'larından oluşan bir takımı başlatıp yönlendirebilir.
- Zaten elinizde olan gerçek CLI'lerin üstünde çalışır. Sağlayıcı girişi her CLI'de kalır. ReevesAgents API anahtarı saklamaz ve model trafiğinizi asla proxy'lemez.
- Veritabanı yok, Docker yok, arka plan servisi yok. Durum, `~/.reeves` altında yerel JSON'dur.

## Başlamadan önce

- macOS, Linux veya WSL (yerel Windows hedef değildir; WSL kullanın).
- Node.js 20.19 veya daha yenisi.
- tmux 3.0 veya daha yenisi.
- Kurulu ve giriş yapılmış en az bir sağlayıcı CLI'si: Claude Code, Codex, OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen veya Aider.

## Kurulum ve kontrol

- Global olarak kurun: `npm install -g reevesagents`
- Makinenizi kontrol edin: `reevesagents doctor` (Node'u, tmux'u, durum klasörünü ve hangi sağlayıcı CLI'lerini görebildiğini doğrular).
- Başlatın: `reevesagents`
- pnpm, Yarn, Bun, npx ya da Homebrew'u mu tercih ediyorsunuz? README'deki [Kurulum](i18n/README.tr.md#kurulum) bölümüne bakın.

## İlk run'ınız

En hızlı tekrarlanabilir run, komut satırından başlatılandır. Bir run'da bir lead agent ve istediğiniz sayıda worker olur; her agent `provider[:nickname[:model]]` biçiminde yazılır:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` lead, `codex:worker` ise worker'dır. Hiç agent belirtilmezse run varsayılan olarak `codex` ile başlar.
- `--name` run'ı etiketler, `--cwd` çalışma klasörünü belirler (varsayılanı bulunduğunuz yer), `--prompt` ise her agent'a yapıştırılır.

Görsel bir başlangıç mı tercih ediyorsunuz? TUI için `reevesagents`, yerel Web UI için `reevesagents web` çalıştırın ve run'ı oradan oluşturun.

## Kullanmanın beş yolu

Aynı run'lara beş yüzeyden ulaşırsınız. O an hangisi uygunsa onu seçin:

- **TUI** (`reevesagents`): terminal içinde hızlı, klavye öncelikli kontrol.
- **Web UI** (`reevesagents web`): run'ların, agent'ların, canlı pane'lerin ve geçmişin tek görsel görünümü. Yerel ve yalnızca loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): script'ler, hızlı komutlar ve sağlık kontrolleri.
- **tmux**: her agent kendi tmux pane'inde gerçek bir CLI'dir; TUI'yi veya Web UI'ı kapattıktan sonra da oturumlar yerelde çalışmaya devam eder.
- **Agent Kontrol** (`reevesagents attach <cli>`): bir agent'ın diğerlerini yönetmesini sağlayan opt-in MCP. Bir sonraki bölüm bunu adım adım anlatır.

## Bir agent'ın geri kalanını yönetmesini sağlayın

Temel özellik budur ve siz açana kadar kapalı kalır.

- Kendi CLI'niz için açın: `reevesagents attach claude` (barındırabildiği her kurulu CLI'ye bağlanmak için yalnızca `reevesagents attach`). Bunu TUI veya Web UI'daki **Agent Kontrol** ekranından da yapabilirsiniz.
- Doğrulayın: `reevesagents hosts`, makinenizdeki CLI'leri listeler ve hangilerinin bağlı olduğunu gösterir.
- CLI'nizi yeniden yükleyin: yeni araçları alması için oturumu yeniden başlatın (bu, MCP kullanır: bir agent aracının komutlarını bir diğerine açmasının standart yolu).
- Artık agent'ınız başka agent'ları oluşturup yönetebilir: bir agent'ı bir görevle başlatın, ona metin veya tuş vuruşu gönderin, ne yaptığını okuyun, istediklerini onaylayın ya da reddedin.

Somut bir örnek: Claude Code'a bağlanın ve yeniden başlatın; tek bir Claude Code oturumunun içinden bir issue için Codex agent'ı, bir başkası için ikinci bir Claude Code agent'ı başlatabilir, sonra ikisini de izleyip yönlendirebilirsiniz.

- Bunu bugün barındırabilen CLI'ler: claude, codex, kimi, qwen, opencode, hermes. OpenCode elle bağlanır; kendi ekleme adımı etkileşimlidir.
- Worker'lar bu araçları varsayılan olarak almaz; dolayısıyla bir worker daha fazla agent oluşturamaz. Bir worker'ın kendi alt agent'larını yönetmesine izin vermek için MCP'yi o worker'ın CLI'sine de bağlayın.
- Daha sonra bağlantıyı kesmek için: `reevesagents detach claude`.

## Gündelik görevler

- Neyin çalıştığını görün: `reevesagents runs` (script'ler için `--json` ekleyin).
- Kabuktan çıkmadan bir agent'ı izleyin: `reevesagents peek <agent> -n 40`.
- Bir agent'ın tmux pane'ine atlayın: `reevesagents open <agent>`.
- Bir run'ı bütünüyle durdurun: `reevesagents stop <run> --yes`.
- Tek bir agent'ı durdurun: `reevesagents kill <agent> --yes`.
- Agent'ların ne istediğini görün: `reevesagents approvals`, ardından `approve <id>` veya `deny <id>`.
- `stop` ve `kill` işi sonlandırır; `delete` komutları ise sonlanmış kayıtları kaldırır. Hiçbiri `--yes` olmadan çalışmaz.

## Maliyeti düşük tutmak

- İşi yönlendirmesi için öne ucuz ya da ücretsiz bir model koyun; ağır görevleri yalnızca gerektiğinde daha güçlü bir agent'a devretsin.
- Rutin kodu ve testleri ucuz modeller yazsın, plan ve tasarımı siz daha büyük bir modelle yapın; her şeyi tek bir pahalı varsayılandan geçirmeyin.
- Sağlayıcı kotaları ve faturalama her CLI'de kalır. ReevesAgents kendisi ek bir maliyet getirmez.

## Bir şeyler ters göründüğünde

- Önce `reevesagents doctor` çalıştırın. Node'u, tmux'u, durum klasörünü ve sağlayıcı CLI'lerinizi kontrol eder, neyin sorunlu olduğunu söyler.
- **tmux eksik:** kurun (`brew install tmux` veya `apt install tmux`) ve doctor'ı yeniden çalıştırın.
- **Bir sağlayıcı algılanmıyor:** ReevesAgents yalnızca `PATH`'inizde bulunan ve giriş yapılmış CLI'leri başlatır. O CLI'yi kurun ya da giriş yapın.
- **Web UI eksik paket bildiriyor:** `ws` ve `@lydell/node-pty` gerekir. Opsiyonel bağımlılıklar etkin olacak şekilde yeniden kurun.
- **Port zaten kullanımda:** `reevesagents web` `8080` ile başlar ve sıradaki boş porta geçer; başka bir port için `--port <n>` verin.
- Daha fazla ayrıntı için [Sorun Giderme](i18n/README.tr.md#sorun-giderme) bölümüne bakın.

## Sonra nereye

- [Doküman ana sayfası](README.md): tam dokümantasyon dizini.
- [Komutlar](i18n/README.tr.md#komutlar): her alt komut ve flag.
- [Agent Kontrol](i18n/README.tr.md#agent-kontrol): opt-in modelinin tamamı.
- [Yapılandırma](i18n/README.tr.md#yapılandırma): `~/.reeves` altında neler var.
- [docs/mcp.md](mcp.md): Agent Kontrol tasarımı ve araç listesi.
