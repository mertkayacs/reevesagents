<p align="center">
  <a href="https://reevesagents.mertkayacs.com">
    <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
  </a>
</p>

[![npm version](https://img.shields.io/npm/v/reevesagents.svg)](https://www.npmjs.com/package/reevesagents)
[![visits](https://visitor-badge.laobi.icu/badge?page_id=mertkayacs.reevesagents&left_text=visits)](https://github.com/mertkayacs/reevesagents)
[![node](https://img.shields.io/node/v/reevesagents.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/reevesagents.svg)](../../LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI)](https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml)

<h3 align="center"><a href="https://reevesagents.mertkayacs.com">reevesagents.mertkayacs.com</a></h3>
<p align="center">
  <a href="https://reevesagents.mertkayacs.com/demo"><b>Demo</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/docs"><b>Dokümanlar</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/faq"><b>SSS</b></a> ·
  <a href="https://github.com/mertkayacs/reevesagents/issues"><b>Issue'lar</b></a>
</p>

[English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · **Türkçe** · [Русский](README.ru.md) · [简体中文](README.zh-Hans.md) · [العربية](README.ar.md)

*AI agent'larını başka agent'ların içinden oluşturun ve yönetin. ReevesAgents, kodlama agent'larının (Claude Code, Codex, Hermes, DeepSeek ve Kimi gibi) yan yana çalıştığı ve bir agent'ın diğerlerini oluşturabildiği, yönlendirebildiği ve denetleyebildiği ücretsiz, yerel bir çalışma alanıdır. API anahtarı yok, mevcut Agent.md veya Claude.md dosyanızda değişiklik yok.*

**10 dilde!**

## Bir agent kursun, gerisini de o çalıştırsın

Fikrin tamamı bu: bir AI agent'ı diğerlerini oluşturur ve yönetir. Bir agent CLI'si (Claude Code, Codex veya Hermes gibi bir komut satırı kodlama agent'ı) ReevesAgents'ı kendi başına kurup bağlayabilir, ardından bir takım çalıştırmaya başlayabilir.

**Bunu okuyan bir agent'sanız, şunları kendiniz çalıştırın:**

- **Kurun:** `npm install -g reevesagents`
- **Kendi CLI'nize bağlayın:** `reevesagents attach`, ReevesAgents'ı kurulu agent CLI'lerinize bağlar. Yalnızca biri için adını verin, örneğin `reevesagents attach claude`.
- **Çalıştığını doğrulayın:** `reevesagents hosts`, bu makinedeki agent CLI'lerini listeler ve hangilerinin bağlı olduğunu gösterir.
- **Araçlarınızı yeniden yükleyin:** bağlantıyı alması için CLI oturumunuzu yeniden başlatın (bu, MCP kullanır: bir agent aracının komutlarını bir diğerine açmasının standart yolu).

Artık agent CLI'niz **başka agent'ları oluşturup yönetebilir**: bir agent'ı bir görevle başlatabilir, ona metin veya tuş vuruşu gönderebilir, ne yaptığını okuyabilir, isteklerini onaylayabilir ya da reddedebilir. Tek bir Claude Code agent'ı, ayrı issue'lar üzerindeki Codex ve Claude Code agent'larından oluşan bir takımı çalıştırabilir. Daha sonra bağlantıyı kesmek için `reevesagents detach claude` komutunu çalıştırın.

Bunun yerine işi komut satırından script'lemeyi mi tercih ediyorsunuz? [AGENTS.tr.md](../../AGENTS.tr.md), agent'lar için yazılmış operatör rehberi: sağlayıcı id'leri ve takma adları, `spawn` spec'i ve çalışan bir takımın nasıl izlenip yönlendirileceği.

Elle kurmayı mı tercih ediyorsunuz? TUI veya Web UI'daki **Agent Kontrol** ekranından açın; aşağıdaki [Agent Kontrol](#agent-kontrol) bölümüne bakın.

Aynı run'ı yöneten TUI ve yerel Web UI:

![ReevesAgents TUI: dil seçici, karşılama menüsü ve Doctor ekranı](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI: çalışmalar ve canlı agent bölmeleri](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-tr.png)

![ReevesAgents Web UI: yeni bir çalışma başlatma](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-tr.png)

ReevesAgents, AI kodlama agent'ları için ücretsiz ve açık kaynaklı bir çalışma alanıdır. Aynı anda birkaç agent çalıştırın ve birinin diğerlerini oluşturup yönetmesine izin verin: ayrı issue'lar üzerindeki Codex ve Claude Code agent'larını yöneten bir Claude Code agent'ı gibi. Her agent'ı en güçlü olduğu yere koyun: örneğin backend'e DeepSeek, ürün ve web yönlendirmesine Claude, tasarım sistemine ya da bir implementasyon turuna Codex, mail, arama ve araştırmaya Hermes.

UI 10 dilde mevcut: İngilizce, Almanca, Fransızca, İspanyolca, Portekizce, İtalyanca, Türkçe, Rusça, Basitleştirilmiş Çince ve Arapça.

ReevesAgents'a yeni misiniz? [Kullanıcı Rehberi](../GUIDE.tr.md) kurulumu, ilk run'ınızı ve bir agent'ın diğerlerini yönetmesini adım adım anlatır.

## Yüzeyler

| Yüzey | Ne işe yarar |
| --- | --- |
| **TUI** | Terminal içinde hızlı, klavye öncelikli kontrol. |
| **Web UI** | Run'ların, agent'ların, canlı pane'lerin ve geçmişin tek görsel görünümü. |
| **CLI** | Script'ler, hızlı spawn komutları, doctor kontrolleri ve tmux açma. |
| **tmux** | Yerelde çalışmaya devam eden gerçek sağlayıcı CLI pencereleri. |
| **Agent Kontrol** | Temel fikir: bir agent diğerlerini oluşturur ve yönetir. CLI başına açarsınız; sonra bir Claude Code agent'ı Codex, Hermes ve Claude Code agent'larını aynı anda çalıştırabilir. |

## Neden ReevesAgents

- **Agent'ınız agent'ları yönetsin.** Lead CLI'niz (örneğin Claude Code), MCP üzerinden bir grup Claude, Codex, DeepSeek, Hermes, OpenCode veya başka agent'ı oluşturur ve yönlendirir.
- **Çoklu görev, kesintisiz döngü.** Bir projenin farklı bölümlerinde paralel olarak birkaç agent çalıştırın, uzun süreli agent'ları çalışır tutun ve hepsini tek görünümden izleyin. İşi daha akıllı ya da daha küçük agent'lara yönlendirmesi için öne daha ucuz bir model koyun.
- **Maliyeti makul tutun.** Rutin kodu ve testleri ucuz ya da ücretsiz modeller yazsın, plan ve tasarımı siz daha büyük bir modelle yapın; her şeyi tek bir pahalı varsayılandan geçirmeyin.
- **Tek çalışma alanı, kopmayan bağlam.** Zaten Claude, Codex, DeepSeek, Hermes veya OpenCode arasında gidip geliyorsanız, ReevesAgents bu oturumları tek bir yerel yerde toplar; doğrudan yönetmek için herhangi bir agent'ı TUI'den veya Web UI'dan açın.
- **Sağlayıcıya bağımlı kalmayın.** Sağlayıcı girişi her CLI'de kalır. ReevesAgents kimlik bilgisi saklamaz, model trafiğini de proxy'lemez; CLI'leri dilediğiniz gibi ekleyebilir, kaldırabilir ya da değiştirebilirsiniz.
- **İşi bir bakışta görün.** Aktif run'lar, agent'lar, modeller, izin modları, durdurma ve silme eylemleri ve geçmiş tek bir Web UI görünümünde; tmux ise gerçek CLI'leri canlı tutar.

Bu bir bulut agent platformu değil. Gerçek CLI'lerin etrafında küçük bir yerel katman: veritabanı yok, Docker yok, arka plan daemon'u yok, ReevesAgents'ta saklanan API anahtarı yok.

## Kurulum

ReevesAgents, npm'de `reevesagents` adıyla yayımlanır. Zaten kullandığınız paket yöneticisiyle global olarak kurun, ardından makineyi `doctor` ile doğrulayın.

```sh
npm install -g reevesagents
reevesagents doctor
reevesagents
```

Bir sürümü sabitlemek için paket adının sonuna `@<version>` ekleyin, örneğin
`npm install -g reevesagents@1.3.1`.

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

Kodu incelemek, katkıda bulunmak veya depodan çalıştırmak istediğinizde kaynağı kullanın.

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

ReevesAgents yerel önceliklidir. tmux'un ve en az bir sağlayıcı CLI'sinin kurulu olduğu normal bir geliştirici makinesi bekler.

- macOS, Linux veya WSL. Yerel Windows hedef çalışma ortamı değildir; WSL kullanın.
- Node.js `20.19+`.
- tmux. `3.0+` sürümü önerilir.
- `PATH` üzerinde normal, etkileşimli bir kabuk.
- `PATH` üzerinde desteklenen en az bir sağlayıcı CLI'si.

ReevesAgents, makinenizde kurulu ve kimliği doğrulanmış olduklarında şu sağlayıcı CLI'lerini başlatabilir: Claude Code, Codex CLI, OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen ve Aider. Sağlayıcı girişi, modeller, araçlar, kotalar ve izin istemleri her sağlayıcıda kalır. ReevesAgents sağlayıcı API anahtarlarını saklamaz ve model trafiğini proxy'lemez.

## Hızlı Başlangıç

```sh
reevesagents                 # TUI'yi başlat
reevesagents web             # yerel Web UI'yi aç
reevesagents doctor          # makineyi kontrol et
```

CLI'den adlandırılmış bir run başlatın. İlk spec lead, geri kalanı worker'dır ve her spec `provider[:nickname[:model]]` biçimindedir:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:system hermes:research \
  --name "launch week build" \
  --prompt "Plan the backend, product surface, design system, and research notes."
```

Baştan sona bir anlatım için [Kullanıcı Rehberi](../GUIDE.tr.md)'ne bakın.

## Komutlar

Argüman verilmeden çalıştırıldığında TUI açılır. Alt komutlar, insanlar ve script'ler için operatör yüzeyidir.

Gündelik yüzey:

| Komut | Amaç |
| --- | --- |
| `reevesagents` | TUI'yi başlat (alt komut yok). |
| `spawn [spec...]` | Bir veya daha fazla sağlayıcı agent'ıyla bir run başlat. Her `spec`, `provider[:nickname[:model]]` biçimindedir. İlk spec lead, geri kalanı worker'dır. Spec verilmezse varsayılan `codex`'tir. Önemli flag'ler: `--name <name>` (varsayılan `run`), `--cwd <dir>` (varsayılan geçerli dizin), `--prompt <text>` (her agent'a yapıştırılır), `--skip` (izin istemlerini atla), `--run <run-id>` (agent'ları var olan bir run'a ekle), `--auth-mode <mode>`, `--effort <level>`, `--json`. |
| `runs` | Aktif run'ları, her satıra bir tane olacak şekilde listele. Önemli flag'ler: `--json` (JSON dizisi olarak tam run kayıtları). |
| `agents [run-id]` | Tüm run'lardaki agent'ları ya da tek bir run'dakileri listele. Önemli flag'ler: `--json`. |
| `open <id>` | tmux'u bir run'ın Reeves penceresine veya bir agent penceresine geçir. tmux içindeyken pencere değiştirir; tmux dışında bir TTY'deyse attach eder; aksi halde yapıştırılabilir bir tmux komutu yazdırır. Run id'si/adı ya da agent id'si/takma adı kabul eder (önek eşleşmesine izin verilir). |
| `peek <agent-id>` | Bir agent'ın son çıktısını yazdır. Önemli flag'ler: `-n, --lines <n>` (varsayılan `20`), `--json` (satırlar bir dizi olarak). |
| `send <agent-id> <text...>` | Bir agent'ın prompt'una metin yapıştır. Kendisi göndermez; peşinden `key <agent-id> enter` gerekir. |
| `key <agent-id> <key>` | Tek bir tuş gönder: `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`, `right` veya `ctrl-c`. |
| `interrupt <agent-id>` | Bir agent'a ctrl-c gönder. |
| `stop <run-id>` | Bir run'ı durdur. Önemli flag'ler: `-y, --yes` (veya `ALLOW_DESTRUCTIVE=1`). |
| `kill <agent-id>` | Bir agent'ı durdur. Önemli flag'ler: `-y, --yes` (veya `ALLOW_DESTRUCTIVE=1`). |
| `doctor` | Ortam sağlık kontrollerini çalıştır (Node, tmux, durum yolu, sağlayıcı CLI'leri). Herhangi bir kontrol başarısız olursa sıfır dışı çıkış koduyla biter. Önemli flag'ler: `--json`. |
| `web` | İstek üzerine çalışan, yalnızca loopback Web UI'yi başlat. Ön planda çalışır; siz durdurduktan sonra agent'lar çalışmaya devam eder. Önemli flag'ler: `--port <n>` (tercih edilen port; doluysa sıradaki boş porta geçer), `--no-open` (tarayıcıyı açma). |

Keşif, onaylar, agent kontrolü, yapılandırma ve temizlik:

| Komut | Amaç |
| --- | --- |
| `providers` | Her sağlayıcıyı kullanılabilirliği, takma adları ve bilinen modelleriyle listele. Önemli flag'ler: `--models`, `--json`. |
| `approvals` | Agent'lardan gelen bekleyen onay isteklerini listele. Önemli flag'ler: `--json`. |
| `approve <approval-id> [note]` | Bir onay isteğini onaylayarak sonuçlandır. |
| `deny <approval-id> [note]` | Bir onay isteğini reddederek sonuçlandır. |
| `hosts` | Bu makinedeki agent CLI'lerini listele ve ReevesAgents'ın hangilerine bağlı olduğunu göster. |
| `attach [cli]` | ReevesAgents'ı bir agent CLI'sine bağla; ad verilmezse kurulu her CLI'ye bağlanır. O CLI'nin kendi `mcp add` komutunu çalıştırır. |
| `detach <cli>` | ReevesAgents'ı bir agent CLI'sinden ayır. O CLI'nin kendi `mcp remove` komutunu çalıştırır. |
| `mcp` | Agent Kontrol MCP sunucusunu stdio üzerinden başlat. Elle çalıştırılmaz; bağladığınız CLI çalıştırır. |
| `config [key] [value]` | Düzenlenebilir tüm ayarları göster, birini oku veya birini ayarla. Önemli flag'ler: `--json`. |
| `presets` | Kayıtlı run preset'lerini listele. Önemli flag'ler: `--json`. |
| `save-preset <run-id> <name> [description...]` | Canlı bir run'ı yeniden kullanılabilir bir preset olarak kaydet. |
| `start-preset <name>` | Bir preset'ten yeni bir run başlat. Önemli flag'ler: `--name <run>`, `--cwd <dir>`. |
| `delete-preset <name>` | Bir preset'i sil. Önemli flag'ler: `-y, --yes`. |
| `delete <agent-id>` | Sonlanmış bir agent'ın kaydını sil. Önemli flag'ler: `-y, --yes`. |
| `delete-run <run-id>` | Sonlanmış bir run'ı sil ve geçmişe arşivle. Önemli flag'ler: `-y, --yes`. |
| `history` | Arşivlenmiş (sonlanmış ve eskimiş) run'ları listele. Önemli flag'ler: `--json`. |
| `delete-history <id>` | Arşivlenmiş bir geçmiş kaydını sil. Önemli flag'ler: `-y, --yes`. |

`stop`, `kill` ve `delete` komutları yıkıcıdır. `--yes` veya `ALLOW_DESTRUCTIVE=1` olmadan çalışmayı reddederler.

## Agent Kontrol

ReevesAgents, bir AI CLI'sinin başka AI CLI'lerini oluşturup yönetmesine izin veren opsiyonel bir MCP sunucusuyla gelir: agent başlatma, prompt yapıştırma, tuş gönderme, çıktı okuma ve onay isteklerini sonuçlandırma. Bu bir orkestrasyon politikası değil, düz bir mekanizmadır: rol yok, özerk döngü yok, koordinasyon protokolü yok.

Varsayılan olarak kapalıdır. ReevesAgents bunu asla kendiliğinden bir CLI'ye bağlamaz.

Bunu TUI veya Web UI'daki **Agent Kontrol** ekranından açarsınız. Bu ekran, bu makinede MCP sunucusu barındırabilen CLI'leri (claude, codex, kimi, qwen, opencode, hermes) listeler; bağlamanıza, ayırmanıza ya da tümünü birden bağlamanıza izin verir. Bağlama, o CLI'nin kendi `mcp add` komutunu çalıştırır (örneğin `claude mcp add reevesagents -- reevesagents mcp`); ayırma, eşleşen remove komutunu çalıştırır. ReevesAgents yalnızca her CLI'nin kendi komutunu çağırır, sağlayıcı yapılandırma dosyalarını asla elle düzenlemez. OpenCode istisnadır: `mcp add`'i etkileşimlidir ve remove'u yoktur, bu yüzden ekran onu elle bağlanacak şekilde işaretler.

Bir CLI bağlandıktan sonra, her başladığında Agent Kontrol araçlarına sahip olur. Kurmak sizin açık seçiminizdir ve onay da o seçimin kendisidir. Bir run, baş roldeki kontrol eden CLI ile onun oluşturduğu agent'lardan oluşur; grubun tamamı, diğer her run gibi TUI ve Web UI'da görünür.

Oluşturulan worker'lar MCP'yi varsayılan olarak almaz; dolayısıyla başka agent oluşturamaz. Bir worker'ın kendi alt worker'larını yönetmesine izin vermek için MCP'yi aynı ekrandan o worker'ın CLI'sine de bağlayın. Koruma bariyerleri kaynak düzeyindedir: spawn aracı bir run'a ekleme yaptığında uygulanan run başına agent üst sınırı (`max_agents`) ve her agent'ın kendi tmux pane'inde gerçek bir CLI süreci olması.

Bağlı bir CLI neyi başlatabileceğini de keşfedebilir: `list_providers` aracı ve `reevesagents://providers` kaynağı, bu makinedeki sağlayıcıları id'leri, kurulum durumları, takma adları ve bilinen modelleriyle döndürür; böylece bir agent, `spawn`'a tahmin yerine gerçek bir id geçirir.

Tam tasarım ve araç listesi için [docs/mcp.md](../mcp.md) dosyasına bakın.

## Yapılandırma

Durum ve yapılandırma yerel JSON'dır. Veritabanı yok, daemon yok.

Durum `~/.reeves` altında tutulur:

```text
~/.reeves/
  config.json     global ayarlar (peek aralığı, dil, varsayılan izinler, limitler)
  presets/        kayıtlı run preset'leri
  runs/           aktif run başına bir klasör (run.json artı agents/<id>.json)
  history/        arşivlenmiş, sonlanmış ve eskimiş run'lar (history/runs/<id>.json)
```

İki ortam değişkeni varsayılanları geçersiz kılar; başlıca izole test veya çoklu profil kullanımı için:

- `REEVES_REGISTRY`: durum kökünü geçersiz kılar. `runs/`, `history/` ve `presets/` için dizin olarak `~/.reeves`'in yerini alır.
- `REEVES_CONFIG`: yapılandırma dosyasının yolunu geçersiz kılar. `~/.reeves/config.json`'un yerini alır.

Gizli bilgi tutabilecek metin alanları, duruma yazılmadan önce maskelenir.

## Örnekler

Bir projeyi her işe uyan CLI'lere dağıtın:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" --prompt "Backend, product copy, and a review pass."
```

Neyin canlı olduğunu listeleyin ve run id'sini alın:

```sh
reevesagents runs
reevesagents runs --json   # script dostu
```

Kabuktan çıkmadan tek bir agent'ı izleyin, size ihtiyaç duyduğunda da içine atlayın:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

İş bitince run'ın tamamını tek çağrıyla durdurun:

```sh
reevesagents stop "feature x" --yes
```

## Web UI

Web UI yereldir ve yalnızca loopback üzerinden çalışır.

```sh
reevesagents web
```

`127.0.0.1`'e bağlanır, ön planda çalışır ve siz durdurduğunuzda kapanır. Agent'lar sonrasında tmux'ta çalışmaya devam eder. Tarayıcıdan run oluşturabilir, agent ekleyebilir, sağlayıcı modellerini ve izin modlarını seçebilir, agent'ları durdurabilir, sonlanmış işleri silebilir ve gerçek CLI'ler çalışmaya devam ederken geçmişi inceleyebilirsiniz.

Web UI iki opsiyonel çalışma zamanı modülü kullanır: `ws` ve `@lydell/node-pty`. npm bunları varsayılan olarak kurar. CLI ve TUI bunlar olmadan da çalışır; `web` komutu neyin eksik olduğunu söyler.

Web UI'ye başka bir makineden ulaşmak için loopback portunu SSH üzerinden yönlendirin. Yerleşik bir tünel yoktur:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
# sonra tarayıcıda http://localhost:8080 adresini açın
```

## Sorun Giderme

**tmux kurulu değil.** ReevesAgents, pencere tabanlı gezinme için tmux'a ihtiyaç duyar. Kurun (`brew install tmux` veya `apt install tmux`) ve `reevesagents doctor` çalıştırın. TUI kendini `reeves` adlı bir tmux oturumuna otomatik sarar; bu davranışı atlamak için `REEVES_NO_TMUX_WRAPPER=1` ayarlayın.

**Bir sağlayıcı CLI'si eksik veya Doctor hata bildiriyor.** ReevesAgents yalnızca `PATH`'inizde bulunan ve kimliği doğrulanmış sağlayıcı CLI'lerini başlatır. Hangi sağlayıcıların algılandığını ve neyin başarısız olduğunu görmek için `reevesagents doctor` çalıştırın; sonra ihtiyacınız olan sağlayıcı CLI'sini kurun veya giriş yapın.

**Web UI eksik paket bildiriyor.** Web UI'nin `ws` ve `@lydell/node-pty` paketlerine ihtiyacı vardır. Platformda önceden derlenmiş bir `@lydell/node-pty` ikili dosyası yoksa veya kurulum opsiyonel bağımlılıkları atladıysa bunlar eksik kalabilir. Opsiyonel bağımlılıklar etkin olacak şekilde yeniden kurun, sonra `reevesagents doctor` çalıştırın.

**Port zaten kullanımda.** `reevesagents web` varsayılan olarak `8080` portunda başlar. Port doluysa sunucu, küçük bir aralık içindeki bir sonraki boş porta bağlanır ve seçtiği URL'yi yazdırır. Farklı bir başlangıç portu için `--port <n>` verin.

## Gerekli Değil

Normal, stabil agent run'ları için ReevesAgents'ta saklanan API anahtarına, veritabanına, Docker'a, arka plan servisine veya MCP kurulumuna ihtiyacınız yok. Kurulum pasiftir: stabil paketin postinstall script'i yoktur ve sağlayıcı yapılandırmasını yeniden yazmaz. Agent Kontrol MCP'sini bağlamak, sağlayıcı yapılandırmasına dokunan tek açık, opt-in adımdır; o da yalnızca her CLI'nin kendi `mcp add` komutu üzerinden yapılır.

## Katkıda Bulunma

Branch'ler ve pull request akışı için [CONTRIBUTING.md](../../.github/CONTRIBUTING.md), güvenlik açığı bildirmek için [SECURITY.md](../../.github/SECURITY.md), son değişiklikler için [CHANGELOG.md](../../CHANGELOG.md) dosyalarına bakın. Tasarım modeli [REEVESAGENTS_DESIGN.md](../REEVESAGENTS_DESIGN.md) dosyasında, katkıcı dokümanları [docs/](..) altındadır.

Son kullanıcıların geliştirme araç zincirine ihtiyacı yoktur. Katkıda bulunanlar depodaki pnpm, TypeScript, tsup, Vitest ve ESLint kurulumunu kullanır.

## Bağlantılar

- Web sitesi: https://reevesagents.mertkayacs.com
- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Releases: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](../../CHANGELOG.md)
- License: [Apache-2.0](../../LICENSE)

## Lisans

Apache-2.0
