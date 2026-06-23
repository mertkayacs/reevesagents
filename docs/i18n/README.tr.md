<p align="center">
  <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
</p>

[![npm version](https://img.shields.io/npm/v/reevesagents.svg)](https://www.npmjs.com/package/reevesagents)
[![visits](https://visitor-badge.laobi.icu/badge?page_id=mertkayacs.reevesagents&left_text=visits)](https://github.com/mertkayacs/reevesagents)
[![node](https://img.shields.io/node/v/reevesagents.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/reevesagents.svg)](../../LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI)](https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml)

[English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · **Türkçe** · [Русский](README.ru.md) · [简体中文](README.zh-Hans.md) · [العربية](README.ar.md)

*Bir agent diğerlerini oluştursun ve kontrol etsin. Agent'ları (Claude Code, Codex, Hermes, DeepSeek, Kimi ve daha fazlası) bir TUI, Web UI, CLI ve MCP üzerinden oluşturup yönetmek için yerel, tmux öncelikli bir çalışma alanı. API anahtarı yok, Agent.md veya Claude.md dosyanızda değişiklik yok.*

**10'dan fazla dilde!**

GitHub: https://github.com/mertkayacs/reevesagents

TUI ve yerel Web UI aynı run'ı sürüyor:

![ReevesAgents TUI: dil seçici, karşılama ekranı ve run'lar](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI: canlı bir çoklu agent run'ı](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web.png)

ReevesAgents, AI CLI agent'ları için ücretsiz ve açık kaynaklı bir çalışma alanı
yöneticisidir. Aynı anda birkaçını çalıştırın ve MCP üzerinden bir agent'ın
diğerlerini oluşturup yönetmesine izin verin: ayrı issue'lar üzerinde Codex ve
Claude Code agent'larını yöneten bir Claude Code agent'ı. Her CLI'yi en güçlü
olduğu yere koyun, örneğin backend'de DeepSeek, ürün ve web yönü için Claude,
bir tasarım sistemi veya bir uygulama geçişi için Codex ve mail, arama ya da
araştırma için Hermes.

UI 10 dilde mevcuttur: İngilizce, Almanca, Fransızca, İspanyolca, Portekizce,
İtalyanca, Türkçe, Rusça, Basitleştirilmiş Çince ve Arapça.

## Yüzeyler

| Yüzey | Ne işe yarar |
| --- | --- |
| **TUI** | Terminal içinde hızlı, klavye öncelikli kontrol. |
| **Web UI** | Run'lar, agent'lar, canlı pane'ler ve geçmişin tek bir görsel görünümü. |
| **CLI** | Script'ler, hızlı spawn komutları, doctor kontrolleri ve tmux açma. |
| **tmux** | Yerelde çalışmaya devam eden gerçek sağlayıcı CLI pencereleri. |
| **Agent Control (opt-in)** | Bir agent'ın diğerlerini oluşturup yönetebilmesi için her CLI'de açtığınız bir MCP (aynı anda Codex, Hermes ve Claude Code agent'larını çalıştıran Claude Code). |

## Neden ReevesAgents

- **Agent'ınız agent'ları sürsün.** Lider CLI'niz (örneğin Claude Code) MCP üzerinden bir grup Claude, Codex, DeepSeek, Hermes, OpenCode veya başka agent'ı oluşturur ve yönlendirir.
- **Çoklu görev ve döngü.** Agent'ları orkestrasyon tabanlı run'larla birleştirin ve daha akıllı ya da daha küçük olanları sürmek için önüne düşük-orta maliyetli bir router model koyun. Bir projenin farklı bölümlerinde paralel olarak birkaçını çalıştırın, döngüdeki agent'ları çalışır tutun ve tüm orkestrasyonu tek bir görünümden izleyin.
- **Maliyeti pratik tutun.** Her şeyi tek bir pahalı varsayılan üzerinden zorlamak yerine, siz daha büyük bir modelle plan ve tasarım yaparken ucuz veya ücretsiz modellerin CRUD'ları ve testleri yazmasına izin verin.
- **Tek çalışma alanı, kopmayan bağlam.** Halihazırda Claude, Codex, DeepSeek, Hermes veya OpenCode arasında geçiş yapıyorsanız, ReevesAgents bu oturumları tek bir yerel yere koyar; doğrudan sürmek için herhangi bir agent'ı TUI veya Web UI'dan açın.
- **Sağlayıcıdan bağımsız kalın.** Sağlayıcı girişi her CLI'de kalır. ReevesAgents asla kimlik bilgisi saklamaz veya model trafiğini proxy'lemez, böylece CLI'leri özgürce ekleyebilir, kaldırabilir ya da değiştirebilirsiniz.
- **İşi bir bakışta görün.** Aktif run'lar, agent'lar, modeller, izin modları, durdurma ve silme eylemleri ile geçmiş tek bir Web UI görünümünde, tmux gerçek CLI'leri canlı tutarken.

Bu bir bulut agent platformu değildir. Gerçek CLI'lerin etrafındaki küçük bir
yerel katmandır: veritabanı yok, Docker yok, arka plan daemon'u yok ve
ReevesAgents'ta saklanan API anahtarı yok.

## Kurulum

ReevesAgents, npm'de `reevesagents` olarak yayımlanır. Halihazırda
kullandığınız paket yöneticisiyle global olarak kurun, ardından makineyi
`doctor` ile doğrulayın.

```sh
npm install -g reevesagents
reevesagents doctor
reevesagents
```

Bir sürümü sabitlemek için paket adının sonuna `@<version>` ekleyin, örneğin
`npm install -g reevesagents@1.2.0`.

<details>
<summary><b>pnpm</b></summary>

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

Tek seferlik, global kurulum olmadan:

```sh
pnpm dlx reevesagents doctor
```

</details>

<details>
<summary><b>Yarn</b></summary>

Yarn (Berry) ile tek seferlik:

```sh
yarn dlx reevesagents doctor
```

Yarn Classic ile global kurulum:

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

Tek seferlik, global kurulum olmadan:

```sh
bunx reevesagents doctor
```

</details>

<details>
<summary><b>npx (kurulum yok)</b></summary>

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
<summary><b>Kaynaktan</b></summary>

Kodu incelemek, katkıda bulunmak veya depodan çalıştırmak istediğinizde
kaynağı kullanın.

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

## Ön Koşullar

ReevesAgents yerel önceliklidir. tmux ve en az bir sağlayıcı CLI'si zaten kurulu
olan normal bir geliştirici makinesi bekler.

- macOS, Linux veya WSL. Yerel Windows hedef çalışma ortamı değildir; WSL kullanın.
- Node.js `20.19+`.
- tmux. `3.0+` sürümü önerilir.
- `PATH` üzerinde normal, etkileşimli bir kabuk.
- `PATH` üzerinde desteklenen en az bir sağlayıcı CLI'si.

ReevesAgents, makinenizde kurulu ve kimliği doğrulanmış olduğunda bu sağlayıcı
CLI'lerini başlatabilir: Claude Code, Codex CLI, OpenCode, Hermes, Kimi,
DeepSeek, Pi, Qwen ve Aider. Sağlayıcı girişi, modeller, araçlar, kotalar ve
izin istemleri her sağlayıcıda kalır. ReevesAgents sağlayıcı API anahtarlarını
saklamaz ve model trafiğini proxy'lemez.

## Hızlı Başlangıç

```sh
reevesagents                 # TUI'yi başlat
reevesagents web             # yerel Web UI'yi aç
reevesagents doctor          # makineyi kontrol et
```

CLI'den adlandırılmış bir run başlatın. İlk spec lider, geri kalanı worker'dır
ve her spec `provider[:nickname[:model]]` biçimindedir:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:system hermes:research \
  --name "launch week build" \
  --prompt "Plan the backend, product surface, design system, and research notes."
```

## Komutlar

Argüman olmadan TUI başlar. Alt komutlar, insanlar ve script'ler için operatör
yüzeyidir.

| Komut | Amaç | Önemli flag'ler |
| --- | --- | --- |
| `reevesagents` | TUI'yi başlat (alt komut yok). | yok |
| `spawn [spec...]` | Bir veya daha fazla sağlayıcı agent'ı ile bir run başlat. Her `spec` `provider[:nickname[:model]]` biçimindedir. İlk spec lider, geri kalanı worker'dır. Spec yoksa varsayılan `codex`'tir. | `--name <name>` (varsayılan `run`), `--cwd <dir>` (varsayılan geçerli dizin), `--prompt <text>` (her agent'a yapıştırılır) |
| `runs` | Aktif run'ları, her satıra bir tane olacak şekilde listele. | `--json` (JSON dizisi olarak tam run kayıtları) |
| `open <id>` | tmux'u bir run'ın Reeves penceresine veya bir agent penceresine geçir. tmux içinde geçiş yapar; tmux dışında bir TTY'de attach eder; aksi halde yapıştırılabilir bir tmux komutu yazdırır. Bir run id'si/adı ya da bir agent id'si/takma adı kabul eder (önek eşleşmesine izin verilir). | yok |
| `peek <agent-id>` | Bir agent'tan son çıktıyı yazdır. | `-n, --lines <n>` (varsayılan `20`), `--json` (satırlar bir dizi olarak) |
| `stop <run-id>` | Bir run'ı durdur. | `-y, --yes` (veya `ALLOW_DESTRUCTIVE=1`) |
| `kill <agent-id>` | Bir agent'ı durdur. | `-y, --yes` (veya `ALLOW_DESTRUCTIVE=1`) |
| `doctor` | Ortam sağlık kontrollerini çalıştır (Node, tmux, durum yolu, sağlayıcı CLI'leri). Başarısız bir kontrolde sıfırdan farklı çıkış kodu verir. | `--json` |
| `web` | İstek üzerine, yalnızca loopback Web UI'yi başlat. Ön planda çalışır; siz durdurduktan sonra agent'lar çalışmaya devam eder. | `--port <n>` (tercih edilen port, bir sonraki boş porta düşer), `--no-open` (tarayıcıyı açma) |
| `mcp` | Agent Control MCP sunucusunu stdio üzerinden başlat. Elle çalıştırılmaz; Agent Control ekranından bağladığınız CLI çalıştırır. | yok |

`stop` ve `kill` tek yıkıcı komutlardır. `--yes` veya `ALLOW_DESTRUCTIVE=1`
olmadan çalışmayı reddederler.

## Agent Control (opt-in MCP)

ReevesAgents, bir AI CLI'sinin diğer AI CLI'lerini oluşturup yönetmesine izin
veren opsiyonel bir MCP sunucusuyla gelir: bir agent başlatma, bir prompt
yapıştırma, tuş gönderme, çıktı okuma ve onay isteklerini çözme. Bu, bir
orkestrasyon politikası değil düz bir mekanizmadır: rol yok, özerk döngü yok,
koordinasyon protokolü yok.

Varsayılan olarak kapalıdır. ReevesAgents bunu asla kendiliğinden bir CLI'ye
bağlamaz.

Bunu TUI veya Web UI'daki **Agent control** ekranından açarsınız. Bu ekran, bu
makinedeki bir MCP sunucusu barındırabilecek CLI'leri (claude, codex, kimi,
qwen, opencode, hermes) listeler ve bağlamanıza, ayırmanıza ya da tümünü
bağlamanıza izin verir. Bağlama, o CLI'nin kendi `mcp add` komutunu çalıştırır
(örneğin `claude mcp add reevesagents -- reevesagents mcp`); ayırma, eşleşen
kaldırmayı çalıştırır. ReevesAgents yalnızca her CLI'nin kendi komutunu çağırır
ve sağlayıcı yapılandırma dosyalarını asla elle düzenlemez. OpenCode istisnadır:
`mcp add`'i etkileşimlidir ve kaldırması yoktur, bu yüzden ekran onu elle-bağla
olarak işaretler.

Bir CLI bağlandıktan sonra, her başladığında Agent Control araçlarına sahip
olur. Kurmak sizin açık seçiminizdir ve o seçim, onayın kendisidir. Bir run,
baş olarak kontrol eden CLI ile onun oluşturduğu agent'lardan oluşur ve grubun
tamamı, diğer her run gibi TUI ve Web UI'da görünür.

Oluşturulan worker'lar MCP'yi varsayılan olarak almaz, bu yüzden daha fazla
agent oluşturamazlar. Bir worker'ın kendi alt worker'larını sürmesine izin
vermek için, aynı ekrandan o worker'ın CLI'sine MCP'yi bağlayın. Koruma
bariyerleri kaynak seviyesinde durur: spawn aracı bir run'a ekleme yaptığında
uygulanan run başına agent üst sınırı (`max_agents`) ve her agent'ın kendi tmux
pane'inde gerçek bir CLI süreci olması.

Bağlı bir CLI ayrıca neyi başlatabileceğini de keşfedebilir: `list_providers`
aracı ve `reevesagents://providers` kaynağı, bu makinedeki sağlayıcıları
id'leri, kurulum durumu, takma adları ve bilinen modelleriyle döndürür, böylece
bir agent tahmin yürütmek yerine `spawn`'a gerçek bir id geçirir.

Tam tasarım ve araç listesi için [docs/mcp.md](../mcp.md) dosyasına bakın.

## Yapılandırma

Durum ve yapılandırma yerel JSON'dır. Veritabanı yok, daemon yok.

Durum `~/.reeves` altında yaşar:

```text
~/.reeves/
  config.json     global ayarlar (peek aralığı, dil, varsayılan izinler, limitler)
  presets/        kaydedilmiş run hazır ayarları
  runs/           aktif run başına bir klasör (run.json artı agents/<id>.json)
  history/        arşivlenmiş, biten ve eskimiş run'lar (history/runs/<id>.json)
```

İki ortam değişkeni varsayılanları geçersiz kılar, başlıca izole test veya
çoklu profil kullanımı için:

- `REEVES_REGISTRY`: durum kök dizini geçersiz kılma. `runs/`, `history/` ve
  `presets/` için dizin olarak `~/.reeves`'in yerini alır.
- `REEVES_CONFIG`: yapılandırma dosyası yolu geçersiz kılma.
  `~/.reeves/config.json`'un yerini alır.

Gizli bilgi tutabilecek metin alanları, duruma yazılmadan önce maskelenir.

## Örnekler

Bir projeyi her işe uygun CLI'lere yayın:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" --prompt "Backend, product copy, and a review pass."
```

Neyin canlı olduğunu listeleyin ve run id'sini alın:

```sh
reevesagents runs
reevesagents runs --json   # script dostu
```

Kabuğunuzdan çıkmadan tek bir agent'ı izleyin, sonra sizi gerektiğinde içine
atlayın:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

İş bittiğinde, tüm run'ı tek bir çağrıyla durdurun:

```sh
reevesagents stop "feature x" --yes
```

## Web UI

Web UI yerel ve yalnızca loopback'tir.

```sh
reevesagents web
```

`127.0.0.1`'e bağlanır, ön planda çalışır ve siz durdurduğunuzda çıkar.
Agent'lar sonrasında tmux'ta çalışmaya devam eder. Tarayıcıdan run'lar
oluşturabilir, agent'lar ekleyebilir, sağlayıcı modellerini ve izin modlarını
seçebilir, agent'ları durdurabilir, biten işleri silebilir ve gerçek CLI'ler
çalışmaya devam ederken geçmişi inceleyebilirsiniz.

Web UI iki opsiyonel çalışma zamanı modülü kullanır, `ws` ve
`@lydell/node-pty`. npm bunları varsayılan olarak kurar. CLI ve TUI bunlar
olmadan çalışmaya devam eder ve `web` komutu neyin eksik olduğunu açıklar.

Web UI'ye başka bir makineden ulaşmak için loopback portunu SSH üzerinden
yönlendirin. Yerleşik bir tünel yoktur:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
# sonra tarayıcıda http://localhost:8080 adresini açın
```

## Sorun Giderme

**tmux kurulu değil.** ReevesAgents, pencere tabanlı gezinme için tmux'a
ihtiyaç duyar. Kurun (`brew install tmux` veya `apt install tmux`) ve
`reevesagents doctor` çalıştırın. TUI kendisini `reeves` adlı bir tmux
oturumuna otomatik olarak sarar; bu davranışı atlamak için
`REEVES_NO_TMUX_WRAPPER=1` ayarlayın.

**Bir sağlayıcı CLI'si eksik veya Doctor bir hata bildiriyor.** ReevesAgents
yalnızca `PATH`'inizde zaten bulunan ve kimliği doğrulanmış sağlayıcı
CLI'lerini başlatır. Hangi sağlayıcıların algılandığını ve neyin başarısız
olduğunu görmek için `reevesagents doctor` çalıştırın, sonra ihtiyaç
duyduğunuz sağlayıcı CLI'sini kurun veya ona giriş yapın.

**Web UI eksik paketler bildiriyor.** Web UI, `ws` ve `@lydell/node-pty`'ye
ihtiyaç duyar. Platformda önceden derlenmiş bir `@lydell/node-pty` ikili
dosyası olmadığında veya kurulum opsiyonel bağımlılıkları atladığında bunlar
atlanabilir. Opsiyonel bağımlılıklar etkin olacak şekilde yeniden kurun, sonra
`reevesagents doctor` çalıştırın.

**Port zaten kullanımda.** `reevesagents web` varsayılan olarak `8080`
portunda başlar. Doluysa, sunucu küçük bir aralıktaki bir sonraki boş porta
bağlanır ve seçilen URL'yi yazdırır. Farklı bir başlangıç portu seçmek için
`--port <n>` geçirin.

## Gerekli Değil

Normal, stabil agent run'ları için ReevesAgents'ta saklanan API anahtarlarına,
bir veritabanına, Docker'a, bir arka plan servisine veya MCP kurulumuna ihtiyaç
duymazsınız. Kurulum pasiftir: stabil paketin postinstall script'i yoktur ve
sağlayıcı yapılandırmasını yeniden yazmaz. Agent Control MCP'yi bağlamak,
sağlayıcı yapılandırmasına dokunan tek açık, opt-in adımdır ve yalnızca her
CLI'nin kendi `mcp add` komutu üzerinden.

## Katkıda Bulunma

Branch'ler ve pull request akışı için [CONTRIBUTING.md](../../.github/CONTRIBUTING.md),
güvenlik açıklarını bildirmek için [SECURITY.md](../../.github/SECURITY.md) ve son
değişiklikler için [CHANGELOG.md](../../CHANGELOG.md) dosyalarına bakın. Tasarım
modeli [REEVESAGENTS_DESIGN.md](../REEVESAGENTS_DESIGN.md) içinde yaşar ve
katkıda bulunan belgeleri [docs/](..) altındadır.

Son kullanıcıların geliştirme araç zincirine ihtiyacı yoktur. Katkıda
bulunanlar depodan pnpm, TypeScript, tsup, Vitest ve ESLint kullanır.

## Bağlantılar

- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Releases: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](../../CHANGELOG.md)
- License: [Apache-2.0](../../LICENSE)

## Lisans

Apache-2.0
