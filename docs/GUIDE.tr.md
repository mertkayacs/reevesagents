# ReevesAgents Kullanıcı Rehberi

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · **Türkçe** · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Bu rehber sizi temiz bir kurulumdan alıp bir agent'ın diğerlerini sizin yerinize çalıştırdığı noktaya kadar götürür. Her komutun ve seçeneğin dökümünü aradığınız gün ise bakacağınız yer [README](i18n/README.tr.md).

## ReevesAgents nedir

- AI kodlama agent'larınızın (Claude Code, Codex, Hermes, DeepSeek, Kimi ve daha fazlası) makinenizde yan yana çalıştığı ücretsiz, yerel bir çalışma alanı.
- Bir agent MCP üzerinden diğerlerini oluşturup yönetebilir. Örneğin bir Claude Code oturumu, ayrı görevlere atanmış Codex ve Claude Code agent'larını çalıştırabilir.
- ReevesAgents'ı düz bir çalışma alanı olarak da kullanabilirsiniz: istediğiniz agent'ları oluşturun ve `reevesagents add` ile eklemeye devam edin. Yan yana dururlar; siz MCP'yi devreye alana kadar kimse kimseyi kontrol etmez.
- Zaten elinizde olan CLI'lerin üstüne oturur, bu yüzden her giriş öteden beri durduğu yerde kalır. ReevesAgents hiçbir zaman API anahtarı tutmaz, model trafiğinize de elini sürmez.
- Bütün durumu `~/.reeves` altındaki bir avuç JSON'dan ibaret. Ayakta tutulacak bir veritabanı, çekilecek bir Docker imajı, arka planda bekleyen bir süreç yok.

## Başlamadan önce

- macOS, Linux veya WSL (yerel Windows hedef değildir; WSL kullanın).
- Node.js 20.19 veya daha yenisi.
- tmux 3.0 veya daha yenisi.
- Kurulu ve giriş yapılmış en az bir sağlayıcı CLI'si: Claude Code, Codex, OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen veya Aider.

## Kurulum ve kontrol

