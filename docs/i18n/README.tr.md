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
  <a href="https://reevesagents.mertkayacs.com/demo"><b>Demo</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/docs"><b>Dokümanlar</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/faq"><b>SSS</b></a> ·
  <a href="https://github.com/mertkayacs/reevesagents/issues"><b>Issue'lar</b></a>
</p>

[English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · **Türkçe** · [Русский](README.ru.md) · [简体中文](README.zh-Hans.md) · [العربية](README.ar.md)

ReevesAgents, AI kodlama CLI'leri için yerel bir çalışma alanıdır. Claude Code,
Codex, OpenCode, Hermes, Kimi, DeepSeek, Qwen, Pi, Aider ve diğer sağlayıcı
CLI'lerini tmux içinde yan yana çalıştırır. Onu sıradan bir CLI/TUI/Web UI olarak
kullanabilir ya da isteğe bağlı MCP'sini bağlayarak bir agent'ın geri kalanları
başlatmasını, okumasını, yönlendirmesini ve durdurmasını sağlayabilirsiniz.

Sağlayıcı girişi her sağlayıcı CLI'sinin kendi içinde kalır. ReevesAgents kendi durumunu
`~/.reeves` altındaki birkaç düz JSON dosyasında tutar ve yalnızca siz ya da bağlı bir CLI
onu kullanırken çalışır.

## Hızlı Başlangıç

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

CLI'den bir run başlatın:

```sh
reevesagents spawn claude-code:lead codex:tests hermes:research \
  --name "release check" \
  --prompt "Review the release path, test coverage, and docs."
```

Web UI'yi açın:

```sh
reevesagents web
```

Bağladığınız bir agent diğerlerini yönetsin:

```sh
reevesagents attach codex
reevesagents hosts
```

MCP araçlarını yüklemesi için `attach` sonrasında o CLI'yi yeniden başlatın.

## Size Neler Sunar

| Yüzey | Ne için kullanılır |
| --- | --- |
| **TUI** | Terminal içinde, klavyeyle run yönetimi. |
| **Web UI** | Run'ların, pane'lerin, agent'ların, onayların ve geçmişin yerel, görsel görünümü. |
| **CLI** | Script'ler, hızlı kontroller, agent başlatma, durum temizliği ve tmux pencerelerine geçiş. |
| **Agent Kontrolü MCP** | Güvendiğiniz bir CLI, yerel araçlar üzerinden başka CLI'leri başlatıp yönetebilir. |
| **tmux** | UI kapandıktan sonra da çalışmaya devam eden gerçek sağlayıcı CLI pencereleri. |

ReevesAgents baştan yerel çalışmak üzere tasarlandı. Durum `~/.reeves` altında düz JSON
olarak tutulur ve başlattığı CLI'ler, zaten elle kullandığınız CLI'lerin aynısıdır.

<a id="install"></a>
<details>
<summary><strong>Kurulum</strong></summary>

ReevesAgents için Node.js `20.19+`, tmux `3.0+` ve kurulu, girişi yapılmış en az bir
desteklenen sağlayıcı CLI'si gerekir. macOS, Linux ve WSL üzerinde çalışır.

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

Belirli bir sürümü sabitlemek için `<version>` yerine sürüm numarasını yazın:

```sh
pnpm add -g reevesagents@<version>
```

Kaynaktan kurulum:

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
<summary><strong>Ekran görüntüleri</strong></summary>

TUI ve Web UI aynı yerel run'ları yönetir:

![ReevesAgents TUI: dil seçici, karşılama menüsü ve doctor](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI: run'lar ve canlı agent pane'leri](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-tr.png)

![ReevesAgents Web UI: yeni bir run başlatma](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-tr.png)

</details>

<a id="commands"></a>
<details>
<summary><strong>Komutlar</strong></summary>

Argümansız çalıştırıldığında TUI açılır.

| Komut | Amaç |
| --- | --- |
| `reevesagents` | TUI'yi açar. |
| `spawn [spec...]` | Bir run başlatır. Her spec `provider[:nickname[:model]]` biçimindedir. |
| `add [spec...]` | En son aktif run'a agent ekler. |
| `runs` | Aktif run'ları listeler. |
| `agents [run-id]` | Tüm run'lardaki ya da tek bir run'daki agent'ları listeler. |
| `open <id>` | Bir run'ın ya da agent'ın tmux penceresine geçer. |
| `peek <agent-id>` | Bir agent'ın son çıktısını yazdırır. |
| `send <agent-id> <text...>` | Bir agent'a metni göndermeden yapıştırır. |
| `key <agent-id> <key>` | `enter`, `escape`, ok tuşları, `tab`, `space`, `backspace` ya da `ctrl-c` gönderir. |
| `interrupt <agent-id>` | Bir agent'a Ctrl-C gönderir. |
| `stop <run-id>` | Bir run'ı durdurur. `--yes` ya da `ALLOW_DESTRUCTIVE=1` gerekir. |
| `kill <agent-id>` | Tek bir agent'ı durdurur. `--yes` ya da `ALLOW_DESTRUCTIVE=1` gerekir. |
| `setup` | İlk çalıştırma kontrolü. `--attach` kurulu tüm host CLI'lere bağlanır. |
| `doctor` | Node, tmux, durum dizini ve sağlayıcı CLI'lerini kontrol eder. |
| `web` | Yalnızca loopback üzerinde dinleyen Web UI'yi başlatır. |
| `providers` | Sağlayıcı id'lerini, takma adları, modelleri ve kullanılabilirliği listeler. |
| `approvals` | Bekleyen onay isteklerini listeler. |
| `approve` / `deny` | Bir onay isteğini sonuçlandırır. |
| `hosts` | ReevesAgents'ın hangi host CLI'lere bağlı olduğunu gösterir. |
| `attach [cli]` | Agent Kontrolü MCP'sini bir host CLI'ye ya da kurulu tüm host'lara bağlar. |
| `detach <cli>` | Bu MCP bağlantısını bir host CLI'den kaldırır. |
| `skills [action]` | ReevesAgents skill'ini kurar, kaldırır ya da inceler. |
| `mcp` | MCP sunucusunu stdio üzerinden başlatır. Bunu host CLI'ler çalıştırır. |
| `config [key] [value]` | Düzenlenebilir ayarları gösterir ya da günceller. |
| `presets` | Kayıtlı run ön ayarlarını listeler. |
| `save-preset` | Canlı bir run'ı ön ayar olarak kaydeder. |
| `start-preset` | Bir ön ayardan run başlatır. |
| `delete-preset` | Bir ön ayarı siler. |
| `delete` | Sonlanmış bir agent kaydını siler. Onay ister. |
| `delete-run` | Sonlanmış bir run'ı siler ve arşivler. Onay ister. |
| `history` | Arşivlenmiş run'ları listeler. |
| `delete-history` | Arşivdeki bir geçmiş kaydını siler. Onay ister. |
| `reap` | Zombi agent'ları ve `max_lifetime_ms` süresini aşanları sonlandırır, hiçbir run kaydına ait olmayan sahipsiz tmux oturumlarını kapatır. |

Sık kullanılan flag'ler:

- `--json`: script'lerin kullandığı listeleme ve işlem komutlarında bulunur.
- `--name <name>`: run'a ad verir.
- `--cwd <dir>`: agent'ları belirtilen dizinde çalıştırır.
- `--prompt <text>`: başlatılan her agent'a açılışta bu metni yapıştırır.
- `--skip`: gözetimsiz worker'lar için sağlayıcının izin istemlerini atlar.
- `--run <run-id>`: agent'ları belirli bir run'a ekler.
- `--port <n>` ve `--no-open`: Web UI başlatma seçenekleri.

</details>

<a id="agent-control"></a>
<details>
<summary><strong>Agent Kontrolü</strong></summary>

Agent Kontrolü isteğe bağlı bir MCP sunucusudur. Onu yalnızca yerel araçları
kullanmasına güvendiğiniz bir CLI'ye bağlayın:

```sh
reevesagents attach claude
reevesagents hosts
```

Yeniden başlattıktan sonra o CLI; `spawn`, `read`, `send_text`, `send_key`,
`interrupt`, `kill` ve `stop` araçlarını, ayrıca onayları ve ön ayarları yönetmek
ve host'ları incelemek için araçları alır. Sağlayıcı kataloğu da
`reevesagents://providers` olarak sunulur.

Worker'lar MCP'yi varsayılan olarak almaz. Bir worker'ın kendi worker'larını
oluşturması gerekiyorsa ReevesAgents'ı o worker'ın CLI'sine ayrıca bağlayın.

Codex, MCP çağrılarını varsayılan olarak sandbox içinde çalıştırır ve bu da tmux
başlatmalarını engeller. Agent'ları yöneten host olarak Codex kullanıyorsanız onu tam
erişimle çalıştırın, örneğin `codex --sandbox danger-full-access` ile, ya da
`sandbox_mode = "danger-full-access"` ayarlayan bir Codex profili kullanın.

Araçların tam referansı: [docs/mcp.md](../mcp.md). Agent'lar için yazılmış operatör
rehberi: [AGENTS.md](../../AGENTS.tr.md).

</details>

<a id="configuration"></a>
<details>
<summary><strong>Yapılandırma</strong></summary>

Durum `~/.reeves` altında tutulur:

```text
~/.reeves/
  config.json
  presets/
  runs/
  history/
```

Varsayılan yolları iki ortam değişkeni geçersiz kılar:

- `REEVES_REGISTRY`: `runs/`, `history/` ve `presets/` için durum kökünü değiştirir.
- `REEVES_CONFIG`: config dosyasının yolunu değiştirir.

Her tmux sunucusu için tek bir kayıt dizini kullanın. Arka plandaki sahipsiz oturum
taraması, bir oturumun kime ait olduğuna o anki kayıt dizinine bakarak karar verir.
Bu yüzden iki kayıt dizini aynı tmux sunucusunu paylaşmamalı.

Gizli bilgi içerebilecek her şey bir dosyaya yazılmadan önce temizlenir.

</details>

<a id="examples"></a>
<details>
<summary><strong>Örnekler</strong></summary>

Bir projeyi birkaç CLI'ye dağıtın:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" \
  --prompt "Backend, product copy, and a review pass."
```

Bir agent'ı izleyin, sonra penceresini açın:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

İş bitince run'ı durdurun:

```sh
reevesagents stop "feature x" --yes
```

</details>

<a id="web-ui"></a>
<details>
<summary><strong>Web UI</strong></summary>

```sh
reevesagents web
```

Web UI yalnızca `127.0.0.1` adresine bağlanır ve ön planda çalışır. Agent'lar tmux
içinde yaşadığı için sayfa kapandıktan sonra da çalışmaya devam eder.

Web UI, isteğe bağlı iki çalışma zamanı modülü kullanır: `ws` ve `@lydell/node-pty`.
npm bunları varsayılan olarak kurar. CLI ve TUI komutları bu modüller olmadan da
çalışır; eksik olan bir şey varsa `reevesagents web` bunu açıklar.

Başka bir makineden erişmek için loopback portunu SSH ile yönlendirin:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
```

</details>

<a id="troubleshooting"></a>
<details>
<summary><strong>Sorun giderme</strong></summary>

**tmux kurulu değil.** tmux'u kurun ve `reevesagents doctor` çalıştırın. TUI
kendini otomatik olarak `reeves` adlı bir tmux oturumuna sarar; bunu istemiyorsanız
`REEVES_NO_TMUX_WRAPPER=1` ayarlayın.

**Bir sağlayıcı CLI'si eksik ya da oturumu kapalı.** ReevesAgents, `PATH` üzerinde
bulunan ve girişi yapılmış sağlayıcı CLI'lerini başlatır. Neyin algılandığını
`reevesagents doctor` gösterir. Başlatılan bir pencere girişte bekliyorsa bunu `peek`
ile görürsünüz.

**Web UI eksik paket bildiriyor.** İsteğe bağlı bağımlılıklar etkin olacak şekilde
yeniden kurun, ardından `reevesagents doctor` çalıştırın.

**Port zaten kullanımda.** `reevesagents web` varsayılan olarak `8080` portunda
başlar. Bu port doluysa sunucu küçük bir aralıktaki sıradaki boş porta bağlanır ve
URL'yi yazdırır.

</details>

<a id="contributing"></a>
<details>
<summary><strong>Katkıda bulunma</strong></summary>

Katkıcı dokümanları [docs/](..) altında. İşe
[CONTRIBUTING.md](../../.github/CONTRIBUTING.md), [testing](../testing.md) ve
[releasing](../releasing.md) ile başlayın.

Son kullanıcıların geliştirme araç zincirine ihtiyacı yoktur. Katkıda bulunanlar
depodaki pnpm, TypeScript, tsup, Vitest ve ESLint kurulumunu kullanır.

</details>

## Bağlantılar

- Web sitesi: https://reevesagents.mertkayacs.com
- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Sürümler: https://github.com/mertkayacs/reevesagents/releases
- Issue'lar: https://github.com/mertkayacs/reevesagents/issues
- Değişiklik günlüğü: [CHANGELOG.md](../../CHANGELOG.md)
- Lisans: [Apache-2.0](../../LICENSE)
