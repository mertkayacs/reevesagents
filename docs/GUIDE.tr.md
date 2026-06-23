# ReevesAgents Kullanıcı Rehberi

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · **Türkçe** · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Basit, adım adım rehber: kurulumu yapın, ilk çalıştırmanızı gerçekleştirin ve bir agent'ın diğerlerini yönetmesine izin verin. Tam komut ve seçenek referansı için [README](../README.tr.md) dosyasına bakın.

## ReevesAgents nedir

- AI kodlama agent'ları (Claude Code, Codex, Hermes, DeepSeek, Kimi ve daha fazlası) için ücretsiz, yerel bir çalışma alanı. Bunlar makinenizde yan yana çalışır.
- Ana fikir: bir agent diğerlerini oluşturur ve yönetir. Bir Claude Code agent'ı ayrı görevlerde Codex ve Claude Code agent'larından oluşan bir takım başlatabilir ve yönetebilir.
- Zaten sahip olduğunuz gerçek CLI'ler üstünde çalışır. Sağlayıcı girişi her CLI'de kalır. ReevesAgents API anahtarı saklamaz ve model trafiğini proxy'lemez.
- Veritabanı yok, Docker yok, arka plan servisi yok. Durum `~/.reeves` altında yerel JSON'dur.

## Başlamadan önce

- macOS, Linux veya WSL (yerel Windows hedef değildir; WSL kullanın).
- Node.js 20.19 veya daha yeni.
- tmux 3.0 veya daha yeni.
- En az bir sağlayıcı CLI kurulu ve kimliği doğrulanmış: Claude Code, Codex, OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen veya Aider.

## Kurulum ve kontrol