- Homebrew ile kurun: `brew install mertkayacs/reevesagents/reevesagents`, ya da pnpm gibi bir Node paket yöneticisiyle global olarak: `pnpm add -g reevesagents`
- Makinenizi kontrol edin: `reevesagents doctor` (Node'u, tmux'u, durum klasörünü ve hangi sağlayıcı CLI'lerini görebildiğini doğrular).
- Başlatın: `reevesagents`
- npm, Yarn, Bun ya da npx ile kurmak isterseniz README'deki [Kurulum](i18n/README.tr.md#kurulum) bölümüne bakın.

## İlk run'ınız

Tekrarlanabilir bir run'ı en hızlı komut satırından açarsınız. Bir run'da bir lead agent ile istediğiniz sayıda worker bulunur ve her agent `provider[:nickname[:model]]` biçiminde yazılır:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` burada lead, `codex:worker` ise worker. Hiç agent yazmazsanız run varsayılan olarak `codex` ile açılır.
- `--name` run'a etiketini verir, `--cwd` çalışma klasörünü seçer (varsayılanı o an bulunduğunuz yer), `--prompt` ise her agent'a yapıştırılır.

Görsel başlamayı tercih ederseniz TUI için `reevesagents`, yerel Web UI için `reevesagents web` çalıştırın ve run'ı oradan oluşturun.

Bütün takımı baştan planlamak istemiyor musunuz? Tek bir agent oluşturun, çalışma alanını da ilerledikçe büyütün. `add`, en son run'ınıza katılır, yani ortada kopyalanacak bir run id'si olmaz:

```sh
reevesagents spawn claude-code:lead
reevesagents add codex:worker
```

## Kullanmanın beş yolu

Aynı run'lara beş ayrı yüzeyden ulaşırsınız. O an hangisi işinize geliyorsa onu seçin:

- **TUI** (`reevesagents`): çoğu kişinin gününü içinde geçirdiği terminal uygulaması. Her şey görünür bir menü olduğu için ok tuşlarından fazlasına ihtiyacınız olmaz.
- **Web UI** (`reevesagents web`): aynı run'ların tek bir tarayıcı sayfasına toplanmış hali, üstelik istediğiniz agent'ın içine canlı bakabilirsiniz. Dışarıya hiç açılmaz, yalnızca loopback üzerinden yanıt verir.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): script'ler için, bir de gezinmektense yazmayı tercih ettiğiniz günler için.
- **tmux**: agent'ların asıl yaşadığı yer. Her biri kendi pane'inde gerçek bir CLI olduğundan, TUI'yi ya da Web UI'yi kapatmanız kimsenin işini yarıda kesmez.
- **Agent Kontrol** (`reevesagents attach <cli>`): bir agent'ın diğerlerini yönetmesini sağlayan opt-in MCP. Bir sonraki bölüm bunu adım adım anlatıyor.

## Bir agent'ın geri kalanını yönetmesini sağlayın

Temel özellik bu ve siz açana kadar kapalı durur.

- Kendi CLI'niz için `reevesagents attach claude` ile açın. Barındırabildiği her kurulu CLI'yi tek seferde bağlamak isterseniz argümansız bir `reevesagents attach` da yeter. TUI ve Web UI'daki **Agent Kontrol** ekranı aynı işi görür.
- `reevesagents hosts` durumu önünüze serer: makinedeki her CLI ve bunlardan hangilerinin bağlı olduğu.
- Sonra o CLI'yi bir kez yeniden başlatın, çünkü araçlar yalnızca oturum başında yüklenir (bu düpedüz MCP: bir agent aracının komutlarını bir diğerine açmasının standart yolu).
- O noktadan sonra agent'ınız yeni bir agent'ı göreve koyar, içine yazar, ne yaptığını okur ve her ne istiyorsa onaylar ya da reddeder.

Somut bir örnek: Claude Code'a bağlanın ve yeniden başlatın. Artık tek bir Claude Code oturumunun içinden bir issue'ya Codex agent'ı, bir başkasına ikinci bir Claude Code agent'ı çıkarabilir, sonra ikisini birden izleyip yönlendirebilirsiniz.

- Bunu bugün barındırabilen CLI'ler: claude, codex, kimi, qwen, opencode, hermes. OpenCode elle bağlanır, çünkü kendi ekleme adımı etkileşimlidir.
- Worker'lar bu araçları varsayılan olarak almaz, dolayısıyla bir worker kendi başına yeni agent açamaz. Bir worker'ın kendi alt agent'larını yönetmesini istiyorsanız MCP'yi o worker'ın CLI'sine de bağlayın.
- Sonradan bağlantıyı kesmek için: `reevesagents detach claude`.

## Gündelik görevler

- Neyin çalıştığını görün: `reevesagents runs` (script'ler için `--json` ekleyin).
- Kabuktan çıkmadan bir agent'ı izleyin: `reevesagents peek <agent> -n 40`.
- Bir agent'ın tmux pane'ine atlayın: `reevesagents open <agent>`.
- Bir run'ı bütünüyle durdurun: `reevesagents stop <run> --yes`.
- Tek bir agent'ı durdurun: `reevesagents kill <agent> --yes`.
- Agent'ların ne istediğini görün: `reevesagents approvals`, ardından `approve <id>` veya `deny <id>`.
- `stop` ve `kill` işi bitirir, `delete` komutları da sonlanmış kayıtları kaldırır. Hiçbiri `--yes` olmadan çalışmaya yanaşmaz.

## Maliyeti düşük tutmak

- Öne yönlendirici olarak ucuz ya da ücretsiz bir model koyun, pahalı olanı da yalnızca bir iş gerçekten hak ettiğinde uyandırsın.
- Rutin kod ve testler zaten tam olarak ucuz modellerin işi. Büyük modele boilerplate yazdırıp para saymak yerine onu plana ve tasarıma saklayın.
- Bunun size maliyeti ne olursa olsun, hepsi sağlayıcılarınızın bildik faturasıdır. ReevesAgents'ın üstüne eklediği bir şey yok.

## Bir şeyler ters göründüğünde

- İşe `reevesagents doctor` ile başlayın, çünkü sorunun adını çoğu zaman sizin yerinize o koyar: Node, tmux, durum klasörü ve her sağlayıcı CLI'si tek tek kontrol edilir.
- **tmux eksik:** kurun (`brew install tmux` veya `apt install tmux`), gerisini doctor'a doğrulatın.
- **Bir sağlayıcı algılanmıyor:** neredeyse her zaman ya kurulu değildir ya da giriş yapılmamıştır. ReevesAgents yalnızca `PATH`'inizde duran ve oturumu açık CLI'leri başlatabilir.
- **Web UI eksik paket bildiriyor:** opsiyonel `ws` ve `@lydell/node-pty` modülleri kurulum sırasında atlanmış demektir. Normal bir yeniden kurulum ikisini de geri getirir.
- **Port zaten kullanımda:** ortada bir sorun yok, `reevesagents web` sıradaki boş portu alıp URL'yi yazdırır. Hangi port olacağı sizin için önemliyse `--port <n>` verin.
- Daha fazla ayrıntı [Sorun Giderme](i18n/README.tr.md#sorun-giderme) bölümünde.

## Sonra nereye

- [Doküman ana sayfası](README.md): tam dokümantasyon dizini.
- [Komutlar](i18n/README.tr.md#komutlar): her alt komut ve flag.
- [Agent Kontrol](i18n/README.tr.md#agent-kontrol): opt-in modelinin tamamı.
- [Yapılandırma](i18n/README.tr.md#yapılandırma): `~/.reeves` altında neler var.
- [docs/mcp.md](mcp.md): Agent Kontrol tasarımı ve araç listesi.
