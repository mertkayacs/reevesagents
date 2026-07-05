# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · **Türkçe** · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

Bir AI kodlama agent'ı ReevesAgents'ı nasıl yönetir, bu dosya onu anlatır. Aracın kendisi için yazılmış operatör rehberidir ve agent'ların kendi projelerinizdeki davranışını değiştirmez.

ReevesAgents, AI kodlama CLI'lerini (Claude Code, Codex, Kimi, Qwen, OpenCode, Hermes ve diğerleri) yan yana çalıştırır; her biri kendi tmux penceresinde gerçek bir CLI'dir. Bir agent diğerlerini oluşturabilir, yönlendirebilir ve denetleyebilir. Durum, `~/.reeves` altında yerel JSON olarak tutulur. API anahtarı yok, veritabanı yok, arka plan daemon'u yok.

## İki kullanım yolu

1. **CLI'yi doğrudan kullan.** Agent'ları `reevesagents spawn ...` ile başlat; sonra `runs`, `peek`, `send` ve `stop` ile izleyip yönlendir. Script'ler ve tek seferlik orkestrasyon için uygundur.
2. **Host CLI diğerlerini MCP üzerinden yönetsin.** `reevesagents attach <cli>`, o CLI'ye bir dizi agent kontrol aracı verir (spawn, send_text, read, kill, ...). CLI'yi yeniden başlattıktan sonra tek bir oturum bir takım oluşturup yönlendirebilir. Temel özellik budur. Bkz. [docs/mcp.md](docs/mcp.md).

## Önce kurulum kontrolü

```sh
reevesagents doctor
```

tmux'u, Node'u, `~/.reeves` durum dizinini ve hangi sağlayıcı CLI'lerinin kurulu ve CLI uyumlu olduğunu raporlar (her CLI'nin `--help` çıktısına bakar). Bir CLI'nin oturum açıp açmadığını test edemez; kurulu ama oturumu kapalı bir CLI buradan yine geçer. Spawn'dan önce çalıştır ki run eksik bir CLI yüzünden başarısız olmasın; login ekranında bekleyen bir pencereyi de `peek` (aşağıda) yakalar. `reevesagents doctor --json` aynı çıktıyı makine tarafından okunabilir JSON olarak döndürür.

Gereksinimler: Node 20.19+, tmux 3.0+ ve kurulu, oturum açılmış en az bir sağlayıcı CLI. macOS, Linux veya WSL (yerel Windows hedef değildir).

## Kurulum

```sh
pnpm add -g reevesagents     # veya: npm install -g reevesagents
```

Kurulumsuz çalıştırma: `pnpm dlx reevesagents doctor`.

## Agent'ları oluştur

Her agent `provider[:nickname[:model]]` biçiminde yazılır; nickname ve model isteğe bağlıdır. İlk agent run'ın lead'idir; geri kalanı worker olarak katılır.

```sh
# Bir Claude Code lead, ikinci bir Claude Code reviewer, iki Codex worker, bir Kimi worker.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

`spawn`, bir şey başlatmadan önce adı geçen her sağlayıcı CLI'nin PATH'te olduğunu doğrular ve eksik olanları söyler; böylece bir yazım hatası ya da kurulu olmayan bir CLI, run'ı yarım başlatmak yerine hemen başarısız olur. Başarı durumunda run id'sini, her agent'ın id'sini ve onları yönetmek için gereken `peek`/`send`/`open` komutlarını aynen yazdırır.

İşe yarar `spawn` flag'leri: `--name <run>`, `--cwd <dir>` (varsayılanı geçerli dizin), `--prompt <text>` (başlangıçta her agent'a yapıştırılır), `--skip` (agent'ları kendi izin istemleri olmadan başlat; onaylayacak bir insan yokken kullan), `--run <run-id>` (yeni bir run başlatmak yerine agent'ları var olan bir run'a ekle), `--json` (run ve agent id'lerini metin yerine JSON olarak yazdır).

## Sağlayıcı id'leri ve takma adları

`reevesagents providers` çalıştır (makine listesi için `--json` ekle). Spawn spec'inde sağlayıcı olarak herhangi bir takma ad geçer.

| id         | sağlayıcı    | yaygın takma adlar          |
| ---------- | ------------ | --------------------------- |
| `cc`       | Claude Code  | `claude`, `claude-code`     |
| `codex`    | Codex CLI    | `codex-cli`                 |
| `kimi`     | Kimi Code    | `kimi-code`                 |
| `qwen`     | Qwen Code    | `qwen-code`                 |
| `opencode` | OpenCode CLI | `open_code`                 |
| `hermes`   | Hermes       |                             |
| `pi`       | Pi           |                             |
| `aider`    | Aider        |                             |
| `deepseek` | DeepSeek CLI | `deepseek-cli`              |

## Çalışan agent'ları izle ve yönlendir

```sh
reevesagents runs                      # canlı run'ları listele (script'ler için --json ekle)
reevesagents agents <run-id>           # bir run'daki agent'ları listele
reevesagents peek <agent-id> -n 40     # bir agent'ın son çıktısı
reevesagents send <agent-id> "do X"    # agent'ın prompt'una metin yapıştır
reevesagents key <agent-id> enter      # gönder (send kendi başına göndermez)
reevesagents interrupt <agent-id>      # agent'a ctrl-c gönder
reevesagents open <run-id|agent-id>    # tmux penceresine atla
reevesagents approvals                 # bekleyen onay istekleri (--json eklenebilir)
reevesagents approve <approval-id>     # birini onaylar; deny <approval-id> reddeder
```

`send` yalnızca yapıştırır; göndermek için ardından `key <agent-id> enter` çalıştır. `key`'in kabul ettiği tuşlar: `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`, `right`, `ctrl-c`.

## Temiz şekilde durdur

```sh
reevesagents stop <run-id> --yes       # run'ın tamamını bitir ve tmux oturumunu kaldır
reevesagents kill <agent-id> --yes     # tek bir agent'ı bitir
```

`stop` ve `kill`, `--yes` olmadan çalışmayı reddeder. Aynı kural temizlik komutları için de geçerli: `delete <agent-id>` ve `delete-run <run-id>` sonlanmış kayıtları, `delete-history <id>` ise arşivlenmiş bir kaydı siler.

## Somut bir örnek: beş agent, sonra hepsini yönet

"reevesagents'ı kur, iki Claude, iki Codex ve bir Kimi spawn et, hepsini işe koş" senaryosu, baştan sona.

```sh
# 1. Beş CLI'nin kurulu ve uyumlu olduğunu doğrula.
reevesagents doctor

