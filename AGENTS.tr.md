# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · **Türkçe** · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

Bir AI kodlama agent'ının ReevesAgents'ı nasıl çalıştırdığı. Bu dosya aracın kendisi için operatör rehberidir.
Agent'ları kendi projelerinizde nasıl davrandığını değiştirmez.

ReevesAgents, AI kodlama CLI'lerini (Claude Code, Codex, Kimi, Qwen, OpenCode, Hermes ve diğerleri) yan yana çalıştırır; her biri kendi tmux penceresinde gerçek bir CLI'dir. Bir agent diğerlerini oluşturabilir, yönlendirebilir ve denetleyebilir. Durum `~/.reeves` altında yerel JSON'da yaşar.
API anahtarı yok, veritabanı yok, arka plan daemon'u yok.

## İki kullanım yolu

1. **CLI'yi doğrudan çalıştırın.** `reevesagents spawn ...` komutu ile agent'ları başlatın, sonra
   `runs`, `peek`, `send` ve `stop` ile onları izleyin ve yönlendirin. Script'ler ve
   tek seferlik orkestrasyonlar için iyidir.
2. **Host CLI'niz diğerlerini MCP üzerinden çalıştırsın.** `reevesagents attach <cli>` bu
   CLI'ye agent kontrol araçları verir (spawn, send_text, read, kill, ...). CLI'nizi
   yeniden başlattıktan sonra, tek bir oturum bir takım oluşturabilir ve yönlendirebilir. Bu temel özelliktir. [docs/mcp.md](docs/mcp.md) dosyasına bakın.

## Önce kurulum kontrolü

```sh
reevesagents doctor
```