- Global olarak kurun: `npm install -g reevesagents`
- Makinenizi kontrol edin: `reevesagents doctor` (Node, tmux, durum klasörü ve hangi sağlayıcı CLI'lerini görebildiğini doğrular).
- Başlatın: `reevesagents`
- pnpm, Yarn, Bun, npx veya Homebrew'u tercih ediyor musunuz? [Install](../README.tr.md#kurulum) bölümüne bakın.

## İlk çalıştırmanız

Komut satırından en hızlı tekrarlanabilir çalıştırma. Bir çalıştırmada bir lider agent ve istediğiniz kadar worker var; her agent `provider[:nickname[:model]]` olarak yazılır:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` lider, `codex:worker` bir worker'dır. Agent adı verilmezse varsayılan `codex`'tir.
- `--name` çalıştırmayı etiketler, `--cwd` çalışma klasörü belirler (varsayılan bulunduğunuz yer) ve `--prompt` her agent'a yapıştırılır.

Görsel bir başlangıç tercih ediyor musunuz? TUI için `reevesagents` veya yerel Web UI için `reevesagents web` çalıştırın ve çalıştırmayı oradan oluşturun.

## Kullanmanın dört yolu

Aynı çalıştırmalara dört yüzeyden ulaşırsınız. Anın gerektirdiğini seçin:

- **TUI** (`reevesagents`): terminal içinde hızlı, klavye öncelikli kontrol.
- **Web UI** (`reevesagents web`): çalıştırmalar, agent'lar, canlı pane'ler ve geçmiş için tek görsel görünüm. Yerel ve yalnızca loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): script'ler, hızlı komutlar ve sağlık kontrolleri.
- **tmux**: her agent gerçek bir CLI'nin kendi tmux pane'inde çalışır, TUI veya Web UI'ı kapattıktan sonra da oturumlar yerelde çalışmaya devam eder.

## Bir agent'ın geri kalanını yönetmesini sağlayın

Bu temel özelliktir ve siz açmadığınız sürece kapalı kalır.

- CLI'niz için açın: `reevesagents attach claude` (veya tümü için barındırabileceği her kurulu CLI'ye bağlanmak için `reevesagents attach`). Bunu TUI veya Web UI'daki **Agent Kontrol** ekranından da yapabilirsiniz.
- Doğrulayın: `reevesagents hosts` makinenizde CLI'leri listeler ve hangilerine bağlı olduğunu gösterir.
- CLI'nizi yeniden yükleyin: oturumu yeniden başlatın ve yeni araçları yükleyin (bu MCP'yi kullanır, bir agent aracının komutları diğer bir agent'a nasıl ortaya koyar).
- Şimdi agent'ınız diğer agent'ları oluşturabilir ve yönetebilir: bir agent'ı bir görevde başlatın, ona metin veya tuş vuruşları gönderin, ne yaptığını okuyun ve isteklerini onaylayın veya reddedin.

Çalışan örnek: Claude Code'a bağlanın, yeniden başlatın ve bir Claude Code oturumunun içinden bir Codex agent'ını bir issue üzerinde ve ikinci bir Claude Code agent'ını diğer bir issue üzerinde başlatın, sonra her ikisini de izleyin ve yönetin.

- Bunu bugün barındırabilen CLI'ler: claude, codex, kimi, qwen, opencode, hermes. OpenCode elle bağlanır, çünkü kendi ekleme adımı etkileşimlidir.
- Worker'lar varsayılan olarak bu araçları almaz, bu nedenle bir worker daha fazla agent oluşturamazlar. Bir worker'ın kendi alt agent'larını yönetmesine izin vermek için, o worker'ın CLI'sine de MCP'yi bağlayın.
- Daha sonra bağlantıyı kesmek için: `reevesagents detach claude`.

## Gündelik görevler

- Ne çalışıyor görün: `reevesagents runs` (scriptler için `--json` ekleyin).
- Kabuğunuzdan ayrılmadan bir agent'ı izleyin: `reevesagents peek <agent> -n 40`.
- Bir agent'ın tmux pane'ine gidin: `reevesagents open <agent>`.
- Tüm bir çalıştırmayı durdurun: `reevesagents stop <run> --yes`.
- Tek bir agent'ı durdurun: `reevesagents kill <agent> --yes`.
- `stop` ve `kill` işi sonlandıran tek komutlardır, bu nedenle `--yes` olmadan çalışmayı reddederler.

## Maliyeti düşük tutmak

- İşi yönlendirmek için ucuz veya ücretsiz bir model önüne koyun ve ağır görevleri yalnızca gerektiğinde daha güçlü bir agent'a verin.
- Pahalı bir varsayılanın tamamını zorlamak yerine, ucuz modellerin rutin kodu ve testleri yazmasına izin verin, siz de daha büyük bir modelle plan ve tasarım yapın.
- Sağlayıcı kotaları ve faturalandırma her CLI'de kalır. ReevesAgents kendi maliyeti eklemez.

## Bir şey garip görünüyorsa

- Önce `reevesagents doctor` çalıştırın. Node, tmux, durum klasörü ve sağlayıcı CLI'lerinizi kontrol eder ve neyin başarısız olduğunu söyler.
- **tmux eksik:** kurun (`brew install tmux` veya `apt install tmux`) ve doctor'ı tekrar çalıştırın.
- **Bir sağlayıcı algılanmıyor:** ReevesAgents yalnızca `PATH`'inizde bulunan ve kimliği doğrulanmış CLI'leri başlatır. O CLI'yi kurun veya ona giriş yapın.
- **Web UI eksik paketler bildiriyor:** `ws` ve `@lydell/node-pty` gerektirir. Opsiyonel bağımlılıklar etkin olacak şekilde yeniden kurun.
- **Port zaten kullanımda:** `reevesagents web` `8080` portunda başlar ve boş bir porta geri döner; farklı bir port seçmek için `--port <n>` geçirin.
- Daha fazla ayrıntı için [Sorun Giderme](../README.tr.md#sorun-giderme) bölümüne bakın.

## Sonra nereye

- [Doküman ana sayfası](README.md): tam dokümantasyon dizini.
- [Komutlar](../README.tr.md#komutlar): her alt komut ve flag.
- [Agent Kontrol](../README.tr.md#agent-kontrol): tam opt-in modeli.
- [Yapılandırma](../README.tr.md#yapılandırma): `~/.reeves` altında neler yaşar.
- [docs/mcp.md](mcp.md): Agent Control tasarımı ve araç listesi.