# 2. Takımı başlat. --skip: worker'lar kendi izin istemlerinde durmasın.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. spawn her agent'ın id'sini yazdırır. Hepsini listele ya da birini oku.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. Yönlendir: bir mesaj yapıştır, sonra gönder.
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. Aynı run'a sonradan bir worker ekle.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. İş bitince run'ı sonlandır.
reevesagents stop <run-id> --yes
```

Aynı senaryoyu kabuk yerine bir host CLI'den MCP üzerinden yönetince iş tek bir talimata iner: "reevesagents ile bir takım başlat: bir Claude Code lead, ikinci bir Claude Code reviewer, iki Codex worker (api ve tests) ve dokümantasyon için bir Kimi worker. İzin istemlerini atla, brief'i ver, sonra ilerlemeyi izleyip raporla." spawn/read/send araçlarını host kendisi çağırır. Bkz. [docs/mcp.md](docs/mcp.md).

## Yap ve yapma

Yap:

- Spawn'dan önce `doctor` çalıştır ve adını verdiğin her sağlayıcının kurulu **ve oturum açmış** olduğundan emin ol. doctor oturum açmayı test edemez; bir pencere takılı kalırsa login ekranını `peek` gösterir.
- `spawn`'ı fire-and-forget olarak ele al. Cevap değil, id döndürür. Bir takımın ne yaptığını görmek için `runs`, `agents <run-id>` ve `peek <agent-id> -n 40` ile poll et.
- Girdiyi iki adımda gönder: `send <agent-id> "..."` yapıştırır, `key <agent-id> enter` gönderir.
- İstemleri onaylayacak bir insan olmayacaksa `--skip` geçir; yoksa worker'lar ilk istemde takılıp kalır.
- Bir script'in ya da bir agent'ın metin yerine id ve durum okuması gerektiğinde (`spawn`, `runs`, `agents`, `providers`, `doctor` üzerinde) `--json` kullan.
- Sağlayıcıları id ile ya da `reevesagents providers` çıktısındaki herhangi bir takma adla adlandır (`cc` veya `claude`, `codex`, `kimi`, ...).

Yapma:

- `spawn`'ın bir agent'ın sonucunu geri vermesini bekleme; takımı başlat, sonra oku.
- `send` deyip çalıştığını varsayma; `key <agent-id> enter` gelene kadar hiçbir şey gönderilmez.
- Eksik ya da oturum açmamış bir sağlayıcıyı spawn etme; ilkini spawn reddeder, ikincisi ise pencereyi asla işe koyulmayacak bir login isteminde bekletir.
- `stop`, `kill` veya `delete` komutlarını `--yes` olmadan çalıştırma; yıkıcı olanlar bunlardır.
- Yerel Windows'u hedefleme; tmux'un ve CLI'lerin kurulu olduğu bir WSL içinde çalış.
- `--prompt`'a veya `send`'e gizli bilgi yapıştırma; çıktı yakalanır ve `peek` ile web UI üzerinden gösterilir.

## Script yazma notları

- `spawn`, `runs`, `agents`, `providers` ve `doctor` komutlarının hepsi `--json` kabul eder.
- `spawn --json` run id'sini ve her agent'ın id'sini yazdırır; bunları yakala ya da `runs --json` ve `agents <run-id> --json` çıktısından geri oku.
- Script'le yürütülen bir run'ı `~/.reeves` dizininden izole tutmak için durum dizinini `REEVES_REGISTRY` ile, yapılandırma dosyasını `REEVES_CONFIG` ile geçersiz kıl.

## Daha fazlası

- [README](README.md): özelliklerin tam turu ve her komut.
- [docs/GUIDE.md](docs/GUIDE.md): adım adım kullanıcı rehberi.
- [docs/mcp.md](docs/mcp.md): agent kontrol MCP tasarımı ve araç listesi.