tmux, Node, `~/.reeves` durum klasörünü ve hangi sağlayıcı CLI'lerinin kurulu ve CLI uyumlu olduğunu bildirir
(her CLI'nin `--help` çıktısını inceler). Bir CLI'nin oturum açmış olup olmadığını test edemez, bu yüzden kurulu ama
oturum açmamış bir CLI hala burada başarılı olur. Agent'ları spawn etmeden önce çalıştırın,
böylece eksik bir CLI nedeniyle çalıştırma başarısız olmaz; `peek` (aşağı) bir pencereyi
login ekranında gösterirse onu yakalar. `reevesagents doctor --json` makinenin okunabilir JSON'sını döndürür.

Gereksinimler: Node 20.19+, tmux 3.0+ ve en az bir sağlayıcı CLI kurulu ve
kimliği doğrulanmış. macOS, Linux veya WSL (yerel Windows hedef değildir).

## Kurulum

```sh
pnpm add -g reevesagents     # veya: npm install -g reevesagents
```

Kurulum olmadan çalıştırma: `pnpm dlx reevesagents doctor`.

## Agent'ları oluştur

Her agent `provider[:nickname[:model]]` olarak yazılır; nickname ve model
isteğe bağlıdır. İlk agent lider, geri kalanı worker'dır.

```sh
# Claude Code lider, ikinci Claude Code reviewer, iki Codex worker, bir Kimi worker.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

Başlamadan önce `spawn` her adlandırılmış sağlayıcı CLI'nin PATH'de olup olmadığını kontrol eder ve
eksik olanları adlandırır, böylece yazım hatası veya kurulu olmayan bir CLI hızlı şekilde başarısız olur ve
kısmen başlamak yerine. Başarıda run id'yi, her agent'ın id'sini ve onları çalıştırmak için tam
`peek`/`send`/`open` komutlarını yazdırır.

Yararlı `spawn` flag'leri: `--name <run>`, `--cwd <dir>` (varsayılan bulunduğunuz dizin),
`--prompt <text>` (her agent'a yapıştırılır), `--skip` (agent'ları kendi izin istemlerini göstermeden başlat; hiçbir
insan onak vermek için orada yoksa kullan), `--run <run-id>`
(yeni bir çalıştırma başlatmak yerine var olan bir run'a agent ekle), `--json` (run ve
agent id'lerini metin yerine JSON olarak yazdır).

## Sağlayıcı id'leri ve takma adları

`reevesagents providers` komutunu çalıştırın (makine listesi için `--json` ekleyin). Herhangi bir takma ad spawn spec'inde sağlayıcı olarak çalışır.

| id         | sağlayıcı    | ortak takma adları                  |
| ---------- | ------------ | ----------------------------------- |
| `cc`       | Claude Code  | `claude`, `claude-code`             |
| `codex`    | Codex CLI    | `codex-cli`                         |
| `kimi`     | Kimi Code    | `kimi-code`                         |
| `qwen`     | Qwen Code    | `qwen-code`                         |
| `opencode` | OpenCode CLI | `open_code`                         |
| `hermes`   | Hermes       |                                     |
| `pi`       | Pi           |                                     |
| `aider`    | Aider        |                                     |
| `deepseek` | DeepSeek CLI | `deepseek-cli`                      |

## Çalışan agent'ları izle ve yönlendir

```sh
reevesagents runs                      # canlı run'ları listele (script'ler için --json ekle)
reevesagents agents <run-id>           # bir run'daki agent'ları listele
reevesagents peek <agent-id> -n 40     # bir agent'tan son çıktı
reevesagents send <agent-id> "do X"    # agent'ın prompt'una metin yapıştır
reevesagents key <agent-id> enter      # gönder (send gönderimi kendi başına yapmaz)
reevesagents interrupt <agent-id>      # agent'ı ctrl-c ile kes
reevesagents open <run-id|agent-id>    # tmux penceresine atla
```

`send` sadece yapıştırır; göndermek için `key <agent-id> enter` ile onu izleyin. `key` tarafından kabul edilen tuşlar:
`enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`, `right`,
`ctrl-c`.

## Temiz şekilde durdur

```sh
reevesagents stop <run-id> --yes       # tüm bir run'ı bitir ve tmux oturumunu kaldır
reevesagents kill <agent-id> --yes     # bir agent'ı bitir
```

`stop` ve `kill` tek yıkıcı komutlardır, bu yüzden `--yes` olmadan çalışmayı reddederler.

## Çalışan örnek: beş agent, sonra onları çalıştır

Senaryo "ReevesAgents kurun, iki Claude, iki Codex ve bir Kimi oluşturun ve onları çalıştırın"
baştan sona.

```sh
# 1. Beş CLI'nin kurulu ve uyumlu olduğunu doğrula.
reevesagents doctor

# 2. Takımı başlat. --skip böylece worker'lar kendi izin istemlerinde durmazlar.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. spawn her agent id'yi yazdırır. Tümünü listele, veya birini oku.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. Yönlendir: bir mesaj yapıştır, sonra gönder.
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. Daha sonra aynı run'a bir worker ekle.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. Bittiğinde run'ı bitir.
reevesagents stop <run-id> --yes
```

Host CLI'yi tmux kabuğu yerine MCP üzerinden çalıştırmak, aynı senaryo bir talimattır: "ReevesAgents
kullan bir takım başlatmak için, bir Claude Code lider, ikinci Claude Code reviewer, iki Codex worker (api ve tests) ve bir Kimi worker for docs. İzin istemlerini atla, onlara özeti ver, sonra ilerlemeyi izle ve bildir." Host spawn/read/send
araçlarını kendisi çağırır. [docs/mcp.md](docs/mcp.md) dosyasına bakın.

## Yap ve yapma

Yap:

- Bir spawn'dan önce `doctor` çalıştır ve her adlandırdığın sağlayıcı kurulu **ve
  oturum açmış** olduğundan emin ol. doctor oturum açmayı test edemez; eğer bir pencere takılırsa, `peek` login ekranını gösterir.
- `spawn`'ı fire-and-forget olarak değerlendir. Cevap değil id'ler döndürür. `runs`,
  `agents <run-id>` ve `peek <agent-id> -n 40` ile bir takımın ne yaptığını görmek için poll et.
- İki adımda input gönder: `send <agent-id> "..."` yapıştırır, `key <agent-id> enter` gönderir.
- `--skip` geçir hiçbir insan istemler onaylamak için orada yoksa, veya worker'lar ilk istemde takılırsa.
- `--json` kullan (spawn, runs, agents, providers, doctor üzerinde) bir script veya agent
  id'ler ve durum yerine metni okuması gerektiğinde.
- Sağlayıcıları id veya `reevesagents providers` komutundan herhangi bir takma ad ile adlandır (`cc` veya `claude`, `codex`, `kimi`, ...).

Yapma:

- `spawn`'ın bir agent'ın sonucunu geri verdiğini bekleme; takımı başlat, sonra okuyun.
- `send` gönderme ve çalıştığını varsayma; `key <agent-id> enter` ile gönderilene kadar hiçbir şey çalışmaz.
- Eksik veya oturum açmamış bir sağlayıcı oluşturma; spawn ilkini reddeder, ikinci
  bir pencereyi login isteminde park eder ki asla işi yapmaz.
- `--yes` olmadan `stop` veya `kill` çalıştırma; bunlar tek yıkıcı komutlardır.
- Yerel Windows'u hedef almama; tmux ve CLI'ler kurulu WSL içinde çalıştır.
- `--prompt` veya `send` içine gizli yapıştırma; çıktı yakalanır ve `peek` ve web UI aracılığı ile gösterilir.

## Script yazma notları

- `spawn`, `runs`, `agents`, `providers` ve `doctor` hepsi `--json` kabul eder.
- `spawn --json` run id'sini ve her agent id'sini yazdırır; onları yakala, veya `runs --json` ve
  `agents <run-id> --json` komutlarından geri oku.
- `REEVES_REGISTRY` ile durum klasörünü ve `REEVES_CONFIG` ile yapılandırma dosyasını geçersiz kıl
  bir script çalıştırmasını `~/.reeves` komutundan izole tutmak için.

## Daha fazla

- [README](README.md): tam özellik turu ve her komut.
- [docs/GUIDE.md](docs/GUIDE.md): adım adım kullanıcı rehberi.
- [docs/mcp.md](docs/mcp.md): agent kontrol MCP tasarımı ve araç listesi.
